import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ATTEMPTS = 5; // per code
const LOCK_FAILURES = 10; // failed attempts across codes...
const LOCK_WINDOW_MS = 15 * 60 * 1000; // ...within this window lock verification for this long

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Compares two hex digests without stopping at the first differing character.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

// Failed attempts across all of the user's codes in the lock window.
async function recentFailures(admin: SupabaseClient, userId: string): Promise<{ count: number; latest: number }> {
  const since = new Date(Date.now() - LOCK_WINDOW_MS).toISOString();
  const { data } = await admin
    .from("mfa_codes")
    .select("attempts, last_failed_at")
    .eq("user_id", userId)
    .gte("last_failed_at", since);
  const rows = data ?? [];
  return {
    count: rows.reduce((sum, r) => sum + (r.attempts ?? 0), 0),
    latest: rows.length ? Math.max(...rows.map((r) => new Date(r.last_failed_at).getTime())) : 0,
  };
}

const secondsUntil = (ms: number) => Math.max(1, Math.ceil((ms - Date.now()) / 1000));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await anonClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Not authenticated" }, 401);
    }
    const user = userData.user;

    const { code, rememberDevice } = await req.json().catch(() => ({}));
    if (!code || typeof code !== "string") {
      return json({ error: "Code is required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const before = await recentFailures(admin, user.id);
    if (before.count >= LOCK_FAILURES) {
      return json({
        error: "Too many incorrect codes. Please wait before trying again.",
        locked: true,
        retryAfterSeconds: secondsUntil(before.latest + LOCK_WINDOW_MS),
      }, 429);
    }

    const { data: pending } = await admin
      .from("mfa_codes")
      .select("id, code_hash, attempts, expires_at, consumed")
      .eq("user_id", user.id)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
      return json({ error: "Code expired. Please request a new one." }, 400);
    }

    if (pending.attempts >= MAX_ATTEMPTS) {
      return json({ error: "Too many attempts. Please request a new code." }, 429);
    }

    const codeHash = await sha256Hex(code.trim());
    if (!constantTimeEqual(codeHash, pending.code_hash)) {
      // Atomic: UPDATE ... WHERE attempts < MAX; null means the code was already used up.
      const { data: newAttempts } = await admin.rpc("mfa_register_failed_attempt", {
        p_code_id: pending.id,
        p_max_attempts: MAX_ATTEMPTS,
      });
      if (newAttempts === null) {
        return json({ error: "Too many attempts. Please request a new code." }, 429);
      }
      if (before.count + 1 >= LOCK_FAILURES) {
        await admin.from("audit_log").insert({
          actor_id: user.id,
          action: "mfa_locked",
          target_user_id: user.id,
          details: { failures: before.count + 1, window_minutes: LOCK_WINDOW_MS / 60000 },
        });
        return json({
          error: "Too many incorrect codes. Verification is locked for 15 minutes.",
          locked: true,
          retryAfterSeconds: LOCK_WINDOW_MS / 1000,
        }, 429);
      }
      return json({ error: "Incorrect code. Please try again." }, 400);
    }

    // Consume exactly once: a concurrent request using the same code gets nothing back.
    const { data: consumedRows } = await admin
      .from("mfa_codes")
      .update({ consumed: true })
      .eq("id", pending.id)
      .eq("consumed", false)
      .select("id");
    if (!consumedRows || consumedRows.length === 0) {
      return json({ error: "Code expired. Please request a new one." }, 400);
    }

    let deviceToken: string | null = null;
    if (rememberDevice) {
      deviceToken = randomToken();
      const tokenHash = await sha256Hex(deviceToken);
      await admin.from("trusted_devices").insert({
        user_id: user.id,
        token_hash: tokenHash,
        user_agent: req.headers.get("User-Agent") ?? null,
        expires_at: new Date(Date.now() + DEVICE_TTL_MS).toISOString(),
      });
    }

    return json({ success: true, deviceToken });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected error" }, 500);
  }
});

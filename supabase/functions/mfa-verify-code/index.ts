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

// Session id of the caller's access token. Only read after getUser() has validated the token.
function sessionIdFrom(authHeader: string): string | null {
  const payload = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return typeof claims.session_id === "string" ? claims.session_id : null;
  } catch {
    return null;
  }
}

// Records that this auth session passed MFA, so the database lets it read data.
async function markSessionVerified(
  admin: SupabaseClient,
  authHeader: string,
  userId: string,
  method: "code" | "trusted_device" | "recovery",
): Promise<boolean> {
  const { data, error } = await admin.rpc("mfa_mark_session_verified", {
    p_session_id: sessionIdFrom(authHeader),
    p_user_id: userId,
    p_method: method,
  });
  if (error) console.error("Could not record verified session", error);
  return !error && data === true;
}

async function rememberThisDevice(admin: SupabaseClient, userId: string, userAgent: string | null): Promise<string> {
  const deviceToken = randomToken();
  await admin.from("trusted_devices").insert({
    user_id: userId,
    token_hash: await sha256Hex(deviceToken),
    user_agent: userAgent,
    expires_at: new Date(Date.now() + DEVICE_TTL_MS).toISOString(),
  });
  return deviceToken;
}

// Recovery codes are shown as XXXXX-XXXXX; accept any case, spaces or dashes.
const normalizeRecoveryCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

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

    const { code, recoveryCode, rememberDevice } = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const userAgent = req.headers.get("User-Agent") ?? null;

    // A one-time recovery code from the school office replaces the emailed code (e.g. the
    // email budget ran out or the inbox is unreachable). It works even while email-code
    // verification is locked; each code has its own 5-attempt limit and 24-hour expiry.
    if (typeof recoveryCode === "string" && recoveryCode.trim()) {
      const normalized = normalizeRecoveryCode(recoveryCode);
      if (normalized.length !== 10) {
        return json({ error: "Recovery codes look like ABCDE-FGH23." }, 400);
      }
      const { data: consumed, error: consumeError } = await admin.rpc("mfa_consume_recovery_code", {
        p_user_id: user.id,
        p_code_hash: await sha256Hex(normalized),
      });
      if (consumeError) {
        console.error(consumeError);
        return json({ error: "Could not check the recovery code. Please try again." }, 500);
      }
      if (consumed !== true) {
        return json({ error: "Invalid or expired recovery code." }, 400);
      }
      await admin.from("audit_log").insert({
        actor_id: user.id,
        action: "mfa_recovery_code_used",
        target_user_id: user.id,
        details: {},
      });
      const sessionRecorded = await markSessionVerified(admin, authHeader, user.id, "recovery");
      const deviceToken = rememberDevice ? await rememberThisDevice(admin, user.id, userAgent) : null;
      return json({ success: true, deviceToken, sessionRecorded });
    }

    if (!code || typeof code !== "string") {
      return json({ error: "Code is required" }, 400);
    }

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

    const sessionRecorded = await markSessionVerified(admin, authHeader, user.id, "code");
    const deviceToken = rememberDevice ? await rememberThisDevice(admin, user.id, userAgent) : null;

    return json({ success: true, deviceToken, sessionRecorded });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected error" }, 500);
  }
});

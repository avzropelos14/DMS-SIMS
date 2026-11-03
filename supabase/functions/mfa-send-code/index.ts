import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Body: { deviceToken?, checkOnly?, resend? }
//   checkOnly: only report { trusted } — never creates a code or sends email (used on page refresh).
//   default:   reuse an unexpired unconsumed code (no email) or create + email a new one.
//   resend:    always create + email a new one, subject to the cooldown and the cap.
// Email is the scarcest free resource (Resend: 100/day), hence the reuse, cooldown and cap.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_ADDRESS = "Dumaguete Mission SIMS <dumaguetemissionschool@dmsis.app>";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;
const CODE_CAP = 3; // codes per user per window
const CODE_CAP_WINDOW_MS = 15 * 60 * 1000;
const LOCK_FAILURES = 10; // failed attempts across codes...
const LOCK_WINDOW_MS = 15 * 60 * 1000; // ...within this window lock verification for this long

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Uniform 6-digit code from the CSPRNG (rejection sampling avoids modulo bias).
function generateCode(): string {
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return (buf[0] % 1_000_000).toString().padStart(6, "0");
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

// Returns the time verification unlocks, or null when not locked.
async function lockedUntil(admin: SupabaseClient, userId: string): Promise<number | null> {
  const since = new Date(Date.now() - LOCK_WINDOW_MS).toISOString();
  const { data } = await admin
    .from("mfa_codes")
    .select("attempts, last_failed_at")
    .eq("user_id", userId)
    .gte("last_failed_at", since);
  const rows = data ?? [];
  const failures = rows.reduce((sum, r) => sum + (r.attempts ?? 0), 0);
  if (failures < LOCK_FAILURES) return null;
  const latest = Math.max(...rows.map((r) => new Date(r.last_failed_at).getTime()));
  return latest + LOCK_WINDOW_MS;
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
    const email = user.email;
    if (!email) {
      return json({ error: "Account has no email on file" }, 400);
    }

    const { deviceToken, checkOnly, resend } = await req.json().catch(() => ({}));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (deviceToken && typeof deviceToken === "string") {
      const tokenHash = await sha256Hex(deviceToken);
      const { data: trusted } = await admin
        .from("trusted_devices")
        .select("id, expires_at")
        .eq("user_id", user.id)
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (trusted && new Date(trusted.expires_at).getTime() > Date.now()) {
        await admin
          .from("trusted_devices")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", trusted.id);
        return json({ trusted: true });
      }
    }

    if (checkOnly) {
      return json({ trusted: false });
    }

    const unlockAt = await lockedUntil(admin, user.id);
    if (unlockAt) {
      return json({
        error: "Too many incorrect codes. Please wait before trying again.",
        locked: true,
        retryAfterSeconds: secondsUntil(unlockAt),
      }, 429);
    }

    const { data: recent } = await admin
      .from("mfa_codes")
      .select("id, consumed, attempts, expires_at, created_at")
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - CODE_CAP_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false });
    const recentCodes = recent ?? [];
    const latest = recentCodes[0];
    const latestCreated = latest ? new Date(latest.created_at).getTime() : 0;

    // Reuse: an outstanding code was already emailed; don't spend another email on it.
    if (!resend && latest && !latest.consumed && new Date(latest.expires_at).getTime() > Date.now()) {
      return json({
        trusted: false,
        sent: false,
        alreadySent: true,
        resendAvailableInSeconds: Math.max(0, Math.ceil((latestCreated + RESEND_COOLDOWN_MS - Date.now()) / 1000)),
      });
    }

    if (latest && Date.now() - latestCreated < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = secondsUntil(latestCreated + RESEND_COOLDOWN_MS);
      return json({ error: `Please wait ${retryAfterSeconds} seconds before requesting another code.`, retryAfterSeconds }, 429);
    }

    if (recentCodes.length >= CODE_CAP) {
      const oldest = new Date(recentCodes[recentCodes.length - 1].created_at).getTime();
      const retryAfterSeconds = secondsUntil(oldest + CODE_CAP_WINDOW_MS);
      return json({
        error: `Too many codes requested. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        retryAfterSeconds,
      }, 429);
    }

    const code = generateCode();
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    // Invalidate any previous outstanding codes for this user.
    await admin.from("mfa_codes").update({ consumed: true }).eq("user_id", user.id).eq("consumed", false);

    const { error: insertError } = await admin.from("mfa_codes").insert({
      user_id: user.id,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
    if (insertError) {
      return json({ error: "Could not generate code" }, 500);
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: email,
        subject: "Your SIMS login verification code",
        html: `<p>Your verification code is:</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>`,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      console.error("Resend send failed", emailRes.status, body);
      return json({ error: "Could not send verification email" }, 502);
    }

    return json({ trusted: false, sent: true, resendAvailableInSeconds: RESEND_COOLDOWN_MS / 1000 });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected error" }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// SMS through iProg SMS for exception events, plus the admin's SMS card in System Settings.
// Body: { kind, ref? }
//   pickup_rejected  ref = audit id of the refusal   (the guard who recorded it, within 10 min)
//   late_pickup      ref = late notice id             (the staff who sent it, within 10 min)
//   test             one SMS to the full admin's own employee phone
//   status           full admin: credits left, SMS sent today, daily cap (sends nothing)
// The database checks the caller made that event and claims each recipient once
// (claim_event_sms), so this can't be used to text arbitrary numbers. Every SMS takes one
// unit of the daily SMS cap (sms_budget_consume). The token is the IPROG_SMS_API_TOKEN secret.

const IPROG_TOKEN = Deno.env.get("IPROG_SMS_API_TOKEN") ?? "";
const IPROG_BASE = "https://www.iprogsms.com/api/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

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

async function sendSms(phone: string, message: string): Promise<{ ok: boolean; messageId: string | null }> {
  try {
    const res = await fetch(`${IPROG_BASE}/sms_messages`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_token: IPROG_TOKEN, phone_number: phone, message }),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    const ok = res.ok && (data.status === 200 || data.status === "200" || data.status === "success");
    if (!ok) console.error("iProg send failed", res.status, text.slice(0, 300));
    return { ok, messageId: typeof data.message_id === "string" ? data.message_id : null };
  } catch (err) {
    console.error("iProg send error", err);
    return { ok: false, messageId: null };
  }
}

type Recipient = { log_id: number; phone: string };
type Claim = {
  recipients?: Recipient[];
  student_name?: string;
  when?: string;
  school_phone?: string | null;
  no_phone?: boolean;
};

function compose(kind: string, c: Claim): string {
  const student = c.student_name ?? "Your child";
  const call = c.school_phone ? ` or call ${c.school_phone}` : "";
  if (kind === "late_pickup") {
    return `DMS-SIMS: ${student} is still at school at ${c.when}. Please pick them up as soon as possible${call}.`;
  }
  if (kind === "pickup_rejected") {
    return `DMS-SIMS: The guard refused a pickup of ${student} made with your QR code at ${c.when}. ` +
      `If it was not you, contact the school office right away${c.school_phone ? `: ${c.school_phone}` : ""}.`;
  }
  return "DMS-SIMS: Test message. SMS alerts from the school system are working.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const callerId = callerData.user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: mfaOk, error: mfaError } = await admin.rpc("mfa_check_session", {
      p_session_id: sessionIdFrom(authHeader),
      p_user_id: callerId,
    });
    if (mfaError || mfaOk !== true) {
      if (mfaError) console.error("MFA check failed", mfaError);
      return jsonResponse({ error: "Please verify your identity again: sign out and sign back in." }, 403);
    }

    let body: { kind?: string; ref?: string | number };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request" }, 400);
    }
    const kind = String(body.kind ?? "");
    const ref = String(body.ref ?? "");

    if (kind === "status") {
      const { data: profile } = await admin.from("profiles").select("role").eq("id", callerId).maybeSingle();
      if (profile?.role !== "full_admin") return jsonResponse({ error: "Forbidden" }, 403);
      const { data: usage } = await admin.rpc("sms_usage_today");
      let balance: number | null = null;
      if (IPROG_TOKEN) {
        try {
          const res = await fetch(`${IPROG_BASE}/account/sms_credits?api_token=${encodeURIComponent(IPROG_TOKEN)}`);
          const data = await res.json();
          const raw = data?.data?.load_balance;
          balance = typeof raw === "number" ? raw : raw != null && !isNaN(Number(raw)) ? Number(raw) : null;
        } catch (err) {
          console.error("iProg balance check failed", err);
        }
      }
      return jsonResponse({ configured: Boolean(IPROG_TOKEN), balance, ...(usage ?? {}) });
    }

    if (!["pickup_rejected", "late_pickup", "test"].includes(kind)) {
      return jsonResponse({ error: "Invalid request" }, 400);
    }
    if (kind !== "test" && !/^[0-9]{1,18}$/.test(ref)) {
      return jsonResponse({ error: "Invalid request" }, 400);
    }
    // Not set up yet: nothing is claimed, so nothing is lost.
    if (!IPROG_TOKEN) return jsonResponse({ success: true, sent: 0, reason: "not_configured" });

    const { data: claim, error: claimError } = await admin.rpc("claim_event_sms", {
      p_kind: kind,
      p_ref: ref,
      p_caller: callerId,
    });
    if (claimError) {
      console.error("Claim failed", claimError);
      return jsonResponse({ error: "Could not prepare the SMS." }, 500);
    }
    if (!claim) {
      return kind === "test" ? jsonResponse({ error: "Forbidden" }, 403) : jsonResponse({ success: true, sent: 0 });
    }
    const c = claim as Claim;
    if (c.no_phone) return jsonResponse({ success: true, sent: 0, reason: "no_phone" });

    const message = compose(kind, c);
    let sent = 0;
    let failed = 0;
    let budgetReached = false;
    for (const r of c.recipients ?? []) {
      if (budgetReached) {
        await admin.rpc("sms_record_result", { p_log_id: r.log_id, p_ok: false, p_message_id: null });
        continue;
      }
      const { data: within, error: budgetError } = await admin.rpc("sms_budget_consume");
      if (budgetError) console.error("SMS budget check failed", budgetError);
      if (within !== true) {
        budgetReached = true;
        await admin.rpc("sms_record_result", { p_log_id: r.log_id, p_ok: false, p_message_id: null });
        continue;
      }
      const result = await sendSms(r.phone, message);
      await admin.rpc("sms_record_result", { p_log_id: r.log_id, p_ok: result.ok, p_message_id: result.messageId });
      if (result.ok) sent++;
      else failed++;
    }
    return jsonResponse({ success: true, sent, failed, ...(budgetReached ? { reason: "daily_limit" } : {}) });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

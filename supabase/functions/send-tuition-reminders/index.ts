import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Tuition reminder SMS, run once a day (9:00 AM Manila) by the pg_cron job "sims-tuition-sms".
// In the last 5 days before a monthly installment is due, each guardian of a student whose
// installment for this month is not fully paid gets one SMS (claim_tuition_reminders decides
// who, and claims each so it is sent once a month). Reminders over the daily SMS cap, or that
// fail, are released and tried again the next day.
// Called only by pg_cron: the x-cron-secret header must match the Vault secret
// "sims_cron_secret" (verify_cron_secret). No user token, so verify_jwt is off for this function.

const IPROG_TOKEN = Deno.env.get("IPROG_SMS_API_TOKEN") ?? "";
const IPROG_BASE = "https://www.iprogsms.com/api/v1";
const MAX_PER_RUN = 30;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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

type Reminder = { log_id: number; phone: string; student_name: string; month: string; due: string; amount: string };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: allowed, error: secretError } = await admin.rpc("verify_cron_secret", {
      p_secret: req.headers.get("x-cron-secret") ?? "",
    });
    if (secretError) console.error("Cron secret check failed", secretError);
    if (allowed !== true) return jsonResponse({ error: "Forbidden" }, 403);

    // Not set up yet: nothing is claimed, so tomorrow's run starts fresh.
    if (!IPROG_TOKEN) return jsonResponse({ success: true, sent: 0, reason: "not_configured" });

    const { data: claimed, error: claimError } = await admin.rpc("claim_tuition_reminders", { p_limit: MAX_PER_RUN });
    if (claimError) {
      console.error("Claim failed", claimError);
      return jsonResponse({ error: "Could not prepare the reminders." }, 500);
    }

    let sent = 0;
    let failed = 0;
    let deferred = 0;
    let budgetReached = false;
    for (const r of (claimed ?? []) as Reminder[]) {
      if (!budgetReached) {
        const { data: within, error: budgetError } = await admin.rpc("sms_budget_consume");
        if (budgetError) console.error("SMS budget check failed", budgetError);
        if (within !== true) budgetReached = true;
      }
      if (budgetReached) {
        // Released: tried again tomorrow while still inside the reminder window.
        await admin.rpc("sms_record_result", { p_log_id: r.log_id, p_ok: false, p_message_id: null });
        deferred++;
        continue;
      }
      const message = `DMS-SIMS: Reminder: ${r.student_name}'s ${r.month} tuition installment ` +
        `(P${r.amount}) is due on ${r.due}. Please pay at the school cashier to avoid a late fee.`;
      const result = await sendSms(r.phone, message);
      await admin.rpc("sms_record_result", { p_log_id: r.log_id, p_ok: result.ok, p_message_id: result.messageId });
      if (result.ok) sent++;
      else failed++;
    }
    return jsonResponse({ success: true, sent, failed, deferred });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

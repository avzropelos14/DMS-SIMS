import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Exception email: a guard refused a pickup made with a guardian's QR code. The guardian who
// owns that code gets ONE email (in-app notifications already reach every guardian of the
// student). Called by the Guard Portal right after reject_pickup().
// Body: { audit_id }. The database checks that this guard recorded that refusal in the last
// 10 minutes and that it was not emailed before (claim_pickup_rejection_email), so the
// function can't be used to send arbitrary emails. Uses the daily "security" email budget.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = "Dumaguete Mission SIMS <dumaguetemissionschool@dmsis.app>";
// Generated logins (jdelacruz.student@missionschool.edu.ph) have no real inbox.
const SYNTHETIC_EMAIL_DOMAIN = "@missionschool.edu.ph";

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

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (callerProfile?.role !== "guard") {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: mfaOk, error: mfaError } = await admin.rpc("mfa_check_session", {
      p_session_id: sessionIdFrom(authHeader),
      p_user_id: callerData.user.id,
    });
    if (mfaError || mfaOk !== true) {
      if (mfaError) console.error("MFA check failed", mfaError);
      return jsonResponse({ error: "Please verify your identity again: sign out and sign back in." }, 403);
    }

    let body: { audit_id?: number };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request" }, 400);
    }
    const auditId = Number(body.audit_id);
    if (!Number.isSafeInteger(auditId) || auditId <= 0) {
      return jsonResponse({ error: "Invalid request" }, 400);
    }

    const { data: claim, error: claimError } = await admin.rpc("claim_pickup_rejection_email", {
      p_audit_id: auditId,
      p_guard_id: callerData.user.id,
    });
    if (claimError) {
      console.error("Claim failed", claimError);
      return jsonResponse({ error: "Could not prepare the email." }, 500);
    }
    // Nothing to send (no guardian email, already sent, too old, or not this guard's entry).
    if (!claim) return jsonResponse({ success: true, emailed: false });

    const email = String(claim.email ?? "");
    if (!email || email.toLowerCase().endsWith(SYNTHETIC_EMAIL_DOMAIN) || !RESEND_API_KEY) {
      return jsonResponse({ success: true, emailed: false });
    }

    const { data: withinBudget, error: budgetError } = await admin.rpc("email_budget_consume", { p_channel: "security" });
    if (budgetError) console.error("Email budget check failed", budgetError);
    if (withinBudget !== true) {
      return jsonResponse({ success: true, emailed: false, reason: "daily_limit" });
    }

    const student = escapeHtml(String(claim.student_name ?? "your child"));
    const when = escapeHtml(String(claim.when ?? ""));
    const reason = claim.reason ? escapeHtml(String(claim.reason)) : null;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: email,
        subject: `Pickup of ${String(claim.student_name ?? "your child")} was refused`,
        html:
          `<p>A school guard refused a pickup of <strong>${student}</strong> at ${when} that was made with your pickup QR code.</p>` +
          (reason ? `<p>Guard's note: ${reason}</p>` : "") +
          "<p>If this was you or someone you sent, no action is needed.</p>" +
          "<p><strong>If it was not</strong>, your QR code may have been copied. Please call or visit the school office right away " +
          "so they can lock your pickup access and issue a new code.</p>",
      }),
    });
    if (!emailRes.ok) {
      console.error("Pickup-refused email failed", emailRes.status, await emailRes.text());
      return jsonResponse({ success: true, emailed: false });
    }

    return jsonResponse({ success: true, emailed: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

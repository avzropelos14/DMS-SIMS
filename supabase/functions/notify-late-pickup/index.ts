import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Late pickup (Phase 6B): after staff press "Notify parent" (in-app notice already saved by
// notify_parent_late), this emails the student's guardians, one email each while the daily
// "security" email budget allows. Called by the Guard Portal with { notice_id }.
// The database checks the notice was sent by this staff member in the last 10 minutes and
// was not emailed before (claim_late_notice_email), so it can't send arbitrary emails.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = "Dumaguete Mission SIMS <dumaguetemissionschool@dmsis.app>";
// Generated logins (jdelacruz.student@missionschool.edu.ph) have no real inbox.
const SYNTHETIC_EMAIL_DOMAIN = "@missionschool.edu.ph";
const ALLOWED_ROLES = ["guard", "full_admin", "registrar"];

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
    if (!callerProfile || !ALLOWED_ROLES.includes(callerProfile.role)) {
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

    let body: { notice_id?: number };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request" }, 400);
    }
    const noticeId = Number(body.notice_id);
    if (!Number.isSafeInteger(noticeId) || noticeId <= 0) {
      return jsonResponse({ error: "Invalid request" }, 400);
    }

    const { data: claim, error: claimError } = await admin.rpc("claim_late_notice_email", {
      p_notice_id: noticeId,
      p_staff_id: callerData.user.id,
    });
    if (claimError) {
      console.error("Claim failed", claimError);
      return jsonResponse({ error: "Could not prepare the email." }, 500);
    }
    if (!claim || !RESEND_API_KEY) return jsonResponse({ success: true, emailed: 0 });

    const emails = ((claim.emails ?? []) as string[])
      .filter((e) => typeof e === "string" && e.includes("@") && !e.toLowerCase().endsWith(SYNTHETIC_EMAIL_DOMAIN));
    const studentName = String(claim.student_name ?? "Your child");
    const student = escapeHtml(studentName);
    const when = escapeHtml(String(claim.when ?? ""));
    const phone = claim.school_phone ? escapeHtml(String(claim.school_phone)) : null;

    let sent = 0;
    let budgetReached = false;
    for (const email of emails) {
      const { data: withinBudget, error: budgetError } = await admin.rpc("email_budget_consume", { p_channel: "security" });
      if (budgetError) console.error("Email budget check failed", budgetError);
      if (withinBudget !== true) {
        budgetReached = true;
        break;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: email,
          subject: `${studentName} is still at school`,
          html:
            `<p><strong>${student}</strong> has not been picked up yet (${when}).</p>` +
            "<p>Your child is safe and waiting under the supervision of school staff. Please come to the school " +
            (phone ? `or call the school at <strong>${phone}</strong> ` : "or call the school ") +
            "to arrange the pickup.</p>",
        }),
      });
      if (res.ok) sent++;
      else console.error("Late-pickup email failed", res.status, await res.text());
    }

    return jsonResponse({ success: true, emailed: sent, budget_reached: budgetReached });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

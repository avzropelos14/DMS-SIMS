import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Office request email: a parent asked for self-dismissal that needs approval (to the admin and
// registrar), or a teacher asked to reopen a locked grade (to the admin). Called by the portal
// right after the request is saved. In-app notifications are written by the database either way.
// Body: { kind: "self_dismissal" | "grade_reopen", id }. The database checks that this caller
// made that request in the last 10 minutes, that it still waits for a decision, and that it was
// not emailed before (claim_office_request_email), so the function can't send arbitrary emails.
// Uses the daily "office" email budget, one unit per recipient.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = "Dumaguete Mission SIMS <dumaguetemissionschool@dmsis.app>";
const SITE_URL = "https://www.dmsis.app";
// Generated logins (jdelacruz.student@missionschool.edu.ph) have no real inbox.
const SYNTHETIC_EMAIL_DOMAIN = "@missionschool.edu.ph";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Claim = Record<string, unknown> & { recipients?: string[] };

function compose(kind: string, c: Claim): { subject: string; html: string } {
  const button =
    `<p><a href="${SITE_URL}" style="display:inline-block;padding:10px 18px;background:#1a2b4a;color:#ffffff;` +
    `text-decoration:none;border-radius:8px">Open DMS-SIMS</a></p>`;
  const footer = "<p style=\"color:#6b6456;font-size:12px\">You receive this because your account handles these requests. " +
    "The request also appears in the notification bell in DMS-SIMS.</p>";
  if (kind === "self_dismissal") {
    const note = c.travel_note ? ` (${escapeHtml(c.travel_note)})` : "";
    return {
      subject: `Self-dismissal request for ${String(c.student_name ?? "a student")} needs approval`,
      html:
        `<p><strong>${escapeHtml(c.parent_name)}</strong> asks that <strong>${escapeHtml(c.student_name)}</strong>` +
        (c.grade ? ` (${escapeHtml(c.grade)})` : "") + " may leave school on their own.</p>" +
        "<ul>" +
        `<li>Dates: ${escapeHtml(c.valid_from)} to ${escapeHtml(c.valid_to)}</li>` +
        `<li>Not before: ${escapeHtml(c.earliest)}</li>` +
        `<li>Going home by: ${escapeHtml(c.travel)}${note}</li>` +
        "</ul>" +
        "<p>The student is below the minimum grade for self-dismissal, so the request waits for the office. " +
        "Sign in and open <strong>Self-Dismissal Requests</strong> to approve or decline it.</p>" +
        button + footer,
    };
  }
  const reason = c.reason ? `<p>Teacher's reason: ${escapeHtml(c.reason)}</p>` : "";
  return {
    subject: `Grade edit request from ${String(c.teacher_name ?? "a teacher")}`,
    html:
      `<p><strong>${escapeHtml(c.teacher_name)}</strong> asks to reopen a locked grade.</p>` +
      "<ul>" +
      `<li>Student: ${escapeHtml(c.student_name)}</li>` +
      `<li>Subject: ${escapeHtml(c.subject)}${c.section ? ` (${escapeHtml(c.section)})` : ""}</li>` +
      `<li>Quarter: ${escapeHtml(c.quarter)}</li>` +
      "</ul>" + reason +
      "<p>Sign in and open <strong>Classes → Grade Edit Requests</strong> to approve or deny it.</p>" +
      button + footer,
  };
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

    const { data: mfaOk, error: mfaError } = await admin.rpc("mfa_check_session", {
      p_session_id: sessionIdFrom(authHeader),
      p_user_id: callerData.user.id,
    });
    if (mfaError || mfaOk !== true) {
      if (mfaError) console.error("MFA check failed", mfaError);
      return jsonResponse({ error: "Please verify your identity again: sign out and sign back in." }, 403);
    }

    let body: { kind?: string; id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request" }, 400);
    }
    const kind = body.kind;
    const id = String(body.id ?? "");
    if ((kind !== "self_dismissal" && kind !== "grade_reopen") || !UUID_RE.test(id)) {
      return jsonResponse({ error: "Invalid request" }, 400);
    }

    const { data: claim, error: claimError } = await admin.rpc("claim_office_request_email", {
      p_kind: kind,
      p_id: id,
      p_caller: callerData.user.id,
    });
    if (claimError) {
      console.error("Claim failed", claimError);
      return jsonResponse({ error: "Could not prepare the email." }, 500);
    }
    // Nothing to send (not this caller's request, already decided or emailed, or too old).
    if (!claim || !RESEND_API_KEY) return jsonResponse({ success: true, emailed: 0 });

    const c = claim as Claim;
    const recipients = [...new Set((c.recipients ?? []).map((e) => String(e).trim().toLowerCase()))]
      .filter((e) => e && !e.endsWith(SYNTHETIC_EMAIL_DOMAIN));
    const { subject, html } = compose(kind, c);

    let emailed = 0;
    let overBudget = false;
    for (const to of recipients) {
      const { data: withinBudget, error: budgetError } = await admin.rpc("email_budget_consume", { p_channel: "office" });
      if (budgetError) console.error("Email budget check failed", budgetError);
      if (withinBudget !== true) {
        overBudget = true;
        break;
      }
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
      });
      if (emailRes.ok) emailed++;
      else console.error("Office request email failed", emailRes.status, await emailRes.text());
    }

    return jsonResponse({ success: true, emailed, ...(overBudget ? { reason: "daily_limit" } : {}) });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Admin-initiated password reset, by email only. The caller never sees a password or code:
// the account holder receives ONE email with
//   - a password reset link (Supabase recovery link, valid for the project's link lifetime), and
//   - a one-time sign-in recovery code (24 hours) to get past the verification step after
//     clicking the link without waiting for a second email.
// The account is signed out everywhere and its remembered devices are forgotten once the
// email has been sent. If the admin portal is ever compromised, all an attacker can do here
// is send these emails to the real owners.
// Who may reset whom:
//   registrar  -> parent and student accounts only
//   full_admin -> any account except a full_admin
//   nobody     -> a full_admin account (they use the Supabase dashboard / SQL Editor instead)
// Body: { email }. Returns { success, sent_to } where sent_to is masked (j•••@gmail.com).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = "Dumaguete Mission SIMS <dumaguetemissionschool@dmsis.app>";
// Generated logins (jdelacruz.student@missionschool.edu.ph) have no real inbox.
const SYNTHETIC_EMAIL_DOMAIN = "@missionschool.edu.ph";
// Where the reset link lands. The request's Origin is used when it is one of ours.
const DEFAULT_REDIRECT = "https://www.dmsis.app";
const ALLOWED_REDIRECTS = ["https://www.dmsis.app", "https://dmsis.app", "http://localhost:5173"];

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

async function sha256Hex(input: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 10 characters from a 32-character alphabet without look-alikes (256 % 32 = 0: no bias).
function generateRecoveryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % 32]).join("");
}

// j•••@gmail.com — enough for the admin to confirm the right account, nothing more.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain ?? ""}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type TargetKind = "full_admin" | "registrar" | "cashier" | "teacher" | "guard" | "parent" | "student" | "unlinked";

async function resolveTargetKind(admin: SupabaseClient, userId: string): Promise<TargetKind> {
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role) return profile.role as TargetKind;
  const { data: guardian } = await admin.from("guardians").select("id").eq("id", userId).maybeSingle();
  if (guardian) return "parent";
  const { data: student } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (student) return "student";
  return "unlinked";
}

function mayReset(callerRole: string, target: TargetKind): boolean {
  if (target === "full_admin") return false;
  if (callerRole === "full_admin") return true;
  if (callerRole === "registrar") return target === "parent" || target === "student";
  return false;
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

    if (!callerProfile || !["full_admin", "registrar"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // The caller's session must have passed MFA (always true while enforcement is off).
    const { data: mfaOk, error: mfaError } = await admin.rpc("mfa_check_session", {
      p_session_id: sessionIdFrom(authHeader),
      p_user_id: callerData.user.id,
    });
    if (mfaError || mfaOk !== true) {
      if (mfaError) console.error("MFA check failed", mfaError);
      return jsonResponse({ error: "Please verify your identity again: sign out and sign back in." }, 403);
    }

    let body: { email?: string; new_password?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    // Older forms sent a password; resets are now done by the owner through an emailed link.
    if (body.new_password !== undefined) {
      return jsonResponse({
        error: "Password resets are now sent to the account holder by email. Please refresh the page and try again.",
      }, 400);
    }

    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return jsonResponse({ error: "email is required" }, 400);
    }

    // Find the auth user by email. There is no direct "get user by email" admin API,
    // so we page through users and match. This project's user base is small enough
    // for this to be practical.
    let targetUserId: string | null = null;
    let targetEmail = email;
    for (let page = 1; !targetUserId; page++) {
      const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listError) {
        return jsonResponse({ error: listError.message }, 500);
      }
      const match = pageData.users.find((u) => u.email?.toLowerCase() === email);
      if (match) {
        targetUserId = match.id;
        targetEmail = (match.email ?? email).toLowerCase();
      }
      if (pageData.users.length < 200) break;
    }

    if (!targetUserId) {
      return jsonResponse({ error: "No registered account found with that email" }, 404);
    }

    if (targetUserId === callerData.user.id) {
      return jsonResponse({ error: "Use Change Password to change your own password." }, 400);
    }

    const targetKind = await resolveTargetKind(admin, targetUserId);
    if (!mayReset(callerProfile.role, targetKind)) {
      await admin.from("audit_log").insert({
        actor_id: callerData.user.id,
        actor_role: callerProfile.role,
        action: "password_reset_denied",
        target_user_id: targetUserId,
        details: { target_kind: targetKind },
      });
      const reason = targetKind === "full_admin"
        ? "An administrator account cannot be reset here."
        : "Registrars can only reset parent and student accounts.";
      return jsonResponse({ error: reason }, 403);
    }

    if (targetEmail.endsWith(SYNTHETIC_EMAIL_DOMAIN)) {
      return jsonResponse({ error: "This account has no real email inbox, so a reset email can't be sent." }, 400);
    }
    if (!RESEND_API_KEY) {
      return jsonResponse({ error: "Email sending is not configured." }, 500);
    }

    // Security emails have their own daily budget so they can never eat the MFA codes' share.
    const { data: withinBudget, error: budgetError } = await admin.rpc("email_budget_consume", { p_channel: "security" });
    if (budgetError) console.error("Email budget check failed", budgetError);
    if (withinBudget !== true) {
      return jsonResponse({ error: "Today's limit for security emails has been reached. Please try again tomorrow." }, 429);
    }

    const origin = req.headers.get("Origin") ?? "";
    const redirectTo = ALLOWED_REDIRECTS.includes(origin) ? origin : DEFAULT_REDIRECT;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: targetEmail,
      options: { redirectTo },
    });
    const actionLink = linkData?.properties?.action_link;
    if (linkError || !actionLink) {
      console.error("Could not create reset link", linkError);
      return jsonResponse({ error: "Could not create a reset link. Please try again." }, 500);
    }

    const recoveryCode = generateRecoveryCode();
    const { error: issueError } = await admin.rpc("mfa_issue_recovery_code", {
      p_user_id: targetUserId,
      p_code_hash: await sha256Hex(recoveryCode),
      p_issued_by: callerData.user.id,
    });
    if (issueError) {
      console.error("Could not issue recovery code", issueError);
      return jsonResponse({ error: "Could not prepare the reset email. Please try again." }, 500);
    }
    const shownCode = `${recoveryCode.slice(0, 5)}-${recoveryCode.slice(5)}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: targetEmail,
        subject: "Reset your SIMS password",
        html:
          "<p>The school office started a password reset for your SIMS account. You have been signed out on all devices.</p>" +
          `<p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:10px 18px;background:#1a2b4a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;">Choose a new password</a></p>` +
          "<p>This link works once and expires soon. If it has expired, ask the school office to send a new one.</p>" +
          "<p>After you click the link you will be asked to verify your identity. Choose <strong>Use a recovery code</strong> and enter:</p>" +
          `<h2 style="letter-spacing:4px;font-family:monospace;">${shownCode}</h2>` +
          "<p>The recovery code works once and expires in 24 hours.</p>" +
          "<p>If you did not ask for this, you can ignore this email; your current password still works. Please let the school office know.</p>",
      }),
    });
    if (!emailRes.ok) {
      console.error("Reset email failed", emailRes.status, await emailRes.text());
      await admin.from("audit_log").insert({
        actor_id: callerData.user.id,
        actor_role: callerProfile.role,
        action: "password_reset_email_failed",
        target_user_id: targetUserId,
        details: { target_kind: targetKind },
      });
      return jsonResponse({ error: "The reset email could not be sent. Please try again later." }, 502);
    }

    // Sign the account out everywhere and forget its remembered (MFA-trusted) devices.
    const { data: sessionsRevoked, error: revokeError } = await admin.rpc("admin_revoke_user_sessions", {
      p_user_id: targetUserId,
    });
    if (revokeError) console.error("Session revoke failed", revokeError);
    const { error: devicesError } = await admin.from("trusted_devices").delete().eq("user_id", targetUserId);
    if (devicesError) console.error("Trusted device cleanup failed", devicesError);

    const { error: auditError } = await admin.from("audit_log").insert({
      actor_id: callerData.user.id,
      actor_role: callerProfile.role,
      action: "password_reset_email_sent",
      target_user_id: targetUserId,
      details: {
        target_kind: targetKind,
        recovery_code_included: true,
        sessions_revoked: revokeError ? null : sessionsRevoked,
        trusted_devices_cleared: !devicesError,
      },
    });
    if (auditError) console.error("Audit log insert failed", auditError);

    return jsonResponse({ success: true, sent_to: maskEmail(targetEmail) });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

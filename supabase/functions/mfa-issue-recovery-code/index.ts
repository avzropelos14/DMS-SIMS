import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Emails a one-time sign-in recovery code (valid 24 hours) straight to the account holder,
// who enters it on the verification screen instead of the usual emailed 6-digit code (e.g.
// when the code emails are rate-limited or verification is locked). The caller never sees
// the code, so a compromised admin portal can't use it to get into anyone's account.
// Same who-may-act-on-whom rules as admin-reset-password:
//   registrar  -> parent and student accounts only
//   full_admin -> any account except a full_admin
//   a full_admin is recovered from the Supabase SQL Editor: select private.emergency_recovery_code('<email>');
// Body: { email }. Returns { success, sent_to } where sent_to is masked (j•••@gmail.com).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = "Dumaguete Mission SIMS <dumaguetemissionschool@dmsis.app>";
// Generated logins (jdelacruz.student@missionschool.edu.ph) have no real inbox.
const SYNTHETIC_EMAIL_DOMAIN = "@missionschool.edu.ph";

// j•••@gmail.com — enough for the admin to confirm the right account, nothing more.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain ?? ""}`;
}

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

function mayIssue(callerRole: string, target: TargetKind): boolean {
  if (target === "full_admin" || target === "unlinked") return false;
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
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return jsonResponse({ error: "email is required" }, 400);
    }

    let targetUserId: string | null = null;
    let targetEmail = email;
    for (let page = 1; !targetUserId; page++) {
      const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listError) return jsonResponse({ error: listError.message }, 500);
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
      return jsonResponse({ error: "You can't issue a recovery code for your own account." }, 400);
    }

    const targetKind = await resolveTargetKind(admin, targetUserId);
    if (!mayIssue(callerProfile.role, targetKind)) {
      await admin.from("audit_log").insert({
        actor_id: callerData.user.id,
        actor_role: callerProfile.role,
        action: "mfa_recovery_code_denied",
        target_user_id: targetUserId,
        details: { target_kind: targetKind },
      });
      const reason = targetKind === "full_admin"
        ? "An administrator account is recovered from the Supabase SQL Editor."
        : targetKind === "unlinked"
          ? "That account isn't linked to anyone in the system."
          : "Registrars can only issue recovery codes for parent and student accounts.";
      return jsonResponse({ error: reason }, 403);
    }

    if (targetEmail.endsWith(SYNTHETIC_EMAIL_DOMAIN)) {
      return jsonResponse({ error: "This account has no real email inbox, so a recovery code can't be sent." }, 400);
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

    const code = generateRecoveryCode();
    const { error: issueError } = await admin.rpc("mfa_issue_recovery_code", {
      p_user_id: targetUserId,
      p_code_hash: await sha256Hex(code),
      p_issued_by: callerData.user.id,
    });
    if (issueError) {
      console.error(issueError);
      return jsonResponse({ error: "Could not issue a recovery code" }, 500);
    }
    const shownCode = `${code.slice(0, 5)}-${code.slice(5)}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: targetEmail,
        subject: "Your SIMS sign-in recovery code",
        html:
          "<p>The school office sent you a one-time recovery code for signing in to SIMS:</p>" +
          `<h2 style="letter-spacing:4px;font-family:monospace;">${shownCode}</h2>` +
          "<p>After entering your password, choose <strong>Use a recovery code</strong> on the verification screen and enter this code. It works once and expires in 24 hours.</p>" +
          "<p>If you did not ask for this, please let the school office know. Nobody can use this code without also knowing your password.</p>",
      }),
    });
    const sent = emailRes.ok;
    if (!sent) console.error("Recovery code email failed", emailRes.status, await emailRes.text());

    const { error: auditError } = await admin.from("audit_log").insert({
      actor_id: callerData.user.id,
      actor_role: callerProfile.role,
      action: sent ? "mfa_recovery_code_emailed" : "mfa_recovery_code_email_failed",
      target_user_id: targetUserId,
      details: { target_kind: targetKind, via: "admin" },
    });
    if (auditError) console.error("Audit log insert failed", auditError);

    if (!sent) {
      return jsonResponse({ error: "The recovery code email could not be sent. Please try again later." }, 502);
    }
    return jsonResponse({ success: true, sent_to: maskEmail(targetEmail) });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

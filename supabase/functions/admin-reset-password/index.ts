import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Who may reset whom:
//   registrar  -> parent and student accounts only
//   full_admin -> any account except a full_admin
//   nobody     -> a full_admin account (they use Change Password / the dashboard instead)
// The caller never chooses the password: a random temporary one is generated, returned once,
// and the owner must set their own on next sign-in (password_set=false).

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

// 14 characters from an alphabet without look-alikes (0/O, 1/l/I), with rejection
// sampling so every character is equally likely.
function generateTemporaryPassword(length = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const limit = 256 - (256 % chars.length);
  const out: string[] = [];
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(chars[b % chars.length]);
    }
  }
  return out.join("");
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

async function sendResetNotice(to: string): Promise<boolean> {
  if (!RESEND_API_KEY || to.toLowerCase().endsWith(SYNTHETIC_EMAIL_DOMAIN)) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject: "Your SIMS password was reset",
        html:
          "<p>The school office has reset the password for your SIMS account and signed it out on all devices.</p>" +
          "<p>You will receive a temporary password from the office and will be asked to choose a new password when you sign in.</p>" +
          "<p>If you did not request this, please contact the school office right away.</p>",
      }),
    });
    if (!res.ok) console.error("Reset notice failed", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("Reset notice failed", err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

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

  let body: { email?: string; new_password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // The previous form let the caller type the password. Refuse it rather than silently
  // issuing a different password than the one the admin thinks they set.
  if (body.new_password !== undefined) {
    return jsonResponse({
      error: "Password resets now issue a temporary password. Please refresh the page and try again.",
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
  let page = 1;
  const perPage = 200;
  while (!targetUserId) {
    const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
    if (listError) {
      return jsonResponse({ error: listError.message }, 500);
    }
    const match = pageData.users.find((u) => u.email?.toLowerCase() === email);
    if (match) {
      targetUserId = match.id;
      break;
    }
    if (pageData.users.length < perPage) break;
    page += 1;
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

  const { data: targetUser, error: getError } = await admin.auth.admin.getUserById(targetUserId);
  if (getError || !targetUser.user) {
    return jsonResponse({ error: getError?.message ?? "Could not load target account" }, 500);
  }

  const temporaryPassword = generateTemporaryPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
    password: temporaryPassword,
    user_metadata: { ...targetUser.user.user_metadata, password_set: false },
  });

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500);
  }

  // Sign the account out everywhere and forget its remembered (MFA-trusted) devices.
  const { data: sessionsRevoked, error: revokeError } = await admin.rpc("admin_revoke_user_sessions", {
    p_user_id: targetUserId,
  });
  if (revokeError) console.error("Session revoke failed", revokeError);
  const { error: devicesError } = await admin.from("trusted_devices").delete().eq("user_id", targetUserId);
  if (devicesError) console.error("Trusted device cleanup failed", devicesError);

  const noticeSent = await sendResetNotice(targetUser.user.email ?? email);

  const { error: auditError } = await admin.from("audit_log").insert({
    actor_id: callerData.user.id,
    actor_role: callerProfile.role,
    action: "password_reset",
    target_user_id: targetUserId,
    details: {
      target_kind: targetKind,
      sessions_revoked: revokeError ? null : sessionsRevoked,
      trusted_devices_cleared: !devicesError,
      notice_emailed: noticeSent,
    },
  });
  if (auditError) console.error("Audit log insert failed", auditError);

  return jsonResponse({
    success: true,
    temporary_password: temporaryPassword,
    notice_emailed: noticeSent,
  });
});

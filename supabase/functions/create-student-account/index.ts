import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMAIL_DOMAIN = "missionschool.edu.ph";

// A random per-account password, shown once to the registrar. The student must replace
// it on first sign-in (password_set=false). Rejection sampling keeps characters uniform.
function generatePassword(length = 12): string {
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

function baseLocalPart(firstName: string, lastName: string): string {
  const first = (firstName.trim()[0] ?? "").toLowerCase();
  const last = lastName.trim().toLowerCase().replace(/[^a-z]/g, "");
  const cleanFirst = first.replace(/[^a-z]/g, "");
  return `${cleanFirst}${last}` || "student";
}

function isAlreadyRegistered(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message?.toLowerCase() ?? "";
  return msg.includes("already been registered") || msg.includes("already registered") || err.code === "email_exists";
}

async function handleRequest(req: Request): Promise<Response> {
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

  let body: { student_id?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const studentId = body.student_id;
  if (!studentId) {
    return jsonResponse({ error: "student_id is required" }, 400);
  }
  const providedEmail = body.email?.trim().toLowerCase() || null;

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, first_name, last_name")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    return jsonResponse({ error: "Student not found" }, 404);
  }

  const { data: existingAccount } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (existingAccount) {
    return jsonResponse({ error: "Student already has a login account" }, 409);
  }

  let authUserId: string | null = null;
  let email = "";
  let emailSent = false;
  let password: string | null = null;

  if (providedEmail) {
    // The student's own email, as entered at enrollment, becomes the Student Portal
    // login itself — it must match what the family was told to expect, so unlike the
    // fallback path below we don't silently substitute a generated address on conflict.
    // Real address on file, so invite them by email instead of minting a shared default
    // password — Supabase sends the activation link itself, routed through the
    // project's configured (Brevo) SMTP rather than its default-provider rate limit.
    email = providedEmail;
    const { data: created, error: createErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { student_id: studentId, password_set: false },
    });
    if (createErr || !created.user) {
      if (isAlreadyRegistered(createErr)) {
        return jsonResponse({ error: "This email is already registered to another account. Use a different email for this student." }, 409);
      }
      // Surface the underlying Auth/SMTP failure (e.g. mail provider rejecting the
      // send) instead of a bare "failed" — this is what showed up as an opaque 500
      // when Brevo's IP-authorization block was the actual cause.
      return jsonResponse({ error: createErr?.message ?? "Failed to send the student's activation email" }, 500);
    }
    authUserId = created.user.id;
    emailSent = true;
  } else {
    const base = baseLocalPart(student.first_name, student.last_name);
    password = generatePassword();
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
      email = `${candidate}.student@${EMAIL_DOMAIN}`;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { student_id: studentId, password_set: false },
      });
      if (!createErr && created.user) {
        authUserId = created.user.id;
        break;
      }
      if (!isAlreadyRegistered(createErr)) {
        return jsonResponse({ error: createErr?.message ?? "Failed to create auth user" }, 500);
      }
    }
    if (!authUserId) {
      return jsonResponse({ error: "Could not generate a unique student email" }, 500);
    }
  }

  const { error: linkError } = await admin
    .from("student_accounts")
    .insert({ student_id: studentId, auth_user_id: authUserId });

  if (linkError) {
    await admin.auth.admin.deleteUser(authUserId);
    return jsonResponse({ error: linkError.message }, 500);
  }

  // Server-side "must set your own password" (cleared by the first real password change).
  const { error: requireError } = await admin.rpc("mark_password_change_required", {
    p_user_id: authUserId,
    p_reason: "new_account",
  });
  if (requireError) console.error("Could not flag password change", requireError);

  const { error: auditError } = await admin.from("audit_log").insert({
    actor_id: callerData.user.id,
    actor_role: callerProfile.role,
    action: "student_account_created",
    target_user_id: authUserId,
    details: { student_id: studentId, method: emailSent ? "invite_email" : "generated_password" },
  });
  if (auditError) console.error("Audit log insert failed", auditError);

  return jsonResponse({ email, password: emailSent ? null : password, emailSent });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("create-student-account crashed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});

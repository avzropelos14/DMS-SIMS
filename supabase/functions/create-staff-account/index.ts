import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMAIL_DOMAIN = "missionschool.edu.ph";
const ROLE_SUFFIX: Record<string, string> = {
  full_admin: "admin",
  registrar: "registrar",
  cashier: "cashier",
  teacher: "teacher",
  guard: "guard",
};
const VALID_ROLES = Object.keys(ROLE_SUFFIX);

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

function baseLocalPart(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "staff";
  const first = (parts[0][0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const last = parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, "");
  return `${first}${last}` || "staff";
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function isAlreadyRegistered(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message?.toLowerCase() ?? "";
  return msg.includes("already been registered") || msg.includes("already registered") || err.code === "email_exists";
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

  // The caller's session must have passed MFA (always true while enforcement is off).
  const { data: mfaOk, error: mfaError } = await admin.rpc("mfa_check_session", {
    p_session_id: sessionIdFrom(authHeader),
    p_user_id: callerData.user.id,
  });
  if (mfaError || mfaOk !== true) {
    if (mfaError) console.error("MFA check failed", mfaError);
    return jsonResponse({ error: "Please verify your identity again: sign out and sign back in." }, 403);
  }

  let body: { employee_id?: string; role?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const employeeId = body.employee_id;
  const role = body.role;
  if (!employeeId || !role || !VALID_ROLES.includes(role)) {
    return jsonResponse({ error: "employee_id and a valid role are required" }, 400);
  }

  if (role === "full_admin" && callerProfile.role !== "full_admin") {
    return jsonResponse({ error: "Only a full admin can create another admin account" }, 403);
  }

  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("id, full_name")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError || !employee) {
    return jsonResponse({ error: "Employee not found" }, 404);
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (existingProfile) {
    return jsonResponse({ error: "Employee already has a login account" }, 409);
  }

  const providedEmail = body.email?.trim().toLowerCase() || null;

  let authUserId: string | null = null;
  let email = "";
  let password: string | null = null;
  let emailSent = false;

  if (providedEmail) {
    // The employee's own email, as entered on the Add Employee form, becomes their
    // login itself — invite them by email so Supabase sends the activation link
    // (through the project's configured SMTP) instead of minting a generated
    // school-domain address and a one-off password, mirroring how student/guardian
    // accounts are created during enrollment.
    email = providedEmail;
    const { data: created, error: createErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { employee_id: employeeId, role, password_set: false },
    });
    if (createErr || !created.user) {
      if (isAlreadyRegistered(createErr)) {
        return jsonResponse({ error: "This email is already registered to another account. Use a different email for this employee." }, 409);
      }
      return jsonResponse({ error: createErr?.message ?? "Failed to send the employee's activation email" }, 500);
    }
    authUserId = created.user.id;
    emailSent = true;
  } else {
    const base = baseLocalPart(employee.full_name);
    const suffix = ROLE_SUFFIX[role];
    password = generatePassword();
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
      email = `${candidate}.${suffix}@${EMAIL_DOMAIN}`;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_id: employeeId, password_set: false },
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
      return jsonResponse({ error: "Could not generate a unique staff email" }, 500);
    }

    const { error: emailUpdateError } = await admin
      .from("employees")
      .update({ email })
      .eq("id", employeeId);

    if (emailUpdateError) {
      await admin.auth.admin.deleteUser(authUserId);
      return jsonResponse({ error: emailUpdateError.message }, 500);
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: authUserId, full_name: employee.full_name, email, role, employee_id: employeeId });

  if (profileError) {
    await admin.auth.admin.deleteUser(authUserId);
    return jsonResponse({ error: profileError.message }, 500);
  }

  // Server-side "must set your own password" (cleared by the first real password change).
  const { error: requireError } = await admin.rpc("mark_password_change_required", {
    p_user_id: authUserId,
    p_reason: "new_account",
  });
  if (requireError) console.error("Could not flag password change", requireError);

  return jsonResponse({ email, password: emailSent ? null : password, emailSent });
});

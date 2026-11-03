import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMAIL_DOMAIN = "missionschool.edu.ph";

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

function baseLocalPart(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "parent";
  const first = (parts[0][0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const last = parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, "");
  return `${first}${last}` || "parent";
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function isUniqueEmailViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const msg = err.message?.toLowerCase() ?? "";
  return msg.includes("guardians_email_key") || (msg.includes("duplicate key") && msg.includes("email"));
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

  let body: {
    student_id?: string;
    full_name?: string;
    relationship?: string;
    phone?: string;
    email?: string;
    is_primary_contact?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const studentId = body.student_id;
  const fullName = body.full_name?.trim();
  const relationship = body.relationship?.trim() || "Guardian";
  const phone = body.phone?.trim() || null;
  const providedEmail = body.email?.trim().toLowerCase() || null;
  const isPrimaryContact = body.is_primary_contact ?? true;

  if (!studentId || !fullName) {
    return jsonResponse({ error: "student_id and full_name are required" }, 400);
  }

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    return jsonResponse({ error: "Student not found" }, 404);
  }

  // If the registrar supplied an email that already belongs to a guardian account
  // (e.g. a parent enrolling a second child), reuse that account instead of
  // creating a duplicate — just link the new student to it. Re-run this lookup
  // (not just once up front) whenever we hit a collision below: two enrollments
  // for the same parent submitted close together can otherwise both pass the
  // initial "not found yet" check and race each other into creating duplicate
  // accounts, or into a duplicate-key error, instead of converging on one account.
  const findExistingGuardian = async (byEmail: string) => {
    const { data } = await admin
      .from("guardians")
      .select("id, email")
      .eq("email", byEmail)
      .maybeSingle();
    return data;
  };

  let guardianId: string | null = null;
  let email = providedEmail ?? "";
  let password: string | null = null;
  let isNewAccount = false;
  let emailSent = false;

  if (providedEmail) {
    const existingGuardian = await findExistingGuardian(providedEmail);
    if (existingGuardian) {
      guardianId = existingGuardian.id;
      email = existingGuardian.email;
    }
  }

  if (!guardianId) {
    const base = baseLocalPart(fullName);
    isNewAccount = true;

    let authUserId: string | null = null;
    for (let attempt = 0; attempt < 25 && !authUserId; attempt++) {
      const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
      email = providedEmail && attempt === 0 ? providedEmail : `${candidate}.parent@${EMAIL_DOMAIN}`;
      // A real address on file gets an actual activation link sent to it — Supabase
      // sends the invite email itself, routed through the project's configured
      // (Brevo) SMTP, so it isn't capped by the default provider's low hourly limit
      // the way generating-and-displaying a password never was. The synthetic
      // `@missionschool.edu.ph` fallback below has no real inbox, so it keeps the
      // generated-password flow the registrar reads off the confirmation screen.
      const usingRealEmail = Boolean(providedEmail) && email === providedEmail;
      const candidatePassword = usingRealEmail ? null : generatePassword();
      const { data: created, error: createErr } = usingRealEmail
        ? await admin.auth.admin.inviteUserByEmail(email, {
            data: { password_set: false },
          })
        : await admin.auth.admin.createUser({
            email,
            password: candidatePassword!,
            email_confirm: true,
            user_metadata: { password_set: false },
          });
      if (!createErr && created.user) {
        authUserId = created.user.id;
        if (usingRealEmail) {
          emailSent = true;
        } else {
          password = candidatePassword;
        }
        break;
      }
      const alreadyExists = isAlreadyRegistered(createErr);
      if (!alreadyExists) {
        return jsonResponse({ error: createErr?.message ?? "Failed to create auth user" }, 500);
      }
      // The email is taken. If it's the exact one the registrar supplied, a concurrent
      // request for the same parent may have just created the guardian we're looking
      // for — re-check before falling through to a generated, suffixed candidate.
      if (attempt === 0 && email === providedEmail) {
        const nowExists = await findExistingGuardian(providedEmail);
        if (nowExists) {
          guardianId = nowExists.id;
          email = nowExists.email;
          isNewAccount = false;
          break;
        }
      }
      // Falls through to the next attempt, which uses a generated `${candidate}.parent@` email.
    }

    if (!guardianId && !authUserId) {
      return jsonResponse({ error: "Could not generate a unique parent email" }, 500);
    }

    if (!guardianId && authUserId) {
      const { error: guardianInsertError } = await admin
        .from("guardians")
        .insert({ id: authUserId, full_name: fullName, email, phone });

      if (guardianInsertError) {
        await admin.auth.admin.deleteUser(authUserId);
        // Another request for the same parent may have won the insert race — if so,
        // reuse the account it created instead of surfacing a duplicate-key error.
        if (isUniqueEmailViolation(guardianInsertError)) {
          const raced = await findExistingGuardian(email);
          if (raced) {
            guardianId = raced.id;
            email = raced.email;
            isNewAccount = false;
            emailSent = false;
          }
        }
        if (!guardianId) {
          return jsonResponse({ error: guardianInsertError.message }, 500);
        }
      } else {
        guardianId = authUserId;
      }
    }
  }

  const { data: existingLink } = await admin
    .from("student_guardians")
    .select("id")
    .eq("student_id", studentId)
    .eq("guardian_id", guardianId)
    .maybeSingle();

  if (!existingLink) {
    const { error: linkError } = await admin
      .from("student_guardians")
      .insert({
        student_id: studentId,
        guardian_id: guardianId,
        relationship,
        is_primary_contact: isPrimaryContact,
        can_view_academics: true,
        can_pickup: true,
      });

    if (linkError) {
      return jsonResponse({ error: linkError.message }, 500);
    }
  }

  return jsonResponse({ email, password, isNewAccount, emailSent });
});

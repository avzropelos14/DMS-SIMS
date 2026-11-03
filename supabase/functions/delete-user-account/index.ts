import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

  // Removing someone's login is more sensitive than creating one, so this is
  // restricted to full admins only (registrars can create accounts but not remove them).
  if (!callerProfile || callerProfile.role !== "full_admin") {
    return jsonResponse({ error: "Forbidden — only a full admin can remove authenticated users" }, 403);
  }

  let body: { student_id?: string; employee_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { student_id, employee_id, user_id } = body;
  const provided = [student_id, employee_id, user_id].filter(Boolean);
  if (provided.length === 0) {
    return jsonResponse({ error: "One of student_id, employee_id, or user_id is required" }, 400);
  }
  if (provided.length > 1) {
    return jsonResponse({ error: "Provide only one of student_id, employee_id, or user_id" }, 400);
  }

  let authUserId: string | null = null;

  if (student_id) {
    const { data: account } = await admin
      .from("student_accounts")
      .select("auth_user_id")
      .eq("student_id", student_id)
      .maybeSingle();
    authUserId = account?.auth_user_id ?? null;
  } else if (employee_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("employee_id", employee_id)
      .maybeSingle();
    authUserId = profile?.id ?? null;
  } else if (user_id) {
    // profiles.id / guardians.id ARE the auth.users id directly.
    authUserId = user_id;
  }

  if (!authUserId) {
    // No linked login account — nothing to remove, not an error condition.
    return jsonResponse({ deleted: false, reason: "No linked auth account found" });
  }

  if (authUserId === callerData.user.id) {
    return jsonResponse({ error: "You cannot remove your own account this way" }, 400);
  }

  // profiles / student_accounts / guardians all ON DELETE CASCADE from auth.users,
  // so deleting the auth user cleans up the linking row automatically.
  const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500);
  }

  return jsonResponse({ deleted: true });
});

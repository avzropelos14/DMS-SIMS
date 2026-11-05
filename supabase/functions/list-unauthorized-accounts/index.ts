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

  // Same sensitivity bar as delete-user-account: only a full admin gets to see
  // (and later remove) accounts that can sign in but have no provisioned role.
  if (!callerProfile || callerProfile.role !== "full_admin") {
    return jsonResponse({ error: "Forbidden — only a full admin can view unauthorized accounts" }, 403);
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

  // Walk every auth.users page and collect ids not linked from profiles,
  // guardians, or student_accounts — these are the "unauthorized" logins:
  // they can authenticate but resolveIdentity() finds nothing for them.
  const allUsers: { id: string; email: string | null; created_at: string; last_sign_in_at: string | null }[] = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return jsonResponse({ error: error.message }, 500);
    for (const u of data.users) {
      allUsers.push({ id: u.id, email: u.email ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null });
    }
    if (data.users.length < perPage) break;
    page += 1;
  }

  const [{ data: profiles }, { data: guardians }, { data: studentAccounts }] = await Promise.all([
    admin.from("profiles").select("id"),
    admin.from("guardians").select("id"),
    admin.from("student_accounts").select("auth_user_id"),
  ]);

  const linkedIds = new Set<string>([
    ...(profiles ?? []).map((p) => p.id as string),
    ...(guardians ?? []).map((g) => g.id as string),
    ...(studentAccounts ?? []).map((s) => s.auth_user_id as string),
  ]);

  const unauthorized = allUsers.filter((u) => !linkedIds.has(u.id));

  return jsonResponse({ accounts: unauthorized });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Fresh password confirmation for sensitive parent actions (Phase 6A: self-dismissal).
// The signed-in user re-enters their password; it is checked here on the server (never in
// the database or the browser alone), the session the check creates is ended at once, and a
// confirmation valid for 5 minutes is recorded (used up by the next sensitive action).
// Body: { password }. Returns { success } or { error }.

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

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    const email = callerData?.user?.email;
    if (callerError || !callerData.user || !email) {
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

    let body: { password?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request" }, 400);
    }
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || password.length > 200) {
      return jsonResponse({ error: "Incorrect password." }, 400);
    }

    // A throwaway client: the check never touches the caller's own session.
    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: checkData, error: checkError } = await verifier.auth.signInWithPassword({ email, password });
    if (checkError || !checkData.session) {
      if (checkError?.status === 429) {
        return jsonResponse({ error: "Too many attempts. Please wait a few minutes and try again." }, 429);
      }
      return jsonResponse({ error: "Incorrect password." }, 400);
    }
    // End the session the check created (local scope: only that one session).
    const { error: endError } = await admin.auth.admin.signOut(checkData.session.access_token, "local");
    if (endError) console.error("Could not end the check session", endError);

    const { error: recordError } = await admin.rpc("record_password_confirmation", { p_user_id: callerData.user.id });
    if (recordError) {
      console.error("Could not record confirmation", recordError);
      return jsonResponse({ error: "Could not confirm your password. Please try again." }, 500);
    }
    return jsonResponse({ success: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

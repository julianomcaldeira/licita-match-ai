import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }
  const userId = claimsData.claims.sub as string;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: isAdmin, error: roleErr } = await adminClient.rpc("iverbas_has_role", {
    _user_id: userId,
    _role: "admin_central",
  });
  if (roleErr || !isAdmin) {
    return jsonResponse({ error: "Forbidden: admin_central role required" }, 403);
  }

  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (!syncSecret) {
    return jsonResponse({ error: "SYNC_SECRET env var not configured" }, 500);
  }

  const { error: upsertErr } = await adminClient.rpc("upsert_sync_secret", { _value: syncSecret });
  if (upsertErr) {
    return jsonResponse({ error: `Failed to store secret in vault: ${upsertErr.message}` }, 500);
  }

  return jsonResponse({ success: true, message: "SYNC_SECRET copied to Vault for pg_cron use" });
});

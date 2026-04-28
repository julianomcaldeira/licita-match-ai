// Cancels a running ingestion pipeline job. Restricted to admin_central.
// The orchestrator checks the status before each tick and exits cleanly when cancelled.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claims.claims.sub;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roleRows } = await admin
    .from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roleRows || []).some((r: any) => r.role === "admin_central");
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const jobId: string | undefined = body.jobId;

  // If jobId not given, cancel the active one
  let targetId = jobId;
  if (!targetId) {
    const { data: active } = await admin
      .from("ingestion_jobs")
      .select("id")
      .in("status", ["pending", "running"])
      .maybeSingle();
    targetId = active?.id;
  }

  if (!targetId) {
    return new Response(JSON.stringify({ error: "Nenhuma ingestão ativa" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: updErr } = await admin
    .from("ingestion_jobs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
      phase_label: "Cancelado pelo usuário",
      error_message: `Cancelado por ${userId}`,
    })
    .eq("id", targetId)
    .in("status", ["pending", "running"]);

  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, jobId: targetId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

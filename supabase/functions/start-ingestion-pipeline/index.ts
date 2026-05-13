// Starts a manual ingestion pipeline job. Restricted to admin_central.
// Creates a row in ingestion_jobs and triggers the first orchestrator tick.

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

  // Auth
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

  // Refuse if a job is already running/pending (unique index also enforces)
  const { data: existing } = await admin
    .from("ingestion_jobs")
    .select("id,status")
    .in("status", ["pending", "running"])
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({
      error: "Já existe uma ingestão em andamento",
      jobId: existing.id,
    }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: job, error: insErr } = await admin
    .from("ingestion_jobs")
    .insert({
      status: "pending",
      current_phase: "winners",
      phases_total: 5,
      phase_label: "Aguardando atualização de vencedores...",
      created_by: userId,
    })
    .select("*")
    .single();

  if (insErr || !job) {
    return new Response(JSON.stringify({ error: insErr?.message || "Falha ao criar job" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fire-and-forget first tick
  fetch(`${SUPABASE_URL}/functions/v1/pipeline-orchestrator`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ jobId: job.id }),
  }).catch((e) => console.error("first tick failed:", e));

  return new Response(JSON.stringify({ ok: true, jobId: job.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

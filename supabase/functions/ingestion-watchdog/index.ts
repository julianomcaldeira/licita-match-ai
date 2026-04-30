import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WATCHDOG_STALL_MS = 3 * 60_000;
const WATCHDOG_DEBOUNCE_MS = 45_000;

const PHASE_LABELS = {
  pncp: "Ingerindo licitações do PNCP",
  winners: "Buscando vencedores das homologadas",
  contratos: "Ingerindo contratos do Portal da Transparência",
  sancionados: "Atualizando empresas sancionadas (CEIS/CNEP)",
  auto_analysis: "Executando auto-análise IA",
} as const;

type Phase = keyof typeof PHASE_LABELS;

type WatchdogState = {
  nextRetryAt?: string | null;
  lastKickAt?: string;
};

function parseIsoMs(value?: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function kick(jobId: string) {
  fetch(`${SUPABASE_URL}/functions/v1/pipeline-orchestrator`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ jobId, internal: true, source: "watchdog" }),
  }).catch((error) => console.error("watchdog kick failed", jobId, error));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const targetJobId = typeof body.jobId === "string" ? body.jobId : null;
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("ingestion_jobs")
    .select("id,status,current_phase,last_tick_at,started_at,created_at,phase_label,state")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (targetJobId) query = query.eq("id", targetJobId);

  const { data: jobs, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resumed: string[] = [];
  const skipped: Array<{ jobId: string; reason: string }> = [];

  for (const job of jobs || []) {
    const phase = ((job.current_phase as Phase | null) || "pncp") as Phase;
    const state: any = job.state || {};
    const watchdog: WatchdogState = state.__watchdog || {};
    const nextRetryAtMs = parseIsoMs(watchdog.nextRetryAt);
    const lastTickMs = parseIsoMs(job.last_tick_at) ?? parseIsoMs(job.started_at) ?? parseIsoMs(job.created_at) ?? nowMs;
    const lastKickMs = parseIsoMs(watchdog.lastKickAt);
    const dueRetry = nextRetryAtMs !== null && nextRetryAtMs <= nowMs;
    const stale = nowMs - lastTickMs >= WATCHDOG_STALL_MS;
    const needsStart = job.status === "pending" && !job.last_tick_at;

    if (!dueRetry && !stale && !needsStart) {
      skipped.push({ jobId: job.id, reason: "healthy" });
      continue;
    }

    if (lastKickMs && nowMs - lastKickMs < WATCHDOG_DEBOUNCE_MS) {
      skipped.push({ jobId: job.id, reason: "debounced" });
      continue;
    }

    watchdog.lastKickAt = nowIso;
    if (dueRetry) watchdog.nextRetryAt = null;
    state.__watchdog = watchdog;

    const label = dueRetry
      ? `${PHASE_LABELS[phase]} · retomando após backoff`
      : `${PHASE_LABELS[phase]} · watchdog retomando`;

    const { error: updateError } = await supabase
      .from("ingestion_jobs")
      .update({
        phase_label: label,
        state,
      })
      .eq("id", job.id)
      .in("status", ["pending", "running"]);

    if (updateError) {
      skipped.push({ jobId: job.id, reason: updateError.message });
      continue;
    }

    await kick(job.id);
    resumed.push(job.id);
  }

  return new Response(JSON.stringify({
    ok: true,
    checked: (jobs || []).length,
    resumed,
    skipped,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, Loader2, X, CheckCircle2, AlertTriangle, Play } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PhaseTiming = { startedAt: string; finishedAt?: string; recordsProcessed: number };

type IngestionJob = {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_phase: string | null;
  phases_total: number;
  phases_completed: number;
  phase_progress_current: number;
  phase_progress_total: number;
  phase_label: string | null;
  total_records_processed: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  state: any;
};

// Default phase weights (rough estimate, used only before any phase has finished)
const PHASE_WEIGHTS: Record<string, number> = {
  pncp: 5,        // heaviest
  winners: 3,
  contratos: 2,
  sancionados: 1,
  auto_analysis: 2,
};
const PHASES_ORDER = ["pncp", "winners", "contratos", "sancionados", "auto_analysis"];

const PHASE_LABEL: Record<string, string> = {
  pncp: "1/5 · Licitações PNCP",
  winners: "2/5 · Vencedores",
  contratos: "3/5 · Contratos",
  sancionados: "4/5 · Sancionadas",
  auto_analysis: "5/5 · Auto-Análise IA",
};

function formatDuration(ms: number) {
  if (ms < 0 || !isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function IngestaoManualButton() {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<IngestionJob | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Resume any running job on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("ingestion_jobs" as any)
        .select("*")
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mounted && data) {
        setJob(data as any);
        setOpen(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Poll while a job is running
  useEffect(() => {
    if (!job || (job.status !== "running" && job.status !== "pending")) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase
        .from("ingestion_jobs" as any)
        .select("*")
        .eq("id", job.id)
        .maybeSingle();
      if (data) setJob(data as any);
    }, 3000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job?.id, job?.status]);

  // Smarter ETA: use measured durations of completed phases to estimate
  // remaining phases, instead of pure linear extrapolation.
  const eta = useMemo(() => {
    if (!job || !job.started_at || job.status !== "running") return null;
    const now = Date.now();
    const phaseTimings: Record<string, PhaseTiming> =
      (job.state?.__phaseTimings as any) || {};

    // 1. Measure rate of completed phases (ms per "weight unit")
    const completedDurations: number[] = [];
    let totalCompletedWeight = 0;
    for (const p of PHASES_ORDER) {
      const t = phaseTimings[p];
      if (t?.finishedAt && t.startedAt) {
        const dur = new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime();
        completedDurations.push(dur / (PHASE_WEIGHTS[p] || 1));
        totalCompletedWeight += PHASE_WEIGHTS[p] || 1;
      }
    }
    const measuredMsPerWeight =
      completedDurations.length > 0
        ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length
        : null;

    // 2. Current phase: estimate remaining via in-phase progress rate
    let currentPhaseRemainingMs = 0;
    if (job.current_phase) {
      const cp = phaseTimings[job.current_phase];
      const phaseElapsed = cp?.startedAt
        ? now - new Date(cp.startedAt).getTime()
        : 0;
      const fraction =
        job.phase_progress_total > 0
          ? Math.min(1, job.phase_progress_current / job.phase_progress_total)
          : 0;
      if (fraction > 0.05) {
        // Extrapolate from in-phase rate
        const phaseTotalEstimate = phaseElapsed / fraction;
        currentPhaseRemainingMs = Math.max(0, phaseTotalEstimate - phaseElapsed);
      } else if (measuredMsPerWeight !== null) {
        // Not enough in-phase data — use measured rate from previous phases
        const w = PHASE_WEIGHTS[job.current_phase] || 1;
        currentPhaseRemainingMs = Math.max(0, measuredMsPerWeight * w - phaseElapsed);
      } else {
        return null; // not enough data yet
      }
    }

    // 3. Future phases: sum weights and apply measured rate (or fallback heuristic)
    const currentIdx = job.current_phase ? PHASES_ORDER.indexOf(job.current_phase) : -1;
    const futureWeight = PHASES_ORDER.slice(currentIdx + 1)
      .reduce((sum, p) => sum + (PHASE_WEIGHTS[p] || 1), 0);

    let futurePhasesMs = 0;
    if (futureWeight > 0) {
      if (measuredMsPerWeight !== null) {
        futurePhasesMs = measuredMsPerWeight * futureWeight;
      } else {
        // No completed phases yet → use current phase elapsed as proxy
        const cp = job.current_phase ? phaseTimings[job.current_phase] : null;
        const phaseElapsed = cp?.startedAt
          ? now - new Date(cp.startedAt).getTime()
          : now - new Date(job.started_at).getTime();
        const fraction =
          job.phase_progress_total > 0
            ? Math.min(1, job.phase_progress_current / job.phase_progress_total)
            : 0;
        if (fraction > 0.1) {
          const projectedCurrent = phaseElapsed / fraction;
          const currentWeight = job.current_phase
            ? PHASE_WEIGHTS[job.current_phase] || 1
            : 1;
          futurePhasesMs = (projectedCurrent / currentWeight) * futureWeight;
        } else {
          return null;
        }
      }
    }

    return currentPhaseRemainingMs + futurePhasesMs;
  }, [job]);

  const overallPct = useMemo(() => {
    if (!job) return 0;
    if (job.status === "completed") return 100;
    const phaseFraction = job.phase_progress_total > 0
      ? Math.min(1, job.phase_progress_current / job.phase_progress_total)
      : 0;
    return Math.min(99, Math.round(((job.phases_completed + phaseFraction) / job.phases_total) * 100));
  }, [job]);

  async function startPipeline() {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("start-ingestion-pipeline", {
        body: {},
      });
      if (error) throw error;
      const jobId = (data as any)?.jobId;
      if (!jobId) throw new Error("Resposta inválida do servidor");
      const { data: created } = await supabase
        .from("ingestion_jobs" as any)
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      setJob(created as any);
      toast.success("Ingestão iniciada! Pode fechar esta janela — o processo continua no servidor.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao iniciar ingestão");
    } finally {
      setStarting(false);
    }
  }

  const [cancelling, setCancelling] = useState(false);
  async function cancelPipeline() {
    if (!job) return;
    if (!confirm("Cancelar a ingestão em andamento? O job será encerrado com segurança após o tick atual.")) return;
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-ingestion-pipeline", {
        body: { jobId: job.id },
      });
      if (error) throw error;
      toast.info("Ingestão cancelada. Aguardando o servidor encerrar o tick atual...");
      // Refresh immediately
      const { data: refreshed } = await supabase
        .from("ingestion_jobs" as any)
        .select("*")
        .eq("id", job.id)
        .maybeSingle();
      if (refreshed) setJob(refreshed as any);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao cancelar");
    } finally {
      setCancelling(false);
    }
  }

  const isActive = job && (job.status === "running" || job.status === "pending");

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        {isActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Database className="h-3.5 w-3.5" />
        )}
        Ingestão Manual
        {isActive && (
          <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {overallPct}%
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Ingestão Manual Completa
            </DialogTitle>
            <DialogDescription>
              Executa todo o pipeline em sequência: PNCP → Vencedores → Contratos → Sancionadas → Auto-Análise IA.
              O processo roda no servidor — você pode fechar esta janela.
            </DialogDescription>
          </DialogHeader>

          {!isActive && (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") && (
            <div className="space-y-4">
              {job && job.status === "completed" && (
                <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
                  <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">Última execução concluída</p>
                    <p className="text-muted-foreground">
                      {job.total_records_processed.toLocaleString("pt-BR")} registros processados
                      {job.started_at && job.finished_at && (
                        <> em {formatDuration(new Date(job.finished_at).getTime() - new Date(job.started_at).getTime())}</>
                      )}.
                    </p>
                  </div>
                </div>
              )}
              {job && (job.status === "failed" || job.status === "cancelled") && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">
                      {job.status === "cancelled" ? "Cancelada pelo usuário" : "Falhou"}
                    </p>
                    {job.error_message && (
                      <p className="text-muted-foreground">{job.error_message}</p>
                    )}
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm text-muted-foreground space-y-1">
                <p>O pipeline executa estas etapas em sequência:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Ingestão PNCP (últimos 7 dias, todas modalidades)</li>
                  <li>Busca de vencedores das homologadas</li>
                  <li>Contratos do Portal da Transparência</li>
                  <li>Empresas sancionadas (CEIS/CNEP)</li>
                  <li>Auto-análise IA das oportunidades</li>
                </ul>
              </div>
              <Button onClick={startPipeline} disabled={starting} className="w-full gap-2">
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Iniciar Ingestão Completa
              </Button>
            </div>
          )}

          {isActive && job && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">
                    {job.current_phase ? PHASE_LABEL[job.current_phase] : "Iniciando..."}
                  </span>
                  <span className="font-bold text-primary">{overallPct}%</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {job.phase_label || "Aguardando..."}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full bg-gradient-to-r from-primary to-module-purple"
                    initial={{ width: 0 }}
                    animate={{ width: `${overallPct}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Registros processados</p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {job.total_records_processed.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Tempo restante (estimado)</p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {eta !== null ? formatDuration(eta) : "calculando..."}
                  </p>
                </div>
              </div>

              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="rounded-lg border border-info/30 bg-info/5 p-3 text-xs text-muted-foreground"
                >
                  💡 Você pode fechar esta janela. O processo continua rodando no servidor e você pode reabrir a qualquer momento para acompanhar.
                </motion.div>
              </AnimatePresence>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  Fechar (continua rodando)
                </Button>
                <Button variant="destructive" className="gap-2" onClick={cancelPipeline} disabled={cancelling}>
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  {cancelling ? "Cancelando..." : "Cancelar ingestão"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

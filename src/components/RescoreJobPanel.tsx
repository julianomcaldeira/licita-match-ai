import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SCOPES = [
  { value: "existing", label: "Apenas já calculados" },
  { value: "pending", label: "Apenas pendentes" },
  { value: "all", label: "Todos (existentes + pendentes)" },
];

export function RescoreJobPanel({ onCompleted }: { onCompleted?: () => void }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<"existing" | "pending" | "all">("existing");
  const [max, setMax] = useState<number>(1000);
  const [jobId, setJobId] = useState<string | null>(() => localStorage.getItem("rescore_job_id"));
  const completedRef = useRef(false);

  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-orgao-score", {
        body: { mode: "rescore", scope, max },
      });
      if (error) throw error;
      return data as { job_id: string; queue_size: number };
    },
    onSuccess: (d) => {
      setJobId(d.job_id);
      localStorage.setItem("rescore_job_id", d.job_id);
      completedRef.current = false;
      toast({ title: "Reprocessamento iniciado", description: `${d.queue_size} órgãos na fila.` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const { data: job, refetch } = useQuery({
    queryKey: ["rescore-job", jobId],
    enabled: !!jobId,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === "running" || s === "pending" ? 2000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .select("*")
        .eq("id", jobId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (job?.status === "completed" && !completedRef.current) {
      completedRef.current = true;
      qc.invalidateQueries({ queryKey: ["top-orgaos-score"] });
      onCompleted?.();
    }
  }, [job?.status, qc, onCompleted]);

  const total = job?.phase_progress_total ?? 0;
  const done = job?.phase_progress_current ?? 0;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const ok = job?.state?.ok ?? 0;
  const fail = job?.state?.fail ?? 0;
  const recent: any[] = job?.state?.recent ?? [];
  const running = job?.status === "running" || job?.status === "pending";

  // ETA simples
  let eta = "—";
  if (running && job?.started_at && done > 0) {
    const elapsed = Date.now() - new Date(job.started_at).getTime();
    const rate = done / elapsed; // por ms
    const remaining = (total - done) / Math.max(rate, 1e-9);
    const min = Math.round(remaining / 60000);
    eta = min < 1 ? "<1min" : `~${min}min`;
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" /> Reprocessamento em lote
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Recalcula os scores aplicando as regras e a normalização atuais. Roda em background no servidor.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Escopo</div>
            <Select value={scope} onValueChange={(v) => setScope(v as any)} disabled={running}>
              <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Máx. órgãos</div>
            <Select value={String(max)} onValueChange={(v) => setMax(Number(v))} disabled={running}>
              <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[200, 500, 1000, 2000, 5000].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n.toLocaleString("pt-BR")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => start.mutate()} disabled={start.isPending || running}>
            {start.isPending || running
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Play className="h-4 w-4 mr-2" />}
            {running ? "Em execução..." : "Iniciar reprocessamento"}
          </Button>
        </div>
      </div>

      {job && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Badge variant={job.status === "completed" ? "default" : "secondary"}>
                {job.status}
              </Badge>
              <span className="text-muted-foreground">
                {done.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")} ({pct.toFixed(1)}%)
              </span>
              <span className="text-muted-foreground">· ETA {eta}</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> {ok}</span>
              <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-600" /> {fail}</span>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => refetch()}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <Progress value={pct} className="h-2" />

          {recent.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1">Últimos processados</div>
              <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                {recent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.status === "ok"
                        ? <CheckCircle2 className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                        : <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" />}
                      <span className="truncate font-medium" title={r.nome}>{r.nome}</span>
                      {r.uf && <Badge variant="secondary" className="text-[9px]">{r.uf}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {r.status === "ok" ? (
                        <>
                          <span className="font-mono">{r.score}</span>
                          <Badge variant="outline" className="text-[9px]">{r.classe}</Badge>
                          {Array.isArray(r.fontes) && r.fontes.length > 0 && (
                            <span className="text-muted-foreground text-[10px]">
                              {r.fontes.length} fonte{r.fontes.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-red-600 truncate max-w-[260px]" title={r.error}>
                          {r.error}
                        </span>
                      )}
                      <span className="text-muted-foreground text-[10px]">{r.ms}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

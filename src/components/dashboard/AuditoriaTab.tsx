import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, ShieldAlert, Loader2, PlayCircle, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type AuditRow = {
  id: string;
  executed_at: string;
  total_licitacoes: number;
  total_homologadas: number;
  total_com_itens: number;
  total_com_vencedores: number;
  homologadas_sem_itens: number;
  homologadas_sem_vencedores: number;
  itens_sem_vencedores: number;
  total_contratos: number;
  contratos_sem_licitacao: number;
  total_vencedores: number;
  pct_cobertura_homologadas: number;
  pct_cobertura_vencedores: number;
  inconsistencias: Array<{ tipo: string; count: number; mensagem: string }>;
  severity: string;
  duration_ms: number | null;
};

function severityBadge(sev: string) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    ok: { label: "OK", cls: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
    minor: { label: "Menor", cls: "bg-muted text-muted-foreground border-border", icon: AlertTriangle },
    warning: { label: "Atenção", cls: "bg-warning/10 text-warning border-warning/30", icon: AlertTriangle },
    critical: { label: "Crítico", cls: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  };
  const cfg = map[sev] || map.ok;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AuditoriaTab() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: audits, isLoading } = useQuery({
    queryKey: ["auditoria-ingestao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auditoria_ingestao" as any)
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as AuditRow[];
    },
    refetchInterval: 60000,
  });

  const runAudit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("run_ingestion_audit" as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Auditoria executada com sucesso");
      qc.invalidateQueries({ queryKey: ["auditoria-ingestao"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const latest = audits?.[0];
  const previous = audits?.[1];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Auditoria de Ingestão</h2>
          <p className="text-sm text-muted-foreground">
            Compara contagens esperadas (homologadas, itens e vencedores) e detecta inconsistências.
          </p>
        </div>
        <Button onClick={() => runAudit.mutate()} disabled={runAudit.isPending} size="sm">
          {runAudit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          Executar agora
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !latest ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border bg-card">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma auditoria executada ainda.</p>
          <p className="text-xs text-muted-foreground">Agendamento automático: diariamente às 04:00 (UTC).</p>
        </div>
      ) : (
        <>
          {/* Latest snapshot */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-foreground">Última Auditoria</h3>
                  {severityBadge(latest.severity)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtDate(latest.executed_at)} · {latest.duration_ms ? `${latest.duration_ms}ms` : ""}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Cobertura Homologadas" value={`${latest.pct_cobertura_homologadas}%`}
                trend={previous ? latest.pct_cobertura_homologadas - previous.pct_cobertura_homologadas : 0}
                good={latest.pct_cobertura_homologadas >= 95} />
              <MetricCard label="Cobertura Vencedores" value={`${latest.pct_cobertura_vencedores}%`}
                trend={previous ? latest.pct_cobertura_vencedores - previous.pct_cobertura_vencedores : 0}
                good={latest.pct_cobertura_vencedores >= 90} />
              <MetricCard label="Homologadas s/ Itens" value={fmtNum(latest.homologadas_sem_itens)}
                trend={previous ? previous.homologadas_sem_itens - latest.homologadas_sem_itens : 0}
                good={latest.homologadas_sem_itens === 0} invertTrend />
              <MetricCard label="Homologadas s/ Vencedores" value={fmtNum(latest.homologadas_sem_vencedores)}
                trend={previous ? previous.homologadas_sem_vencedores - latest.homologadas_sem_vencedores : 0}
                good={latest.homologadas_sem_vencedores === 0} invertTrend />
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Total Licitações" value={fmtNum(latest.total_licitacoes)} />
              <Stat label="Homologadas" value={fmtNum(latest.total_homologadas)} />
              <Stat label="Total Vencedores" value={fmtNum(latest.total_vencedores)} />
              <Stat label="Contratos órfãos" value={fmtNum(latest.contratos_sem_licitacao)} />
            </div>

            {latest.inconsistencias && latest.inconsistencias.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Inconsistências detectadas
                </h4>
                <ul className="space-y-1.5">
                  {latest.inconsistencias.map((inc, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-sm">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                      <span className="text-foreground">{inc.mensagem}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>

          {/* History */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Histórico de Auditorias
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Últimas {audits?.length} execuções</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Quando</th>
                    <th className="px-4 py-2 text-left font-medium">Severidade</th>
                    <th className="px-4 py-2 text-right font-medium">Cob. Homol.</th>
                    <th className="px-4 py-2 text-right font-medium">Cob. Venc.</th>
                    <th className="px-4 py-2 text-right font-medium">Sem Itens</th>
                    <th className="px-4 py-2 text-right font-medium">Sem Vencedores</th>
                    <th className="px-4 py-2 text-right font-medium">Inconsist.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {audits?.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                      <td className="px-4 py-2 text-foreground">{fmtDate(a.executed_at)}</td>
                      <td className="px-4 py-2">{severityBadge(a.severity)}</td>
                      <td className="px-4 py-2 text-right text-foreground">{a.pct_cobertura_homologadas}%</td>
                      <td className="px-4 py-2 text-right text-foreground">{a.pct_cobertura_vencedores}%</td>
                      <td className="px-4 py-2 text-right text-foreground">{fmtNum(a.homologadas_sem_itens)}</td>
                      <td className="px-4 py-2 text-right text-foreground">{fmtNum(a.homologadas_sem_vencedores)}</td>
                      <td className="px-4 py-2 text-right text-foreground">{a.inconsistencias?.length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, trend, good, invertTrend }: { label: string; value: string; trend: number; good: boolean; invertTrend?: boolean }) {
  const showTrend = trend !== 0;
  const trendPositive = invertTrend ? trend > 0 : trend > 0;
  return (
    <div className={`rounded-lg border p-3 ${good ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-xl font-bold text-foreground">{value}</span>
        {showTrend && (
          <span className={`flex items-center gap-0.5 text-xs ${trendPositive ? "text-success" : "text-destructive"}`}>
            {trendPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}

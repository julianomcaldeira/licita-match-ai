import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, XCircle, ShieldAlert, Loader2, PlayCircle, FileText, TrendingUp, TrendingDown, Calendar as CalendarIcon, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Inconsistencia = { tipo: string; count: number; mensagem: string; fonte?: string };

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
  inconsistencias: Inconsistencia[];
  severity: string;
  duration_ms: number | null;
};

type FonteFilter = "all" | "PNCP" | "PORTAL_TRANSPARENCIA";

const FONTE_LABEL: Record<string, string> = {
  PNCP: "PNCP",
  PORTAL_TRANSPARENCIA: "Portal Transparência",
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

function fonteBadge(fonte?: string) {
  if (!fonte) return null;
  const isPNCP = fonte === "PNCP";
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
      isPNCP ? "bg-primary/10 text-primary border-primary/30" : "bg-module-teal/10 text-module-teal border-module-teal/30"
    )}>
      {FONTE_LABEL[fonte] || fonte}
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
  const [fonteFilter, setFonteFilter] = useState<FonteFilter>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: audits, isLoading } = useQuery({
    queryKey: ["auditoria-ingestao", dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("auditoria_ingestao" as any)
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(60);
      if (dateFrom) query = query.gte("executed_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("executed_at", end.toISOString());
      }
      const { data, error } = await query;
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

  // Apply fonte filter on inconsistencias (history rows show only matching ones)
  const filteredAudits = useMemo(() => {
    if (!audits) return [];
    if (fonteFilter === "all") return audits;
    return audits
      .map((a) => ({
        ...a,
        inconsistencias: (a.inconsistencias || []).filter((i) => i.fonte === fonteFilter),
      }))
      // Hide rows that, after filtering, have zero inconsistencias for this fonte
      .filter((a) => (a.inconsistencias?.length ?? 0) > 0);
  }, [audits, fonteFilter]);

  const latest = audits?.[0];
  const previous = audits?.[1];

  const latestFilteredInconsist = useMemo(() => {
    if (!latest) return [];
    if (fonteFilter === "all") return latest.inconsistencias || [];
    return (latest.inconsistencias || []).filter((i) => i.fonte === fonteFilter);
  }, [latest, fonteFilter]);

  const hasActiveFilters = fonteFilter !== "all" || !!dateFrom || !!dateTo;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> Filtros:
        </div>

        {/* Fonte filter */}
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(["all", "PNCP", "PORTAL_TRANSPARENCIA"] as FonteFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFonteFilter(f)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition",
                fonteFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {f === "all" ? "Todas as fontes" : FONTE_LABEL[f]}
            </button>
          ))}
        </div>

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data inicial"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus
              className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data final"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus
              className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs"
            onClick={() => { setFonteFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !latest ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border bg-card">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma auditoria no período selecionado.</p>
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

            {(fonteFilter === "all" || fonteFilter === "PNCP") && (
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
            )}

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {(fonteFilter === "all" || fonteFilter === "PNCP") && (
                <>
                  <Stat label="Total Licitações (PNCP)" value={fmtNum(latest.total_licitacoes)} />
                  <Stat label="Homologadas (PNCP)" value={fmtNum(latest.total_homologadas)} />
                  <Stat label="Total Vencedores (PNCP)" value={fmtNum(latest.total_vencedores)} />
                </>
              )}
              {(fonteFilter === "all" || fonteFilter === "PORTAL_TRANSPARENCIA") && (
                <>
                  <Stat label="Total Contratos (Portal)" value={fmtNum(latest.total_contratos)} />
                  <Stat label="Contratos órfãos (Portal)" value={fmtNum(latest.contratos_sem_licitacao)} />
                </>
              )}
            </div>

            {latestFilteredInconsist.length > 0 ? (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Inconsistências detectadas
                  {fonteFilter !== "all" && (
                    <span className="text-xs font-normal text-muted-foreground">· {FONTE_LABEL[fonteFilter]}</span>
                  )}
                </h4>
                <ul className="space-y-1.5">
                  {latestFilteredInconsist.map((inc, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-sm">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                      <span className="text-foreground flex-1">{inc.mensagem}</span>
                      {fonteBadge(inc.fonte)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-2 rounded-md border border-success/30 bg-success/5 p-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-foreground">
                  Nenhuma inconsistência {fonteFilter !== "all" ? `para ${FONTE_LABEL[fonteFilter]}` : "detectada"}.
                </span>
              </div>
            )}
          </motion.div>

          {/* History */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Histórico de Auditorias
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {filteredAudits.length} execuç{filteredAudits.length === 1 ? "ão" : "ões"}
                {fonteFilter !== "all" && ` com inconsistências em ${FONTE_LABEL[fonteFilter]}`}
              </p>
            </div>
            <div className="table-scroll">
              <table className="table-sticky">
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
                  {filteredAudits.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum registro com os filtros atuais.
                      </td>
                    </tr>
                  ) : filteredAudits.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
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

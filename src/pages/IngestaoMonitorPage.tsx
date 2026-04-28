import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, Database, Activity,
  RefreshCw, Loader2, Brain, Building2, Search, ChevronLeft, ChevronRight, FileText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { IngerirContratosDialog } from "@/components/dashboard/IngerirContratosDialog";
import { ContratosIngestaoTab } from "@/components/dashboard/ContratosIngestaoTab";
import { IngestaoManualButton } from "@/components/dashboard/IngestaoManualButton";

const LOG_PAGE_SIZE = 20;

function StatusIcon({ status }: { status: string }) {
  if (status === "sucesso" || status === "completed")
    return <CheckCircle2 className="h-5 w-5 text-success" />;
  if (status === "parcial" || status === "running")
    return <AlertTriangle className="h-5 w-5 text-warning" />;
  return <XCircle className="h-5 w-5 text-destructive" />;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function IngestaoMonitorPage() {
  const { role } = useAuth();
  const isAdminCentral = role === "admin_central";
  const [logPage, setLogPage] = useState(0);

  const { data: logsResult, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ingestao-logs", logPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("ingestao_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data || [], totalCount: count || 0 };
    },
    refetchInterval: 30000,
  });

  const logs = logsResult?.rows || [];
  const logsTotalCount = logsResult?.totalCount || 0;
  const logsTotalPages = Math.max(1, Math.ceil(logsTotalCount / LOG_PAGE_SIZE));

  const { data: stats } = useQuery({
    queryKey: ["ingestao-stats"],
    queryFn: async () => {
      const [totalLic, totalItens, totalVenc, totalOps, totalEmpresas] = await Promise.all([
        supabase.from("licitacoes").select("*", { count: "exact", head: true }),
        supabase.from("licitacao_itens").select("*", { count: "exact", head: true }),
        supabase.from("licitacao_vencedores").select("*", { count: "exact", head: true }),
        supabase.from("oportunidades").select("*", { count: "exact", head: true }),
        supabase.from("empresas_clientes").select("*", { count: "exact", head: true }),
      ]);
      return {
        licitacoes: totalLic.count ?? 0,
        itens: totalItens.count ?? 0,
        vencedores: totalVenc.count ?? 0,
        oportunidades: totalOps.count ?? 0,
        empresas: totalEmpresas.count ?? 0,
      };
    },
    refetchInterval: 30000,
  });

  const { data: analysisStats } = useQuery({
    queryKey: ["analysis-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oportunidades")
        .select("empresa_id, score_aderencia, nivel_risco, tipo_oportunidade, empresas_clientes(nome)");
      if (error) throw error;

      const byEmpresa: Record<string, { nome: string; total: number; high: number; medium: number; low: number; avgScore: number }> = {};
      for (const op of data || []) {
        const eid = op.empresa_id;
        if (!byEmpresa[eid]) {
          byEmpresa[eid] = { nome: (op.empresas_clientes as any)?.nome || "—", total: 0, high: 0, medium: 0, low: 0, avgScore: 0 };
        }
        byEmpresa[eid].total++;
        if (op.score_aderencia >= 80) byEmpresa[eid].high++;
        else if (op.score_aderencia >= 50) byEmpresa[eid].medium++;
        else byEmpresa[eid].low++;
        byEmpresa[eid].avgScore += op.score_aderencia;
      }
      for (const e of Object.values(byEmpresa)) {
        e.avgScore = e.total > 0 ? Math.round(e.avgScore / e.total) : 0;
      }
      return Object.values(byEmpresa);
    },
    refetchInterval: 30000,
  });

  const successCount = logs.filter((l) => l.status === "sucesso" || l.status === "completed").length;
  const errorCount = logs.filter((l) => l.status !== "sucesso" && l.status !== "parcial" && l.status !== "completed" && l.status !== "running").length;
  const parcialCount = logs.filter((l) => l.status === "parcial" || l.status === "running").length;

  const summaryCards = [
    { label: "Total Licitações", value: stats?.licitacoes.toLocaleString("pt-BR") ?? "—", icon: Database, color: "text-primary" },
    { label: "Itens Processados", value: stats?.itens.toLocaleString("pt-BR") ?? "—", icon: Activity, color: "text-module-teal" },
    { label: "Vencedores", value: stats?.vencedores.toLocaleString("pt-BR") ?? "—", icon: CheckCircle2, color: "text-success" },
    { label: "Execuções c/ Sucesso", value: successCount.toString(), icon: CheckCircle2, color: "text-success" },
    { label: "Execuções Parciais", value: parcialCount.toString(), icon: AlertTriangle, color: "text-warning" },
    { label: "Execuções c/ Erro", value: errorCount.toString(), icon: XCircle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Monitor de Ingestão</h1>
          <p className="text-sm text-muted-foreground">Acompanhe as execuções diárias automáticas do PNCP</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdminCentral && <IngerirContratosDialog />}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary transition disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
            </div>
            <p className="mt-2 font-display text-xl font-bold text-foreground">{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Cron schedule info */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Clock className="h-4 w-4 text-primary" />
          Agendamento Automático (Pipeline Diário)
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            01:00 — <strong className="text-foreground">Ingestão PNCP</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-module-purple" />
            02:00 — <strong className="text-foreground">Busca Vencedores</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" />
            03:00 — <strong className="text-foreground">Auto-Análise IA</strong>
          </span>
        </div>
      </div>

      {/* Tabs: Ingestão + Auto-Análise */}
      <Tabs defaultValue="ingestao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ingestao" className="gap-1.5"><Database className="h-3.5 w-3.5" /> Ingestão</TabsTrigger>
          <TabsTrigger value="contratos" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Contratos</TabsTrigger>
          <TabsTrigger value="analise" className="gap-1.5"><Brain className="h-3.5 w-3.5" /> Auto-Análise IA</TabsTrigger>
        </TabsList>

        <TabsContent value="contratos">
          <ContratosIngestaoTab />
        </TabsContent>

        <TabsContent value="ingestao">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Clock className="h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma execução registrada</h2>
              <p className="mt-2 text-sm text-muted-foreground">O primeiro ciclo automático será executado à 01:00 AM (UTC).</p>
            </div>
          ) : (
            <>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fonte</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Endpoint</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Registros</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Período</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Executado em</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition">
                          <td className="px-4 py-3"><StatusIcon status={log.status} /></td>
                          <td className="px-4 py-3 font-medium text-foreground">{log.fonte}</td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{log.endpoint}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{log.registros_processados?.toLocaleString("pt-BR") ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{log.data_inicio || "—"} → {log.data_fim || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(log.created_at)}</td>
                          <td className="px-4 py-3 max-w-[200px] truncate text-xs text-destructive">{log.erro || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  {logsTotalCount.toLocaleString("pt-BR")} registros
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLogPage((p) => Math.max(0, p - 1))} disabled={logPage === 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {logPage + 1} / {logsTotalPages}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setLogPage((p) => p + 1)} disabled={logPage + 1 >= logsTotalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="analise">
          {/* Summary cards for analysis */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Empresas</span>
              </div>
              <p className="mt-2 font-display text-xl font-bold text-foreground">{stats?.empresas ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Total Análises</span>
              </div>
              <p className="mt-2 font-display text-xl font-bold text-foreground">{stats?.oportunidades?.toLocaleString("pt-BR") ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-xs font-medium text-muted-foreground">Score ≥ 80</span>
              </div>
              <p className="mt-2 font-display text-xl font-bold text-success">
                {analysisStats?.reduce((s, e) => s + e.high, 0) ?? "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-warning" />
                <span className="text-xs font-medium text-muted-foreground">Score 50-79</span>
              </div>
              <p className="mt-2 font-display text-xl font-bold text-warning">
                {analysisStats?.reduce((s, e) => s + e.medium, 0) ?? "—"}
              </p>
            </div>
          </div>

          {!analysisStats?.length ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Brain className="h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma análise realizada</h2>
              <p className="mt-2 text-sm text-muted-foreground">A auto-análise roda diariamente às 03:00 AM (UTC).</p>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Empresa</th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">Total Analisadas</th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">Score Médio</th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground"><span className="text-success">≥80</span></th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground"><span className="text-warning">50-79</span></th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground"><span className="text-destructive">&lt;50</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisStats.map((e, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30 transition">
                        <td className="px-4 py-3 font-medium text-foreground">{e.nome}</td>
                        <td className="px-4 py-3 text-center text-foreground">{e.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            e.avgScore >= 80 ? "bg-success/10 text-success" : e.avgScore >= 50 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                          }`}>
                            {e.avgScore}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-success">{e.high}</td>
                        <td className="px-4 py-3 text-center font-medium text-warning">{e.medium}</td>
                        <td className="px-4 py-3 text-center font-medium text-destructive">{e.low}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

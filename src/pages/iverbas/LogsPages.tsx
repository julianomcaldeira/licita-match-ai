import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { Activity, RefreshCw, CheckCircle2, XCircle, Clock, Database, Loader2, CalendarDays, AlertTriangle, Percent, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CsvImportPanel from "@/components/iverbas/CsvImportPanel";
import DataQualityBadge from "@/components/iverbas/DataQualityBadge";


interface ApiLog {
  id: string;
  api_name: string;
  endpoint: string | null;
  request_time: string;
  status: string;
  http_status: number | null;
  response_time_ms: number | null;
  records_imported: number | null;
  error_message: string | null;
}

interface SyncStats {
  total: number;
  success: number;
  error: number;
  lastSync: string | null;
  totalRecords: number;
}

const AccessLogsPage: React.FC = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<Array<{ id: string; login_time: string; user_id: string; ip_address: string | null; user_agent: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from("login_logs")
        .select("*")
        .order("login_time", { ascending: false })
        .limit(50);
      setLogs(data || []);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground">{t("accessLogs")}</h1>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">{t("noData")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">User ID</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Data/Hora</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">IP</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">User Agent</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-foreground">{l.user_id.slice(0, 8)}...</td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{new Date(l.login_time).toLocaleString("pt-BR")}</td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{l.ip_address || "-"}</td>
                  <td className="py-3 px-4 text-muted-foreground text-xs truncate max-w-[200px]">{l.user_agent || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>
    </div>
  );
};

interface IntegrityAnomaly {
  id: string;
  tipo_erro: string;
  entidade: string;
  valor_detectado: number;
  valor_referencia: number;
  divergencia_pct: number | null;
  detalhes: { severidade?: string; nota?: string; campo?: string; ano?: number } | null;
  created_at: string;
}

const ApiLogsPage: React.FC = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [stats, setStats] = useState<SyncStats>({ total: 0, success: 0, error: 0, lastSync: null, totalRecords: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dbCounts, setDbCounts] = useState({ orcamento: 0, despesas: 0, unificadoOrc: 0, unificadoExec: 0, integrityErrors: 0 });
  const [anomalies, setAnomalies] = useState<IntegrityAnomaly[]>([]);
  const [coverageRows, setCoverageRows] = useState<Array<{ orgao_codigo: string; orgao_nome: string; total_amostra: number; total_oficial: number; cobertura_pct: number; status: string }>>([]);
  const [pncpProgress, setPncpProgress] = useState<{ cursor: Record<string, unknown>; updated_at: string } | null>(null);


  const fetchData = async () => {
    setLoading(true);

    const [logsRes, orcRes, despRes, unOrcRes, unExecRes, intRes, anomRes] = await Promise.all([
      supabase.from("api_logs").select("*").order("request_time", { ascending: false }).limit(100),
      supabase.from("orcamento_anual").select("id", { count: "exact", head: true }),
      supabase.from("execucao_despesa").select("id", { count: "exact", head: true }),
      supabase.from("orcamento_unificado").select("id", { count: "exact", head: true }),
      supabase.from("execucao_unificada").select("id", { count: "exact", head: true }),
      supabase.from("data_integrity_logs").select("id", { count: "exact", head: true }),
      supabase.from("data_integrity_logs")
        .select("*")
        .in("tipo_erro", ["anomalia_faixa", "sanidade_total_federal"])
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const allLogs = logsRes.data || [];
    setLogs(allLogs);
    setAnomalies((anomRes.data || []) as IntegrityAnomaly[]);
    setDbCounts({
      orcamento: orcRes.count || 0,
      despesas: despRes.count || 0,
      unificadoOrc: unOrcRes.count || 0,
      unificadoExec: unExecRes.count || 0,
      integrityErrors: intRes.count || 0,
    });

    const successLogs = allLogs.filter((l) => l.status === "success");
    const errorLogs = allLogs.filter((l) => l.status === "error");
    setStats({
      total: allLogs.length,
      success: successLogs.length,
      error: errorLogs.length,
      lastSync: allLogs.length > 0 ? allLogs[0].request_time : null,
      totalRecords: allLogs.reduce((sum, l) => sum + (l.records_imported || 0), 0),
    });

    // Coverage per orgao — reconciliação real gravada por sync-pagamentos-diarios
    const currentYear = new Date().getFullYear();
    const { data: covData } = await supabase
      .from("consolidacao_diaria_validacao")
      .select("orgao_codigo, orgao_nome, total_amostra, total_oficial, cobertura_pct, status")
      .eq("ano", currentYear)
      .not("orgao_codigo", "is", null)
      .order("cobertura_pct", { ascending: true })
      .limit(200);
    setCoverageRows((covData || []).map((r) => ({
      orgao_codigo: r.orgao_codigo as string,
      orgao_nome: (r.orgao_nome as string) || "",
      total_amostra: Number(r.total_amostra || 0),
      total_oficial: Number(r.total_oficial || 0),
      cobertura_pct: Number(r.cobertura_pct || 0),
      status: (r.status as string) || "",
    })));


    // PNCP progressive collection cursor
    const currentYearJob = `pncp-contratos-${currentYear}`;
    const { data: progressData } = await (supabase as any)
      .from("sync_state")
      .select("cursor, updated_at")
      .eq("job_name", currentYearJob)
      .maybeSingle();
    setPncpProgress(progressData || null);

    setLoading(false);
  };


  useEffect(() => {
    fetchData();
  }, []);

  const triggerSync = async (codigoOrgao?: string) => {
    setSyncing(true);
    try {
      const payload: Record<string, unknown> = { ano: new Date().getFullYear(), syncType: "all" };
      if (codigoOrgao) payload.codigoOrgao = codigoOrgao;

      await supabase.functions.invoke("trigger-sync", {
        body: { target: "sync-transparencia", payload },
      });
      await fetchData();
    } catch (e) {
      console.error("Sync error:", e);
    }
    setSyncing(false);
  };

  const statCards = [
    { label: "Total de Syncs", value: stats.total, icon: Activity, color: "text-primary" },
    { label: "Sucesso", value: stats.success, icon: CheckCircle2, color: "text-emerald-500" },
    { label: "Erros", value: stats.error, icon: XCircle, color: "text-destructive" },
    { label: "Registros Importados", value: stats.totalRecords.toLocaleString("pt-BR"), icon: Database, color: "text-blue-500" },
  ];

  const orgaos = [
    { codigo: "20000", nome: "Presidência" },
    { codigo: "22000", nome: "Agricultura" },
    { codigo: "24000", nome: "Ciência e Tec." },
    { codigo: "25000", nome: "Fazenda" },
    { codigo: "26000", nome: "Educação" },
    { codigo: "28000", nome: "Desenv. e Indústria" },
    { codigo: "30000", nome: "Justiça" },
    { codigo: "32000", nome: "Minas e Energia" },
    { codigo: "33000", nome: "Previdência" },
    { codigo: "35000", nome: "Relações Ext." },
    { codigo: "36000", nome: "Saúde" },
    { codigo: "38000", nome: "Trabalho" },
    { codigo: "39000", nome: "Transportes" },
    { codigo: "40000", nome: "Comunicações" },
    { codigo: "41000", nome: "Cidades" },
    { codigo: "42000", nome: "Cultura" },
    { codigo: "44000", nome: "Meio Ambiente" },
    { codigo: "49000", nome: "Desenv. Agrário" },
    { codigo: "51000", nome: "Esporte" },
    { codigo: "52000", nome: "Defesa" },
    { codigo: "53000", nome: "Desenv. Social" },
    { codigo: "54000", nome: "Turismo" },
    { codigo: "55000", nome: "Integração Reg." },
    { codigo: "56000", nome: "Gestão e Inovação" },
    { codigo: "57000", nome: "Povos Indígenas" },
    { codigo: "58000", nome: "Igualdade Racial" },
    { codigo: "59000", nome: "Mulheres" },
    { codigo: "60000", nome: "Portos e Aeroportos" },
    { codigo: "81000", nome: "Pesca" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("apiLogs")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento de sincronização com o Portal da Transparência
          </p>
        </div>
        <button
          onClick={() => fetchData()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t("refresh")}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card rounded-xl border border-border p-4 shadow-card"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{loading ? "..." : card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Coverage Card — sample vs official paid total */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border p-5 shadow-card"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
            <Percent className="w-4 h-4 text-primary" />
            {t("coverageCardTitle")}
            <DataQualityBadge variant="sample" />
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{t("coverageCardHint")}</p>
          {loading ? (
            <p className="text-sm text-muted-foreground mt-3">...</p>
          ) : coverageRows.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">{t("noData")}</p>
          ) : (
            <div className="mt-3 max-h-80 overflow-y-auto border border-border/50 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t("coverageColOrgao")}</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">{t("coverageColSample")}</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">{t("coverageColOfficial")}</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">{t("coverageColPct")}</th>
                  </tr>
                </thead>
                <tbody>
                  {coverageRows.map((r) => (
                    <tr
                      key={r.orgao_codigo}
                      className={`border-b border-border/40 ${r.status === "cobertura_baixa" ? "bg-amber-500/5" : ""}`}
                    >
                      <td className="py-2 px-3 text-foreground truncate max-w-[280px]" title={r.orgao_nome}>
                        <span className="font-mono text-muted-foreground mr-2">{r.orgao_codigo}</span>
                        {r.orgao_nome}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                        R$ {(r.total_amostra / 1e6).toFixed(2)}M
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                        R$ {(r.total_oficial / 1e6).toFixed(2)}M
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-semibold ${r.status === "cobertura_baixa" ? "text-amber-600" : "text-foreground"}`}>
                        {r.cobertura_pct.toFixed(2).replace(".", ",")}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>


      {/* PNCP Progressive collection card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border p-5 shadow-card"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
            <Package className="w-4 h-4 text-primary" />
            {t("pncpProgressTitle")}
            <DataQualityBadge variant="contracts" />
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{t("pncpProgressHint")}</p>
          <p className="text-2xl font-display font-bold text-foreground mt-2">
            {loading
              ? "..."
              : !pncpProgress
                ? t("pncpProgressNoJob")
                : (pncpProgress.cursor as any)?.concluido
                  ? t("pncpProgressComplete")
                  : t("pncpProgressCurrent")
                      .replace("{mes}", String((pncpProgress.cursor as any)?.mes ?? "?"))
                      .replace("{pagina}", String((pncpProgress.cursor as any)?.pagina ?? "?"))}
          </p>
          {pncpProgress && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {t("pncpProgressLastRun").replace("{when}", new Date(pncpProgress.updated_at).toLocaleString("pt-BR"))}
            </p>
          )}
        </div>
      </motion.div>


      {/* Alert Banner for recent errors */}

      {!loading && (() => {
        const recentProblems = logs.filter(
          (l) => (l.status === "error" || l.status === "partial") &&
            new Date(l.request_time) > new Date(Date.now() - 48 * 60 * 60 * 1000)
        );
        if (recentProblems.length === 0) return null;
        const errorCount = recentProblems.filter(l => l.status === "error").length;
        const partialCount = recentProblems.filter(l => l.status === "partial").length;
        return (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-destructive">
                Problemas detectados nas últimas 48h
              </h4>
              <p className="text-xs text-destructive/80 mt-1">
                {errorCount > 0 && `${errorCount} falha(s) completa(s)`}
                {errorCount > 0 && partialCount > 0 && " e "}
                {partialCount > 0 && `${partialCount} coleta(s) parcial(is)`}
                {" — "}verifique os detalhes na tabela abaixo.
              </p>
              <div className="mt-2 space-y-1">
                {recentProblems.slice(0, 5).map((l) => (
                  <div key={l.id} className="text-xs text-destructive/70 font-mono">
                    [{new Date(l.request_time).toLocaleString("pt-BR")}] {l.api_name}: {l.error_message || l.status}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* Range Anomaly Banner — pós-sync validation */}
      {!loading && anomalies.length > 0 && (() => {
        const sevColor = (s?: string) =>
          s === "critica" ? "text-destructive border-destructive/40 bg-destructive/10"
          : s === "alta" ? "text-amber-700 border-amber-500/40 bg-amber-500/10"
          : "text-yellow-700 border-yellow-500/40 bg-yellow-500/10";
        const critCount = anomalies.filter(a => a.detalhes?.severidade === "critica").length;
        return (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-amber-500/30 rounded-xl p-5 shadow-card"
          >
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Validação pós-sync: {anomalies.length} anomalia(s) de faixa detectada(s)
                  {critCount > 0 && <span className="ml-2 text-destructive">({critCount} crítica{critCount > 1 ? "s" : ""})</span>}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Totais consolidados (empenhado/liquidado/pago) fora das faixas esperadas para o orçamento federal.
                </p>
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {anomalies.map((a) => (
                <div
                  key={a.id}
                  className={`text-xs rounded-lg border px-3 py-2 ${sevColor(a.detalhes?.severidade)}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold">{a.entidade}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wide">
                      {a.detalhes?.severidade || "media"} · {a.divergencia_pct ?? 0}%
                    </span>
                  </div>
                  <div className="text-[11px] opacity-90">
                    {a.detalhes?.nota || `${a.tipo_erro}: detectado R$ ${(a.valor_detectado / 1e9).toFixed(2)}B vs ref. R$ ${(a.valor_referencia / 1e9).toFixed(2)}B`}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        );
      })()}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Database status */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-xl border border-border p-5 shadow-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Status do Banco de Dados
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Orçamento Unificado (canônico)</span>
              <span className="text-sm font-bold text-foreground">{loading ? "..." : dbCounts.unificadoOrc.toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Execução Unificada (canônico)</span>
              <span className="text-sm font-bold text-foreground">{loading ? "..." : dbCounts.unificadoExec.toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Orçamento (legado)</span>
              <span className="text-xs text-muted-foreground">{loading ? "..." : dbCounts.orcamento.toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Execução (legado)</span>
              <span className="text-xs text-muted-foreground">{loading ? "..." : dbCounts.despesas.toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Erros de Integridade</span>
              <span className={`text-sm font-bold ${dbCounts.integrityErrors > 0 ? "text-destructive" : "text-foreground"}`}>
                {loading ? "..." : dbCounts.integrityErrors}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Última sincronização
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {stats.lastSync ? new Date(stats.lastSync).toLocaleString("pt-BR") : "Nunca"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Sync controls */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-card rounded-xl border border-border p-5 shadow-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            Sincronização Manual
          </h3>
          <div className="mb-3">
            <button
              disabled={syncing}
              onClick={() => triggerSync()}
              className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 mb-3"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar TODOS os Órgãos ({orgaos.length})
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {orgaos.map((org) => (
              <button
                key={org.codigo}
                disabled={syncing}
                onClick={() => triggerSync(org.codigo)}
                className="px-2 py-1 text-[10px] font-medium rounded-md bg-muted hover:bg-primary hover:text-primary-foreground disabled:opacity-50 transition-colors"
              >
                {org.nome}
              </button>
            ))}
          </div>
           <div className="mt-4 pt-3 border-t border-border space-y-2">
            <button
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  // Sync daily payments (yesterday)
                  await supabase.functions.invoke("trigger-sync", {
                    body: {
                      target: "sync-pagamentos-diarios",
                      payload: { mesAno: `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}` },
                    },
                  });
                  await fetchData();
                } catch (e) {
                  console.error("Daily sync error:", e);
                }
                setSyncing(false);
              }}
              className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
              Sync Pagamentos Diários (mês atual)
            </button>
            <button
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  await supabase.functions.invoke("trigger-sync", {
                    body: {
                      target: "compute-analytics",
                      payload: { ano: new Date().getFullYear(), computeType: "all" },
                    },
                  });
                  await fetchData();
                } catch (e) {
                  console.error("Analytics error:", e);
                }
                setSyncing(false);
              }}
              className="w-full px-4 py-2 text-sm font-semibold rounded-lg gradient-brand text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              Recalcular Analytics (iScores, Insights, HHI)
            </button>
            <button
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  await supabase.functions.invoke("trigger-sync", {
                    body: { target: "sync-contratos-gov", payload: {} },
                  });
                  await fetchData();
                } catch (e) {
                  console.error("Contratos sync error:", e);
                }
                setSyncing(false);
              }}
              className="w-full px-4 py-2 text-sm font-semibold rounded-lg gradient-brand text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
              Sincronizar contratos (Contratos.gov.br)
            </button>
            <button
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const { data, error } = await supabase.functions.invoke("bootstrap-sync-secret");
                  if (error) console.error("Bootstrap error:", error);
                  else console.log("Bootstrap:", data);
                } catch (e) {
                  console.error("Bootstrap error:", e);
                }
                setSyncing(false);
              }}
              className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-muted hover:bg-muted/80 text-foreground disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Sincronizar segredo do cron (rodar uma vez)
            </button>

          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Consolidação dirigida por <strong>pagamento real</strong>. SUM(empresas) = TOTAL(governo) por dia.
          </p>
        </motion.div>
      </div>

      {/* CSV Import */}
      <CsvImportPanel onImportComplete={fetchData} />

      {/* Logs Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card rounded-xl border border-border shadow-card overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Histórico de Requisições</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">{t("noData")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">API</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Endpoint</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Data/Hora</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("status")}</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Registros</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Erro</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className={`border-b border-border/50 transition-colors ${l.status === "error" ? "bg-destructive/5 hover:bg-destructive/10" : l.status === "partial" ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-muted/30"}`}>
                    <td className="py-3 px-4 font-medium text-foreground">{l.api_name}</td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{l.endpoint || "-"}</td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-xs">
                      {new Date(l.request_time).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          l.status === "success"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            : l.status === "error"
                            ? "bg-destructive/15 text-destructive border-destructive/40"
                            : l.status === "partial"
                            ? "bg-amber-500/15 text-amber-700 border-amber-500/40"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {l.status === "success" ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : l.status === "error" ? (
                          <XCircle className="w-3 h-3" />
                        ) : l.status === "partial" ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {l.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-foreground">
                      {(l.records_imported || 0).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 px-4 text-xs text-destructive max-w-[200px] truncate">
                      {l.error_message || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export { AccessLogsPage, ApiLogsPage };

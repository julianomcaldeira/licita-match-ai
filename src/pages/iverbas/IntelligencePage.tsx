import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/hooks/iverbas/useBudgetData";
import {
  Lightbulb,
  TrendingUp,
  Shield,
  Target,
  BarChart3,
  AlertTriangle,
  Loader2,
  Gauge,
  Search,
  X,
} from "lucide-react";
import InfoTooltip from "@/components/iverbas/InfoTooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IScore {
  id: string;
  entidade_tipo: string;
  entidade_nome: string;
  entidade_id: string | null;
  tipo_score: string;
  valor: number;
  componentes: Record<string, unknown>;
  periodo: string;
}

interface Insight {
  id: string;
  tipo_insight: string;
  descricao: string;
  orgao: string | null;
  fornecedor: string | null;
  relevancia_score: number;
  data_referencia: string;
}

interface ConcentrationData {
  id: string;
  orgao: string;
  hhi_index: number;
  top3_pct: number;
  top5_pct: number;
  total_fornecedores: number;
  total_pago: number;
  classificacao: string;
}

interface ExecutiveReport {
  id: string;
  mes_referencia: string;
  resumo_gerado: string;
  dados_json: {
    totalPago: number;
    totalEmpenhado: number;
    totalDotacao: number;
    totalContratos: number;
    numContratos: number;
    execRate: number;
    topOrgans: Array<{ orgao: string; dotacao: number; empenhado: number; pago: number }>;
    topSuppliers: Array<{ cnpj: string; nome: string; valor: number }>;
    availableByOrgan: Array<{ orgao: string; disponivel: number; dotacao: number }>;
  };
}

const scoreConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  oportunidade: { label: "Oportunidade", icon: Target, color: "text-blue-500" },
  dominio_mercado: { label: "Domínio de Mercado", icon: Shield, color: "text-amber-500" },
  dependencia_publica: { label: "Dependência Pública", icon: AlertTriangle, color: "text-red-500" },
};

const insightIcons: Record<string, string> = {
  concentracao_fornecedor: "🏢",
  oportunidade_orcamentaria: "💰",
  aceleracao_empenho: "⚡",
  crescimento_anormal: "📈",
};

const ScoreGauge: React.FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => (
  <div className="flex flex-col items-center gap-2">
    <div className="relative w-16 h-16">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="14" fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={`${value * 0.88} 88`}
          className={color}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{value}</span>
    </div>
    <span className="text-xs text-muted-foreground text-center">{label}</span>
  </div>
);

const CONC_PER_PAGE = 50;

const IntelligencePage: React.FC = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [iscores, setIscores] = useState<IScore[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [concentration, setConcentration] = useState<ConcentrationData[]>([]);
  const [report, setReport] = useState<ExecutiveReport | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "iscores" | "insights" | "concentration">("overview");
  const [concSearch, setConcSearch] = useState("");
  const [concPage, setConcPage] = useState(1);
  const [scoresSearch, setScoresSearch] = useState("");
  const [scoresPage, setScoresPage] = useState(1);

  const SCORES_PER_PAGE = 50;

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const ano = new Date().getFullYear();
    // Fetch iscores sem limite — paginação feita no frontend
    let allScores: IScore[] = [];
    let scoresPage = 0;
    const BATCH = 1000;
    while (true) {
      const { data: batch } = await supabase
        .from("iscores")
        .select("*")
        .eq("ano", ano)
        .order("valor", { ascending: false })
        .range(scoresPage * BATCH, (scoresPage + 1) * BATCH - 1);
      if (!batch || batch.length === 0) break;
      allScores = allScores.concat(batch as IScore[]);
      if (batch.length < BATCH) break;
      scoresPage++;
    }

    const [insightsRes, concRes, reportRes] = await Promise.all([
      supabase.from("market_insights").select("*").order("relevancia_score", { ascending: false }).limit(30),
      supabase.from("concentration_analysis").select("*").eq("ano", ano).order("hhi_index", { ascending: false }),
      supabase.from("executive_reports").select("*").eq("ano", ano).order("created_at", { ascending: false }).limit(1),
    ]);

    setIscores(allScores);
    setInsights((insightsRes.data as Insight[]) || []);
    setConcentration((concRes.data as ConcentrationData[]) || []);
    setReport((reportRes.data?.[0] as unknown as ExecutiveReport) || null);
    setLoading(false);
  }

  const organScores = iscores.filter((s) => s.entidade_tipo === "orgao");
  const fornScores = iscores.filter((s) => s.entidade_tipo === "fornecedor");

  const filteredOrgScores = useMemo(() => {
    if (!scoresSearch.trim()) return organScores;
    const q = scoresSearch.toLowerCase();
    return organScores.filter((s) => s.entidade_nome.toLowerCase().includes(q));
  }, [organScores, scoresSearch]);

  const scoresTotalPages = Math.ceil(filteredOrgScores.length / SCORES_PER_PAGE);
  const scoresPaged = filteredOrgScores.slice((scoresPage - 1) * SCORES_PER_PAGE, scoresPage * SCORES_PER_PAGE);

  const handleScoresSearch = (val: string) => {
    setScoresSearch(val);
    setScoresPage(1);
  };

  const filteredConc = useMemo(() => {
    if (!concSearch.trim()) return concentration;
    const q = concSearch.toLowerCase();
    return concentration.filter((c) => c.orgao.toLowerCase().includes(q));
  }, [concentration, concSearch]);

  const concTotalPages = Math.ceil(filteredConc.length / CONC_PER_PAGE);
  const concPaged = filteredConc.slice((concPage - 1) * CONC_PER_PAGE, concPage * CONC_PER_PAGE);

  const handleConcSearch = (val: string) => {
    setConcSearch(val);
    setConcPage(1);
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs = [
    { key: "overview", label: "Visão Geral", icon: Gauge, tooltip: "Resumo dos principais indicadores e alertas" },
    { key: "iscores", label: "Notas", icon: BarChart3, tooltip: "Notas de 0 a 100 para cada órgão e empresa" },
    { key: "insights", label: "Alertas", icon: Lightbulb, tooltip: "Avisos automáticos sobre situações que merecem atenção" },
    { key: "concentration", label: "Concorrência", icon: Shield, tooltip: "Análise de quantas empresas dividem o dinheiro de cada órgão" },
  ] as const;


  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          Inteligência Estratégica
          <InfoTooltip text="Reúne análises automáticas sobre os gastos do governo: notas de oportunidade para cada órgão e empresa, alertas importantes e análise de concorrência. Tudo é atualizado automaticamente após cada importação de dados." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Notas, alertas e análise de concorrência</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit flex-wrap">
        {tabs.map((tab) => (
          <Tooltip key={tab.key}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-xs">{tab.tooltip}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Executive Summary */}
          {report && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-6 shadow-card">
              <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Relatório Executivo — {report.mes_referencia}
                <InfoTooltip text="Resumo automático do mês: quanto foi pago, quanto havia disponível e qual o percentual de execução." />
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{report.resumo_gerado}</p>
              {report.dados_json && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Orçamento Autorizado</p>
                    <p className="text-lg font-bold text-foreground">{formatBRL(report.dados_json.totalDotacao)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Empenhado</p>
                    <p className="text-lg font-bold text-foreground">{formatBRL(report.dados_json.totalEmpenhado || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Pago</p>
                    <p className="text-lg font-bold text-foreground">{formatBRL(report.dados_json.totalPago)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contratos PNCP</p>
                    <p className="text-lg font-bold text-primary">{report.dados_json.numContratos || 0} ({formatBRL(report.dados_json.totalContratos || 0)})</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Key Insights */}
          {insights.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border p-6 shadow-card">
              <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-warning" />
                Alertas Estratégicos ({insights.length})
                <InfoTooltip text="Avisos gerados automaticamente quando algo fora do comum é detectado, como concentração alta de pagamentos em poucas empresas ou crescimento anormal de gastos." />
              </h2>
              <div className="space-y-3">
                {insights.slice(0, 5).map((ins) => (
                  <div key={ins.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <span className="text-lg">{insightIcons[ins.tipo_insight] || "📊"}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{ins.descricao}</p>
                      <p className="text-xs text-muted-foreground mt-1">{ins.orgao} • Relevância: {ins.relevancia_score}/100</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      ins.relevancia_score >= 80 ? "bg-destructive/10 text-destructive" :
                      ins.relevancia_score >= 50 ? "bg-amber-500/10 text-amber-600" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {ins.relevancia_score}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* No data message */}
          {!report && insights.length === 0 && iscores.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Nenhum dado de inteligência disponível</p>
              <p className="text-sm mt-2">Execute o cálculo de analytics na página de Logs de API para gerar iScores, insights e análises de concentração.</p>
            </div>
          )}
        </div>
      )}

      {/* ISCORES TAB */}
      {activeTab === "iscores" && (
        <div className="space-y-6">
          {/* Organ Scores */}
          {organScores.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              {/* Header com busca */}
              <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                  <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
                    Notas por Órgão
                    <InfoTooltip text="Cada órgão recebe uma nota de 0 a 100 em diferentes critérios: oportunidade (potencial de negócio), domínio de mercado (se poucas empresas dominam) e dependência pública (quanto uma empresa depende do governo)." />
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{organScores.length} órgão{organScores.length !== 1 ? "s" : ""} no total</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar órgão..."
                    value={scoresSearch}
                    onChange={(e) => handleScoresSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  />
                  {scoresSearch && (
                    <button
                      onClick={() => handleScoresSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {scoresSearch && (
                <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs text-muted-foreground">
                  {filteredOrgScores.length === 0
                    ? "Nenhum órgão encontrado."
                    : `${filteredOrgScores.length} órgão${filteredOrgScores.length !== 1 ? "s" : ""} encontrado${filteredOrgScores.length !== 1 ? "s" : ""}`}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">#</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Órgão</th>
                      <th className="text-center py-3 px-4 text-muted-foreground font-medium">Tipo de Nota</th>
                      <th className="text-center py-3 px-4 text-muted-foreground font-medium">Nota (0–100)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoresPaged.map((s, idx) => {
                      const cfg = scoreConfig[s.tipo_score] || { label: s.tipo_score, icon: BarChart3, color: "text-primary" };
                      const globalIdx = (scoresPage - 1) * SCORES_PER_PAGE + idx + 1;
                      return (
                        <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-4 text-muted-foreground text-xs">{globalIdx}</td>
                          <td className="py-2 px-4 font-medium text-foreground">{s.entidade_nome}</td>
                          <td className="py-2 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                              <cfg.icon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full gradient-brand" style={{ width: `${s.valor}%` }} />
                              </div>
                              <span className="text-xs font-bold text-foreground w-8">{s.valor}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredOrgScores.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nenhum órgão encontrado para "{scoresSearch}".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {scoresTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {(scoresPage - 1) * SCORES_PER_PAGE + 1}–{Math.min(scoresPage * SCORES_PER_PAGE, filteredOrgScores.length)} de {filteredOrgScores.length} órgão{filteredOrgScores.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={scoresPage <= 1}
                      onClick={() => setScoresPage(p => p - 1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: Math.min(scoresTotalPages, 7) }, (_, i) => {
                      let p: number;
                      if (scoresTotalPages <= 7) { p = i + 1; }
                      else if (scoresPage <= 4) { p = i + 1; }
                      else if (scoresPage >= scoresTotalPages - 3) { p = scoresTotalPages - 6 + i; }
                      else { p = scoresPage - 3 + i; }
                      return (
                        <button
                          key={p}
                          onClick={() => setScoresPage(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === scoresPage ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground hover:bg-muted/50"}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      disabled={scoresPage >= scoresTotalPages}
                      onClick={() => setScoresPage(p => p + 1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Próximo
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {/* INSIGHTS TAB */}
      {activeTab === "insights" && (
        <div className="space-y-3">
          {insights.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum insight gerado. Execute o analytics na página de Logs de API.</p>
            </div>
          ) : (
            insights.map((ins, i) => (
              <motion.div
                key={ins.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card rounded-xl border border-border p-4 shadow-card flex items-start gap-4"
              >
                <span className="text-2xl">{insightIcons[ins.tipo_insight] || "📊"}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{ins.descricao}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {ins.orgao && <span>Órgão: {ins.orgao}</span>}
                    <span>{new Date(ins.data_referencia).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                  ins.relevancia_score >= 80 ? "bg-destructive/10 text-destructive" :
                  ins.relevancia_score >= 50 ? "bg-amber-500/10 text-amber-600" :
                  "bg-accent text-primary"
                }`}>
                  {ins.relevancia_score}/100
                </span>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* CONCENTRATION TAB */}
      {activeTab === "concentration" && (
        <div className="space-y-4">
          {concentration.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhuma análise de concentração. Execute o analytics na página de Logs de API.</p>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              {/* Header com busca */}
              <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                  <h2 className="font-display font-semibold text-foreground">Concentração por Órgão</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mostra se cada órgão compra de poucas ou muitas empresas
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar órgão..."
                    value={concSearch}
                    onChange={(e) => handleConcSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  />
                  {concSearch && (
                    <button
                      onClick={() => handleConcSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {concSearch && (
                <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs text-muted-foreground">
                  {filteredConc.length === 0
                    ? "Nenhum órgão encontrado."
                    : `${filteredConc.length} órgão${filteredConc.length !== 1 ? "s" : ""} encontrado${filteredConc.length !== 1 ? "s" : ""}`}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Órgão</th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium">
                        <span className="flex items-center justify-end gap-1">
                          3 maiores empresas
                          <InfoTooltip text="Percentual do total pago que foi para as 3 empresas que mais receberam deste órgão. Quanto maior, mais concentrado." />
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium">
                        <span className="flex items-center justify-end gap-1">
                          5 maiores empresas
                          <InfoTooltip text="Percentual do total pago que foi para as 5 empresas que mais receberam deste órgão." />
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium">
                        <span className="flex items-center justify-end gap-1">
                          Nº de empresas
                          <InfoTooltip text="Total de empresas distintas que receberam pagamento deste órgão. Quanto menos, mais concentrado." />
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium">Total Pago</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {concPaged.map((c) => {
                      const situacaoLabel: Record<string, string> = {
                        altamente_concentrado: "Alta concentração",
                        concentrado: "Concentrado",
                        moderado: "Moderado",
                        competitivo: "Competitivo",
                      };
                      return (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-foreground">{c.orgao}</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{c.top3_pct}%</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{c.top5_pct}%</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{c.total_fornecedores}</td>
                          <td className="py-3 px-4 text-right font-semibold text-foreground">{formatBRL(c.total_pago)}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                              c.classificacao === "altamente_concentrado" ? "bg-destructive/10 text-destructive" :
                              c.classificacao === "concentrado" ? "bg-amber-500/10 text-amber-600" :
                              c.classificacao === "moderado" ? "bg-blue-500/10 text-blue-600" :
                              "bg-accent text-primary"
                            }`}>
                              {situacaoLabel[c.classificacao] || c.classificacao?.replace(/_/g, " ") || "N/A"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredConc.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nenhum órgão encontrado para "{concSearch}".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {concTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {(concPage - 1) * CONC_PER_PAGE + 1}–{Math.min(concPage * CONC_PER_PAGE, filteredConc.length)} de {filteredConc.length} órgão{filteredConc.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={concPage <= 1}
                      onClick={() => setConcPage(p => p - 1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: Math.min(concTotalPages, 7) }, (_, idx) => {
                      let p: number;
                      if (concTotalPages <= 7) { p = idx + 1; }
                      else if (concPage <= 4) { p = idx + 1; }
                      else if (concPage >= concTotalPages - 3) { p = concTotalPages - 6 + idx; }
                      else { p = concPage - 3 + idx; }
                      return (
                        <button
                          key={p}
                          onClick={() => setConcPage(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === concPage ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground hover:bg-muted/50"}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      disabled={concPage >= concTotalPages}
                      onClick={() => setConcPage(p => p + 1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Próximo
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
};

export default IntelligencePage;


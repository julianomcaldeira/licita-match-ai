import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { formatBRL } from "@/hooks/iverbas/useBudgetData";
import { useEmendasData, type AutorRanking, type CoverageStatus, type EmendaDocumento } from "@/hooks/iverbas/useEmendasData";
import { supabase } from "@/integrations/supabase/client";
import { Search, RefreshCw, Vote, Users, Building2, PieChart as PieIcon, Activity, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import InfoTooltip from "@/components/iverbas/InfoTooltip";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const ROWS_PER_PAGE = 50;
const COLORS = ["#10b981", "#059669", "#34d399", "#6ee7b7", "#a7f3d0", "#047857"];

const EmendasPage: React.FC = () => {
  const { locale } = useLanguage();
  const isPT = locale === "pt";
  const [ano, setAno] = useState(2026);
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [ufFiltro, setUfFiltro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [pageAutor, setPageAutor] = useState(1);
  const [pageOrgao, setPageOrgao] = useState(1);
  const [tab, setTab] = useState<"autores" | "orgaos">("autores");
  const [selected, setSelected] = useState<AutorRanking | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  const { loading, data, refetch } = useEmendasData(ano);

  const autoresFiltrados = useMemo(() => {
    if (!data) return [];
    return data.porAutor.filter(a =>
      (!tipoFiltro || a.tipo === tipoFiltro) &&
      (!ufFiltro || a.uf === ufFiltro) &&
      (!busca || a.nome.toLowerCase().includes(busca.toLowerCase()))
    );
  }, [data, tipoFiltro, ufFiltro, busca]);

  const orgaosFiltrados = useMemo(() => {
    if (!data) return [];
    return data.porOrgao.filter(o => !busca || o.nome.toLowerCase().includes(busca.toLowerCase()));
  }, [data, busca]);

  const ufs = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.porAutor.map(a => a.uf).filter(Boolean))).sort() as string[];
  }, [data]);

  React.useEffect(() => { setPageAutor(1); setPageOrgao(1); }, [tipoFiltro, ufFiltro, busca, tab, ano]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("trigger-sync", { body: { target: "sync-emendas", payload: { ano, replace: true } } });
      if (error) console.error(error);
      await refetch();
    } finally {
      setSyncing(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const { data: raw, error } = await supabase.functions.invoke("trigger-sync", {
        body: { target: "enrich-emendas-orgaos", payload: { ano, limit: 80 } },
      });
      const res = raw?.data ?? raw;
      if (error) {
        setEnrichMsg(isPT ? `Erro: ${error.message}` : `Error: ${error.message}`);
      } else if (res) {
        setEnrichMsg(
          isPT
            ? `${res.processed} emendas processadas · ${res.docsTotal} documentos · ${res.pending} pendentes`
            : `${res.processed} amendments processed · ${res.docsTotal} documents · ${res.pending} pending`
        );
      }
      await refetch();
    } finally {
      setEnriching(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (selected) {
    const detalhes = data!.rows.filter(r => r.autor_nome === selected.nome);
    const codigosAutor = new Set(detalhes.map(d => d.codigo_emenda));
    const docsAutor = data!.docs.filter(d => codigosAutor.has(d.codigo_emenda));
    const porOrgaoAutor: Record<string, { nome: string; pago: number; empenhado: number }> = {};
    for (const d of docsAutor) {
      const k = d.orgao_superior_codigo || d.orgao_codigo || "??";
      const nome = d.orgao_superior_nome || d.orgao_nome || "Não identificado";
      if (!porOrgaoAutor[k]) porOrgaoAutor[k] = { nome, pago: 0, empenhado: 0 };
      porOrgaoAutor[k].pago += Number(d.valor_pago) || 0;
      porOrgaoAutor[k].empenhado += Number(d.valor_empenhado) || 0;
    }
    const ranking = Object.values(porOrgaoAutor).sort((a, b) => b.pago - a.pago);

    return (
      <div className="p-6 lg:p-8 space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-primary hover:underline">← {isPT ? "Voltar" : "Back"}</button>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Vote className="w-6 h-6 text-primary" />
            {selected.nome}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {selected.tipo} {selected.uf ? `· ${selected.uf}` : ""} {selected.partido ? `· ${selected.partido}` : ""} · {ano}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label={isPT ? "Empenhado" : "Committed"} value={formatBRL(selected.empenhado)} />
          <Card label={isPT ? "Pago" : "Paid"} value={formatBRL(selected.pago)} />
          <Card label={isPT ? "Emendas" : "Amendments"} value={String(selected.emendas)} />
          <Card label={isPT ? "Taxa de execução" : "Execution rate"} value={`${selected.taxaExecucao.toFixed(1)}%`} />
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold text-foreground">{isPT ? "Órgãos beneficiados" : "Beneficiary agencies"}</h2>
            {ranking.length === 0 && (
              <span className="text-xs text-muted-foreground">
                {isPT ? "Execute o enriquecimento para popular esta lista." : "Run enrichment to populate this list."}
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left">{isPT ? "Órgão" : "Agency"}</th>
                <th className="px-5 py-3 text-right">{isPT ? "Empenhado" : "Committed"}</th>
                <th className="px-5 py-3 text-right">{isPT ? "Pago" : "Paid"}</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(o => (
                <tr key={o.nome} className="border-t border-border hover:bg-muted/20">
                  <td className="px-5 py-3 text-foreground">{o.nome}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatBRL(o.empenhado)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-primary font-medium">{formatBRL(o.pago)}</td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr><td colSpan={3} className="px-5 py-10 text-center text-muted-foreground text-sm">
                  {isPT ? "Sem documentos enriquecidos para este autor." : "No enriched documents for this author."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const empty = !data || data.rows.length === 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Vote className="w-6 h-6 text-primary" />
          {isPT ? "Emendas Parlamentares" : "Parliamentary Amendments"} — {ano}
          <InfoTooltip text={isPT
            ? "Emendas individuais, de bancada, comissão e relator. Fonte: Portal da Transparência."
            : "Individual, bench, committee and rapporteur amendments. Source: Portal da Transparência."} />
        </h1>
        <div className="flex items-center gap-3">
          <select value={ano} onChange={e => setAno(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-input bg-background text-sm">
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>
          <button onClick={handleSync} disabled={syncing}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {syncing ? (isPT ? "Sincronizando..." : "Syncing...") : (isPT ? "Sincronizar agora" : "Sync now")}
          </button>
          <button onClick={handleEnrich} disabled={enriching}
            className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
            title={isPT ? "Busca o órgão beneficiado de cada emenda via /emendas/documentos" : "Fetch beneficiary agency per amendment via /emendas/documentos"}>
            <Building2 className="w-4 h-4 inline mr-1" />
            {enriching ? (isPT ? "Buscando órgãos..." : "Fetching agencies...") : (isPT ? "Buscar órgãos" : "Fetch agencies")}
          </button>
          <button onClick={() => refetch()} className="p-2 rounded-lg border border-border hover:bg-muted/50">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {data && data.enrichment.total > 0 && (
        <div className="flex items-center justify-between bg-muted/30 border border-border rounded-lg px-4 py-2.5 text-xs">
          <div className="text-muted-foreground">
            {isPT ? "Enriquecimento de órgãos: " : "Agency enrichment: "}
            <span className="text-foreground font-medium">{data.enrichment.enriched}/{data.enrichment.total}</span>
            {" · "}
            <span className="text-foreground">{data.enrichment.withDocs}</span> {isPT ? "com documentos" : "with documents"}
            {data.enrichment.pending > 0 && (
              <> {" · "} <span className="text-amber-600 dark:text-amber-500">{data.enrichment.pending} {isPT ? "pendentes" : "pending"}</span></>
            )}
          </div>
          {enrichMsg && <div className="text-primary">{enrichMsg}</div>}
        </div>
      )}

      {empty ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <Vote className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
          <h2 className="text-lg font-display font-semibold text-foreground mb-2">
            {isPT ? "Nenhum dado de emendas para " : "No amendment data for "}{ano}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {isPT
              ? "Clique em 'Sincronizar agora' para buscar dados do Portal da Transparência."
              : "Click 'Sync now' to fetch data from the Transparency Portal."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card label={isPT ? "Total empenhado" : "Total committed"} value={formatBRL(data!.totals.empenhado)} />
            <Card label={isPT ? "Total liquidado" : "Total settled"} value={formatBRL(data!.totals.liquidado)} />
            <Card label={isPT ? "Total pago" : "Total paid"} value={formatBRL(data!.totals.pago)} accent />
            <Card label={isPT ? "Emendas" : "Amendments"} value={data!.totals.emendas.toLocaleString("pt-BR")} icon={<Vote className="w-4 h-4" />} />
            <Card label={isPT ? "Autores" : "Authors"} value={data!.totals.autores.toLocaleString("pt-BR")} icon={<Users className="w-4 h-4" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title={isPT ? "Pago por tipo de emenda" : "Paid by amendment type"} icon={<PieIcon className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={data!.porTipo} dataKey="pago" nameKey="tipo" cx="50%" cy="50%" outerRadius={90} label={(e) => e.tipo}>
                    {data!.porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title={isPT ? "Top funções (pago)" : "Top functions (paid)"} icon={<Activity className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data!.porFuncao.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `R$${(v / 1e9).toFixed(1)}B`} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="funcao" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="pago" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setTab("autores")} className={`px-4 py-2 text-sm font-medium ${tab === "autores" ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted/50"}`}>
                <Users className="w-4 h-4 inline mr-1" /> {isPT ? "Por autor" : "By author"}
              </button>
              <button onClick={() => setTab("orgaos")} className={`px-4 py-2 text-sm font-medium ${tab === "orgaos" ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted/50"}`}>
                <Building2 className="w-4 h-4 inline mr-1" /> {isPT ? "Por órgão" : "By agency"}
              </button>
            </div>

            {tab === "autores" && (
              <>
                <select value={tipoFiltro || ""} onChange={e => setTipoFiltro(e.target.value || null)} className="px-3 py-2 rounded-lg border border-input bg-background text-sm">
                  <option value="">{isPT ? "Todos os tipos" : "All types"}</option>
                  <option value="individual">{isPT ? "Individual" : "Individual"}</option>
                  <option value="bancada">{isPT ? "Bancada" : "Bench"}</option>
                  <option value="comissao">{isPT ? "Comissão" : "Committee"}</option>
                  <option value="relator">{isPT ? "Relator" : "Rapporteur"}</option>
                </select>
                <select value={ufFiltro || ""} onChange={e => setUfFiltro(e.target.value || null)} className="px-3 py-2 rounded-lg border border-input bg-background text-sm">
                  <option value="">{isPT ? "Todas UFs" : "All states"}</option>
                  {ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </>
            )}

            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder={isPT ? "Buscar..." : "Search..."}
                className="pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-sm w-64" />
            </div>
          </div>

          {tab === "autores" ? (
            <RankingTable
              rows={autoresFiltrados.slice((pageAutor - 1) * ROWS_PER_PAGE, pageAutor * ROWS_PER_PAGE)}
              total={autoresFiltrados.length}
              page={pageAutor}
              setPage={setPageAutor}
              isPT={isPT}
              kind="autor"
              onRowClick={(r) => setSelected(r as AutorRanking)}
            />
          ) : (
            <>
              <CoveragePanel coverage={data!.coverage} docs={data!.docs} isPT={isPT} />
              <RankingTable
                rows={orgaosFiltrados.slice((pageOrgao - 1) * ROWS_PER_PAGE, pageOrgao * ROWS_PER_PAGE)}
                total={orgaosFiltrados.length}
                page={pageOrgao}
                setPage={setPageOrgao}
                isPT={isPT}
                kind="orgao"
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

const Card: React.FC<{ label: string; value: string; accent?: boolean; icon?: React.ReactNode }> = ({ label, value, accent, icon }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    className={`rounded-xl border p-4 ${accent ? "bg-primary/5 border-primary/30" : "bg-card border-border"}`}>
    <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">{icon}{label}</div>
    <div className={`text-xl font-display font-bold mt-1 tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
  </motion.div>
);

const ChartCard: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-card border border-border rounded-xl p-5">
    <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2 mb-3">{icon}{title}</h3>
    {children}
  </div>
);

interface RankingTableProps {
  rows: any[];
  total: number;
  page: number;
  setPage: (p: number) => void;
  isPT: boolean;
  kind: "autor" | "orgao";
  onRowClick?: (r: any) => void;
}

const RankingTable: React.FC<RankingTableProps> = ({ rows, total, page, setPage, isPT, kind, onRowClick }) => {
  const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left w-12">#</th>
              <th className="px-5 py-3 text-left">{kind === "autor" ? (isPT ? "Autor" : "Author") : (isPT ? "Órgão" : "Agency")}</th>
              {kind === "autor" && <th className="px-5 py-3 text-left">{isPT ? "Tipo" : "Type"}</th>}
              <th className="px-5 py-3 text-right">{isPT ? "Emendas" : "Amendments"}</th>
              <th className="px-5 py-3 text-right">{isPT ? "Empenhado" : "Committed"}</th>
              <th className="px-5 py-3 text-right">{isPT ? "Pago" : "Paid"}</th>
              <th className="px-5 py-3 text-right">{isPT ? "Execução" : "Execution"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={(r.nome || r.codigo) + i}
                onClick={() => onRowClick?.(r)}
                className={`border-t border-border ${onRowClick ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/20"}`}>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{(page - 1) * ROWS_PER_PAGE + i + 1}</td>
                <td className="px-5 py-3 font-medium text-foreground">
                  {kind === "autor" ? r.nome : r.nome}
                  {kind === "autor" && r.uf && <span className="ml-2 text-xs text-muted-foreground">{r.uf}{r.partido ? ` · ${r.partido}` : ""}</span>}
                </td>
                {kind === "autor" && <td className="px-5 py-3 text-xs capitalize text-muted-foreground">{r.tipo}</td>}
                <td className="px-5 py-3 text-right tabular-nums">{r.emendas}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatBRL(r.empenhado)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-primary font-medium">{formatBRL(r.pago)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{r.taxaExecucao.toFixed(1)}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={kind === "autor" ? 7 : 6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                {isPT ? "Nenhum resultado." : "No results."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-border flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {isPT ? "Página" : "Page"} {page} {isPT ? "de" : "of"} {totalPages} · {total.toLocaleString("pt-BR")} {isPT ? "registros" : "records"}
          </span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}
              className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted/50">←</button>
            <button disabled={page === totalPages} onClick={() => setPage(page + 1)}
              className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted/50">→</button>
          </div>
        </div>
      )}
    </div>
  );
};

const FASES = ["empenho", "liquidacao", "pagamento"] as const;
type FaseFilter = "todas" | typeof FASES[number];
type StatusFilter = "todos" | "com_orgao" | "pendentes" | "indisponiveis";

const CoveragePanel: React.FC<{ coverage: CoverageStatus; docs: EmendaDocumento[]; isPT: boolean }> = ({ coverage, docs, isPT }) => {
  const pctOrgao = coverage.docsTotal > 0 ? (coverage.docsComOrgao / coverage.docsTotal) * 100 : 0;
  const pctUG = coverage.docsTotal > 0 ? (coverage.docsComUG / coverage.docsTotal) * 100 : 0;
  const pctEmendas = coverage.emendasTotal > 0 ? (coverage.emendasEnriquecidas / coverage.emendasTotal) * 100 : 0;
  const fmtNum = (n: number) => n.toLocaleString("pt-BR");
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtHora = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendentes");
  const [faseFilter, setFaseFilter] = useState<FaseFilter>("todas");
  const [cicloFilter, setCicloFilter] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [limit, setLimit] = useState(50);

  const fases = useMemo(() => {
    const set = new Set<string>();
    for (const d of docs) if (d.fase) set.add(d.fase.toLowerCase());
    return Array.from(set).sort();
  }, [docs]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return docs.filter(d => {
      const enriquecido = !!d.orgao_codigo && d.orgao_codigo !== "NAO_DISPONIVEL";
      const indisponivel = d.orgao_codigo === "NAO_DISPONIVEL";
      if (statusFilter === "com_orgao" && !enriquecido) return false;
      if (statusFilter === "pendentes" && (enriquecido || indisponivel)) return false;
      if (statusFilter === "indisponiveis" && !indisponivel) return false;
      if (faseFilter !== "todas" && (d.fase || "").toLowerCase() !== faseFilter) return false;
      if (cicloFilter !== "todos") {
        const hora = d.updated_at ? d.updated_at.slice(0, 13) + ":00:00Z" : null;
        if (hora !== cicloFilter) return false;
      }
      if (q) {
        const hay = `${d.documento_id || ""} ${d.orgao_codigo || ""} ${d.orgao_nome || ""} ${d.codigo_emenda}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [docs, statusFilter, faseFilter, cicloFilter, busca]);

  React.useEffect(() => { setLimit(50); }, [statusFilter, faseFilter, cicloFilter, busca]);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          {isPT ? "Cobertura de enriquecimento por órgão" : "Agency enrichment coverage"}
          <InfoTooltip text={isPT
            ? "Mostra quantos documentos já tiveram órgão e unidade gestora preenchidos pelo cron de enriquecimento e quantos ainda estão pendentes."
            : "Shows how many documents already have agency and management unit filled by the enrichment cron and how many are still pending."} />
        </h3>
        {coverage.ultimoCiclo && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {isPT ? "Último ciclo: " : "Last cycle: "} {fmtHora(coverage.ultimoCiclo)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CoverageMetric label={isPT ? "Documentos com órgão" : "Documents with agency"}
          value={`${fmtNum(coverage.docsComOrgao)}/${fmtNum(coverage.docsTotal)}`} pct={pctOrgao} tone="success" />
        <CoverageMetric label={isPT ? "Com unidade gestora" : "With management unit"}
          value={`${fmtNum(coverage.docsComUG)}/${fmtNum(coverage.docsTotal)}`} pct={pctUG} tone="success" />
        <CoverageMetric label={isPT ? "Pendentes" : "Pending"}
          value={fmtNum(coverage.docsPendentes)}
          pct={coverage.docsTotal > 0 ? (coverage.docsPendentes / coverage.docsTotal) * 100 : 0} tone="warn" />
        <CoverageMetric label={isPT ? "Indisponíveis na API" : "Unavailable in API"}
          value={fmtNum(coverage.docsIndisponiveis)}
          pct={coverage.docsTotal > 0 ? (coverage.docsIndisponiveis / coverage.docsTotal) * 100 : 0} tone="muted" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProgressRow label={isPT ? "Emendas com documentos enriquecidos" : "Amendments with enriched documents"}
          current={coverage.emendasEnriquecidas} total={coverage.emendasTotal} pct={pctEmendas} isPT={isPT} />
        <ProgressRow label={isPT ? "Documentos com órgão identificado" : "Documents with identified agency"}
          current={coverage.docsComOrgao} total={coverage.docsTotal} pct={pctOrgao} isPT={isPT} />
      </div>

      <div>
        <h4 className="text-xs uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" />
          {isPT ? "Últimos ciclos do cron (por hora)" : "Recent cron cycles (per hour)"}
        </h4>
        {coverage.ciclos.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            {isPT ? "Nenhuma execução registrada ainda." : "No executions recorded yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground uppercase">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left">{isPT ? "Ciclo" : "Cycle"}</th>
                  <th className="px-3 py-2 text-right">{isPT ? "Documentos" : "Documents"}</th>
                  <th className="px-3 py-2 text-right">{isPT ? "Enriquecidos" : "Enriched"}</th>
                  <th className="px-3 py-2 text-right">{isPT ? "Sem órgão" : "Without agency"}</th>
                  <th className="px-3 py-2 text-right">{isPT ? "Cobertura" : "Coverage"}</th>
                  <th className="px-3 py-2 text-right w-20">{isPT ? "Filtrar" : "Filter"}</th>
                </tr>
              </thead>
              <tbody>
                {coverage.ciclos.map(c => {
                  const cov = c.docs > 0 ? (c.comOrgao / c.docs) * 100 : 0;
                  const active = cicloFilter === c.hora;
                  return (
                    <tr key={c.hora} className="border-b border-border/60 hover:bg-muted/20">
                      <td className="px-3 py-2 text-foreground tabular-nums">{fmtHora(c.hora)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.docs)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary font-medium">{fmtNum(c.comOrgao)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-600 dark:text-amber-500">{fmtNum(c.semOrgao)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(cov)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setCicloFilter(active ? "todos" : c.hora)}
                          className={`text-[10px] px-2 py-0.5 rounded border ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
                          {active ? (isPT ? "Ativo" : "Active") : (isPT ? "Aplicar" : "Apply")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-xs uppercase text-muted-foreground flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" />
            {isPT ? "Inspecionar documentos" : "Inspect documents"}
          </h4>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmtNum(filtered.length)} {isPT ? "resultados" : "results"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs">
            <option value="todos">{isPT ? "Todos status" : "All statuses"}</option>
            <option value="pendentes">{isPT ? "Pendentes (sem órgão)" : "Pending (no agency)"}</option>
            <option value="com_orgao">{isPT ? "Com órgão" : "With agency"}</option>
            <option value="indisponiveis">{isPT ? "Indisponíveis na API" : "Unavailable in API"}</option>
          </select>
          <select value={faseFilter} onChange={e => setFaseFilter(e.target.value as FaseFilter)}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs">
            <option value="todas">{isPT ? "Todas APIs/fases" : "All APIs/phases"}</option>
            {fases.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={cicloFilter} onChange={e => setCicloFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs">
            <option value="todos">{isPT ? "Qualquer ciclo" : "Any cycle"}</option>
            {coverage.ciclos.map(c => <option key={c.hora} value={c.hora}>{fmtHora(c.hora)}</option>)}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder={isPT ? "Código documento, código órgão ou nome..." : "Document code, agency code or name..."}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-input bg-background text-xs" />
          </div>
          {(statusFilter !== "todos" || faseFilter !== "todas" || cicloFilter !== "todos" || busca) && (
            <button onClick={() => { setStatusFilter("todos"); setFaseFilter("todas"); setCicloFilter("todos"); setBusca(""); }}
              className="px-2.5 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/50">
              {isPT ? "Limpar" : "Clear"}
            </button>
          )}
        </div>

        {(() => {
          const sel = { total: filtered.length, comOrgao: 0, pendentes: 0, indisponiveis: 0, comUG: 0 };
          for (const d of filtered) {
            const enr = !!d.orgao_codigo && d.orgao_codigo !== "NAO_DISPONIVEL";
            const ind = d.orgao_codigo === "NAO_DISPONIVEL";
            if (enr) sel.comOrgao += 1;
            else if (ind) sel.indisponiveis += 1;
            else sel.pendentes += 1;
            if (d.unidade_gestora_codigo) sel.comUG += 1;
          }
          const pct = (n: number) => sel.total > 0 ? ((n / sel.total) * 100).toFixed(1) + "%" : "0%";
          const Badge = ({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: string }) => (
            <div className={`flex-1 min-w-[140px] rounded-lg border px-3 py-2 ${tone}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
              <div className="text-base font-display font-bold tabular-nums mt-0.5">{fmtNum(value)}</div>
              <div className="text-[10px] tabular-nums opacity-70">{sub}</div>
            </div>
          );
          return (
            <div className="flex flex-wrap gap-2 bg-muted/20 border border-border rounded-lg p-2">
              <Badge label={isPT ? "Seleção" : "Selection"} value={sel.total}
                sub={`${fmtNum(coverage.docsTotal)} ${isPT ? "no total" : "total"}`}
                tone="border-border bg-card text-foreground" />
              <Badge label={isPT ? "Com órgão" : "With agency"} value={sel.comOrgao} sub={pct(sel.comOrgao)}
                tone="border-primary/30 bg-primary/5 text-primary" />
              <Badge label={isPT ? "Pendentes" : "Pending"} value={sel.pendentes} sub={pct(sel.pendentes)}
                tone="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" />
              <Badge label={isPT ? "Indisponíveis" : "Unavailable"} value={sel.indisponiveis} sub={pct(sel.indisponiveis)}
                tone="border-border bg-muted/40 text-muted-foreground" />
              <Badge label={isPT ? "Com UG" : "With mgmt unit"} value={sel.comUG} sub={pct(sel.comUG)}
                tone="border-primary/30 bg-primary/5 text-primary" />
            </div>
          );
        })()}


        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 text-left">{isPT ? "Documento" : "Document"}</th>
                <th className="px-3 py-2 text-left">{isPT ? "Emenda" : "Amendment"}</th>
                <th className="px-3 py-2 text-left">{isPT ? "Fase" : "Phase"}</th>
                <th className="px-3 py-2 text-left">{isPT ? "Órgão" : "Agency"}</th>
                <th className="px-3 py-2 text-left">UG</th>
                <th className="px-3 py-2 text-right">{isPT ? "Atualizado" : "Updated"}</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((d, i) => {
                const enriquecido = !!d.orgao_codigo && d.orgao_codigo !== "NAO_DISPONIVEL";
                const indisponivel = d.orgao_codigo === "NAO_DISPONIVEL";
                return (
                  <tr key={(d.documento_id || "") + i} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-foreground">{d.documento_id || "—"}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{d.codigo_emenda}</td>
                    <td className="px-3 py-2 capitalize">{d.fase || "—"}</td>
                    <td className="px-3 py-2 text-foreground">
                      {enriquecido ? `${d.orgao_codigo} · ${d.orgao_nome || ""}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono">{d.unidade_gestora_codigo || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {d.updated_at ? fmtHora(d.updated_at) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {enriquecido ? (
                        <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="w-3 h-3" />{isPT ? "Enriquecido" : "Enriched"}</span>
                      ) : indisponivel ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><AlertCircle className="w-3 h-3" />{isPT ? "Indisponível" : "Unavailable"}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500"><Clock className="w-3 h-3" />{isPT ? "Pendente" : "Pending"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  {isPT ? "Nenhum documento corresponde aos filtros." : "No documents match the filters."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="flex justify-center">
            <button onClick={() => setLimit(l => l + 100)}
              className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted/50">
              {isPT ? `Carregar mais (${fmtNum(filtered.length - limit)} restantes)` : `Load more (${fmtNum(filtered.length - limit)} remaining)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const CoverageMetric: React.FC<{ label: string; value: string; pct: number; tone: "success" | "warn" | "muted" }> = ({ label, value, pct, tone }) => {
  const toneClasses = {
    success: { bar: "bg-primary", text: "text-primary", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    warn: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-500", icon: <AlertCircle className="w-3.5 h-3.5" /> },
    muted: { bar: "bg-muted-foreground/50", text: "text-muted-foreground", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${toneClasses.text}`}>
        {toneClasses.icon}{label}
      </div>
      <div className="text-lg font-display font-bold mt-1 tabular-nums text-foreground">{value}</div>
      <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${toneClasses.bar} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">{pct.toFixed(1)}%</div>
    </div>
  );
};

const ProgressRow: React.FC<{ label: string; current: number; total: number; pct: number; isPT: boolean }> = ({ label, current, total, pct, isPT }) => (
  <div className="rounded-lg border border-border bg-background/40 p-3">
    <div className="flex items-center justify-between text-xs mb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">
        {current.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")} · {pct.toFixed(1)}%
      </span>
    </div>
    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
      <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  </div>
);

export default EmendasPage;

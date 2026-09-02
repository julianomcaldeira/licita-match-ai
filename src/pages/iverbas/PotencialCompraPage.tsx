import React, { useState } from "react";
import { motion } from "framer-motion";
import { formatBRL } from "@/hooks/iverbas/useBudgetData";
import { usePotencialCompra } from "@/hooks/iverbas/usePotencialCompra";
import { Search, Target, AlertTriangle, TrendingUp } from "lucide-react";
import InfoTooltip from "@/components/iverbas/InfoTooltip";

const CATEGORIAS = [
  "Saúde", "TI", "Infraestrutura", "Educação", "Alimentação",
  "Defesa e Segurança", "Transportes", "Meio Ambiente", "Energia",
  "Consultoria", "Serviços Gerais", "Outros"
];

const ROWS_PER_PAGE = 50;

const PotencialCompraPage: React.FC = () => {
  const [filtroTipo, setFiltroTipo] = useState<"categoria" | "palavra-chave">("categoria");
  const [categoriaSelected, setCategoriaSelected] = useState("");
  const [keyword, setKeyword] = useState("");
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [ano, setAno] = useState(2026);
  const [page, setPage] = useState(1);

  const filtroValor = filtroTipo === "categoria" ? categoriaSelected : keyword;
  const { loading, data } = usePotencialCompra(
    filtroTipo,
    searchTriggered ? filtroValor : "",
    ano
  );

  const orgaos = data?.orgaos || [];
  const [filterText, setFilterText] = useState("");
  const filtered = orgaos.filter(o => o.orgao.toLowerCase().includes(filterText.toLowerCase()));
  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  React.useEffect(() => { setPage(1); }, [filterText, data]);

  const handleSearch = () => {
    if (filtroValor.trim()) {
      setSearchTriggered(false);
      // Force re-trigger
      setTimeout(() => setSearchTriggered(true), 0);
    }
  };

  const handleCategoriaClick = (cat: string) => {
    setCategoriaSelected(cat);
    setFiltroTipo("categoria");
    setSearchTriggered(false);
    setTimeout(() => setSearchTriggered(true), 0);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-foreground bg-primary/20";
    if (score >= 40) return "text-foreground bg-accent/50";
    return "text-muted-foreground bg-muted";
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" />
          Potencial de Compra — {ano}
          <InfoTooltip text="Identifica quais órgãos têm maior potencial de compra para determinado segmento, com base em execução orçamentária, saldo disponível e histórico de contratações." />
        </h1>
        <div className="flex items-center gap-3">
          <select value={ano} onChange={e => { setAno(Number(e.target.value)); setSearchTriggered(false); }} className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Selecione o segmento de interesse</h2>

        {/* Tipo de filtro */}
        <div className="flex gap-3">
          <button
            onClick={() => setFiltroTipo("categoria")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filtroTipo === "categoria" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            Por Categoria
          </button>
          <button
            onClick={() => setFiltroTipo("palavra-chave")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filtroTipo === "palavra-chave" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            Por Palavra-chave
          </button>
        </div>

        {filtroTipo === "categoria" ? (
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoriaClick(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoriaSelected === cat && searchTriggered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="Ex: material hospitalar, combustível, computadores..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!keyword.trim()}
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Analisar
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          <span className="ml-3 text-muted-foreground">Calculando potencial de compra...</span>
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-5 shadow-card">
              <p className="text-sm text-muted-foreground mb-1">Órgãos Encontrados</p>
              <p className="text-2xl font-display font-bold text-foreground">{orgaos.length}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5 shadow-card">
              <p className="text-sm text-muted-foreground mb-1">Gasto no Segmento</p>
              <p className="text-2xl font-display font-bold text-foreground">{formatBRL(data.totalGeral)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5 shadow-card">
              <p className="text-sm text-muted-foreground mb-1">Saldo Disponível Total</p>
              <p className="text-2xl font-display font-bold text-muted-foreground">Indisponível</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5 shadow-card">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-muted-foreground">Validação</p>
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-lg font-display font-bold text-muted-foreground">
                Dado indisponível
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.validacao.motivo}
              </p>
            </div>
          </div>

          {/* Filter bar for results */}
          <div className="flex items-center justify-between">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                placeholder="Filtrar órgão..."
                className="pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-64"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Score = Histórico de gasto no segmento (100%) — saldo e crescimento indisponíveis
            </p>
          </div>

          {/* Results Table */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">#</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Órgão</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">UF</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Empenhado no Segmento</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Contratos</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Orçamento Total</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">
                    <span className="inline-flex items-center gap-1">
                      Saldo Disponível
                      <InfoTooltip text="Indisponível: PNCP/comprasgov não expõe dotação orçamentária." />
                    </span>
                  </th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">% Executado</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">
                    <span className="flex items-center justify-end gap-1">
                      Score
                      <TrendingUp className="w-3.5 h-3.5" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((o, i) => (
                  <tr key={o.orgao} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-muted-foreground">{(page - 1) * ROWS_PER_PAGE + i + 1}</td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-foreground">{o.orgao}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">{o.uf || "—"}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">{formatBRL(o.historicoCompraSegmento)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{o.contratosSegmento}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {o.orcamentoAutorizado === null ? "—" : formatBRL(o.orcamentoAutorizado)}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {o.saldoDisponivel === null ? "—" : formatBRL(o.saldoDisponivel)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {o.pctExecutado === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(o.pctExecutado, 100)}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">{o.pctExecutado}%</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getScoreColor(o.scorePotencial)}`}>
                        {o.scorePotencial}
                      </span>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum órgão encontrado para este filtro</td></tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  Mostrando {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)} de {filtered.length} órgãos
                </p>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Anterior</button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, idx) => {
                    let p: number;
                    if (totalPages <= 7) { p = idx + 1; }
                    else if (page <= 4) { p = idx + 1; }
                    else if (page >= totalPages - 3) { p = totalPages - 6 + idx; }
                    else { p = page - 3 + idx; }
                    return (
                      <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground hover:bg-muted/50"}`}>{p}</button>
                    );
                  })}
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Próximo</button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}

      {/* Empty state before search */}
      {!loading && !data && !searchTriggered && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-12 text-center">
          <Target className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Selecione um segmento para análise</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Escolha uma categoria ou digite uma palavra-chave para identificar os órgãos com maior potencial de compra no segmento desejado.
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default PotencialCompraPage;

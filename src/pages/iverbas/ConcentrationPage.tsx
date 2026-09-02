import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { formatBRL } from "@/hooks/iverbas/useBudgetData";
import { useCompaniesData } from "@/hooks/iverbas/useCompaniesData";
import InfoTooltip from "@/components/iverbas/InfoTooltip";
import DataQualityBadge from "@/components/iverbas/DataQualityBadge";
import { Search, X } from "lucide-react";


const ROWS_PER_PAGE = 50;

const ConcentrationPage: React.FC = () => {
  const { t } = useLanguage();
  const { loading, data } = useCompaniesData();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const allCompanies = data?.companies || [];
  const concentration = data?.concentration || { top3: 0, top5: 0, top10: 0 };
  const total = data?.total || 0;

  const companies = useMemo(() => {
    if (!search.trim()) return allCompanies;
    const q = search.toLowerCase();
    return allCompanies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.cnpj.includes(q)
    );
  }, [allCompanies, search]);

  const totalPages = Math.ceil(companies.length / ROWS_PER_PAGE);
  const paged = companies.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2 flex-wrap">
        {t("concentration")}
        <InfoTooltip text="Mostra se o dinheiro dos contratos públicos está sendo dividido entre muitas empresas ou concentrado em poucas. Dados reais do PNCP." />
        <DataQualityBadge variant="contracts" />
      </h1>


      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "As 3 maiores empresas concentram",
            tooltip: "Soma da fatia de mercado das 3 empresas que mais receberam contratos públicos. Quanto maior esse número, mais o dinheiro está concentrado em poucas mãos.",
            value: `${concentration.top3.toFixed(1)}%`,
          },
          {
            label: "As 5 maiores empresas concentram",
            tooltip: "Soma da fatia de mercado das 5 empresas com mais contratos. Permite ver se há um grupo pequeno dominando o mercado público.",
            value: `${concentration.top5.toFixed(1)}%`,
          },
          {
            label: "As 10 maiores empresas concentram",
            tooltip: "Soma da fatia de mercado das 10 empresas com mais contratos. Indica o grau geral de concentração no mercado público.",
            value: `${concentration.top10.toFixed(1)}%`,
          },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="bg-card rounded-xl border border-border p-5 shadow-card">
            <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              {s.label}
              <InfoTooltip text={s.tooltip} />
            </p>
            <p className="text-3xl font-display font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">do total em contratos ({formatBRL(total)})</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <h2 className="font-display font-semibold text-foreground shrink-0">{t("topCompanies")} — {t("marketShare")}</h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nome ou CNPJ..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
            {search && (
              <button
                onClick={() => handleSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {search && (
          <div className="px-5 py-2 bg-muted/30 border-b border-border text-xs text-muted-foreground">
            {companies.length === 0
              ? "Nenhuma empresa encontrada para esta busca."
              : `${companies.length} empresa${companies.length !== 1 ? "s" : ""} encontrada${companies.length !== 1 ? "s" : ""}`}
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">#</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("company")}</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">CNPJ</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">Valor Total</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("marketShare")}</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c, i) => (
              <tr key={c.cnpj || i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-bold text-muted-foreground">{(page - 1) * ROWS_PER_PAGE + i + 1}</td>
                <td className="py-3 px-4 font-medium text-foreground">{c.name}</td>
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{c.cnpj}</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatBRL(c.totalValue)}</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full gradient-brand" style={{ width: `${Math.min(c.marketShare * 2, 100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-primary">{c.marketShare}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {companies.length === 0 && !search && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhum dado coletado ainda. Acesse a página de Empresas para iniciar a coleta.
                </td>
              </tr>
            )}
            {companies.length === 0 && search && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhuma empresa encontrada para "<span className="font-medium">{search}</span>".
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Mostrando {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, companies.length)} de {companies.length} empresa{companies.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, idx) => {
                let p: number;
                if (totalPages <= 7) { p = idx + 1; }
                else if (page <= 4) { p = idx + 1; }
                else if (page >= totalPages - 3) { p = totalPages - 6 + idx; }
                else { p = page - 3 + idx; }
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground hover:bg-muted/50"}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ConcentrationPage;

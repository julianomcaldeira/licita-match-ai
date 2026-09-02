import React, { useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { formatBRL } from "@/hooks/iverbas/useBudgetData";
import { useSuppliersData } from "@/hooks/iverbas/useSuppliersData";
import { supabase } from "@/integrations/supabase/client";
import { Search, RefreshCw, Briefcase, Calendar } from "lucide-react";
import InfoTooltip from "@/components/iverbas/InfoTooltip";
import DataQualityBadge from "@/components/iverbas/DataQualityBadge";


interface SuppliersPageProps {
  onSelectSupplier?: (cnpj: string) => void;
}

const ROWS_PER_PAGE = 50;

const SuppliersPage: React.FC<SuppliersPageProps> = ({ onSelectSupplier }) => {
  const { t } = useLanguage();
  const [filter, setFilter] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [ano, setAno] = useState(2026);
  const { loading, data, refetch } = useSuppliersData(categoria, ano);

  const suppliers = data?.suppliers || [];
  const filtered = suppliers.filter(
    (c) => c.cnpj.includes(filter) || c.name.toLowerCase().includes(filter.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  // Reset page when filter changes
  React.useEffect(() => { setPage(1); }, [filter, categoria, ano]);

  const categorias = [
    "Saúde", "TI", "Infraestrutura", "Educação", "Alimentação",
    "Defesa e Segurança", "Transportes", "Meio Ambiente", "Energia",
    "Consultoria", "Serviços Gerais", "Outros"
  ];

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2 flex-wrap">
          <Briefcase className="w-6 h-6 text-primary" />
          Ranking de Fornecedores — {ano}
          <InfoTooltip text="Fornecedores que venceram licitações e receberam contratos do governo. Dados do endpoint /v1/contratos do PNCP. Clique em uma empresa para ver detalhes." />
          <DataQualityBadge variant="contracts" />
        </h1>

        <div className="flex items-center gap-3">
          <select value={ano} onChange={e => setAno(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
          <button onClick={() => refetch()} className="p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors" title="Atualizar dados">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`${t("filter")}...`}
              className="pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-64"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCategoria(null)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!categoria ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>Todos</button>
        {categorias.map(cat => (
          <button key={cat} onClick={() => setCategoria(cat)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoria === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>{cat}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <p className="text-sm text-muted-foreground mb-1">Total em Contratos</p>
          <p className="text-2xl font-display font-bold text-foreground">{formatBRL(data?.total || 0)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <p className="text-sm text-muted-foreground mb-1">Fornecedores</p>
          <p className="text-2xl font-display font-bold text-foreground">{data?.totalSuppliers || 0}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <p className="text-sm text-muted-foreground mb-1">Fonte</p>
          <p className="text-lg font-display font-bold text-foreground">
            {data?.source === "db" ? "PNCP (dados reais)" : "Sem dados ainda"}
          </p>
          <p className="text-xs text-muted-foreground">Endpoint /v1/contratos — fornecedores vencedores</p>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-8 text-center">
          <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum fornecedor encontrado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Os dados de fornecedores são coletados do endpoint /v1/contratos do PNCP. Inicie a coleta para popular.
          </p>
          <button
            onClick={async () => {
              try {
                await supabase.functions.invoke("trigger-sync", { body: { target: "comprasgov-collector", payload: {} } });
                setTimeout(() => refetch(), 5000);
              } catch {}
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Iniciar Coleta do PNCP
          </button>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">#</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">CNPJ</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Fornecedor</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Valor Total</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Contratos</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Market Share</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c, i) => (
                <tr key={c.cnpj || i} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onSelectSupplier?.(c.cnpj)}>
                  <td className="py-3 px-4 font-bold text-muted-foreground">{(page - 1) * ROWS_PER_PAGE + i + 1}</td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{c.cnpj}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-foreground">{c.name}</p>
                    {c.categorias.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.categorias.slice(0, 3).map(cat => (
                          <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{cat}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-foreground">{formatBRL(c.totalValue)}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{c.contractCount}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent text-primary">{c.marketShare}%</span>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{t("noData")}</td></tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Mostrando {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)} de {filtered.length} fornecedores
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
      )}
    </div>
  );
};

export default SuppliersPage;

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/hooks/iverbas/useBudgetData";
import { ArrowLeft, Building2, MapPin, FileText, TrendingUp } from "lucide-react";

interface Contract {
  id: string;
  objeto: string | null;
  valor: number;
  orgao: string | null;
  uf: string | null;
  categoria: string | null;
  data_assinatura: string | null;
  numero_controle_pncp: string | null;
}

interface SupplierDetailPageProps {
  cnpj: string;
  onBack: () => void;
}

const SupplierDetailPage: React.FC<SupplierDetailPageProps> = ({ cnpj, onBack }) => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierName, setSupplierName] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("contratos_comprasgov")
        .select("id, objeto, valor, orgao, uf, categoria, data_assinatura, numero_controle_pncp, nome_fornecedor")
        .eq("cnpj_fornecedor", cnpj)
        .order("valor", { ascending: false });

      if (!error && data && data.length > 0) {
        setSupplierName(data[0].nome_fornecedor);
        setContracts(data);
      }
      setLoading(false);
    }
    load();
  }, [cnpj]);

  const totalValue = contracts.reduce((s, c) => s + (c.valor || 0), 0);
  const uniqueOrgaos = [...new Set(contracts.map(c => c.orgao).filter(Boolean))] as string[];
  const uniqueUFs = [...new Set(contracts.map(c => c.uf).filter(Boolean))] as string[];
  const uniqueCategorias = [...new Set(contracts.map(c => c.categoria).filter(Boolean))] as string[];

  // Aggregate by orgao
  const orgaoMap: Record<string, { total: number; count: number }> = {};
  contracts.forEach(c => {
    const key = c.orgao || "Não informado";
    if (!orgaoMap[key]) orgaoMap[key] = { total: 0, count: 0 };
    orgaoMap[key].total += c.valor || 0;
    orgaoMap[key].count++;
  });
  const orgaoRanking = Object.entries(orgaoMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);

  // Aggregate by UF
  const ufMap: Record<string, { total: number; count: number }> = {};
  contracts.forEach(c => {
    const key = c.uf || "N/A";
    if (!ufMap[key]) ufMap[key] = { total: 0, count: 0 };
    ufMap[key].total += c.valor || 0;
    ufMap[key].count++;
  });
  const ufRanking = Object.entries(ufMap)
    .map(([uf, v]) => ({ uf, ...v }))
    .sort((a, b) => b.total - a.total);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{supplierName}</h1>
          <p className="text-sm text-muted-foreground font-mono">{cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Valor Total</p>
          </div>
          <p className="text-xl font-display font-bold text-foreground">{formatBRL(totalValue)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Contratos</p>
          </div>
          <p className="text-xl font-display font-bold text-foreground">{contracts.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Órgãos</p>
          </div>
          <p className="text-xl font-display font-bold text-foreground">{uniqueOrgaos.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">UFs</p>
          </div>
          <p className="text-xl font-display font-bold text-foreground">{uniqueUFs.join(", ") || "N/A"}</p>
        </motion.div>
      </div>

      {/* Categories */}
      {uniqueCategorias.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {uniqueCategorias.map(cat => (
            <span key={cat} className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">{cat}</span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Órgãos Contratantes */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" /> Órgãos Contratantes
            </h2>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-4 text-muted-foreground font-medium text-xs">Órgão</th>
                  <th className="text-right py-2 px-4 text-muted-foreground font-medium text-xs">Valor</th>
                  <th className="text-right py-2 px-4 text-muted-foreground font-medium text-xs">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {orgaoRanking.map((o, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-2 px-4 text-foreground text-xs">{o.name}</td>
                    <td className="py-2 px-4 text-right font-semibold text-foreground text-xs">{formatBRL(o.total)}</td>
                    <td className="py-2 px-4 text-right text-muted-foreground text-xs">{o.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* UFs de Atuação */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> UFs de Atuação
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {ufRanking.map((u, i) => {
              const pct = totalValue > 0 ? (u.total / totalValue) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold text-foreground">{u.uf}</span>
                    <span className="text-muted-foreground">{formatBRL(u.total)} ({u.count} contratos)</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Contracts table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Contratos Individuais
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20">
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Data</th>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Objeto</th>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Órgão</th>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">UF</th>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Categoria</th>
                <th className="text-right py-2.5 px-4 text-muted-foreground font-medium text-xs">Valor</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => (
                <tr key={c.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-4 text-muted-foreground text-xs whitespace-nowrap">
                    {c.data_assinatura ? new Date(c.data_assinatura).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-foreground text-xs max-w-xs truncate" title={c.objeto || ""}>
                    {c.objeto || "—"}
                  </td>
                  <td className="py-2.5 px-4 text-foreground text-xs max-w-[200px] truncate" title={c.orgao || ""}>
                    {c.orgao || "—"}
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground text-xs">{c.uf || "—"}</td>
                  <td className="py-2.5 px-4">
                    {c.categoria && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.categoria}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-foreground text-xs">{formatBRL(c.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default SupplierDetailPage;

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Calendar, Building2, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PeriodDays = 7 | 30 | 90;

function formatBR(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR");
}
function formatCurrency(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatDay(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ContratosIngestaoTab() {
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["contratos-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contratos_stats");
      if (error) throw error;
      return data?.[0] ?? { total: 0, total_30d: 0, total_7d: 0, total_hoje: 0 };
    },
    refetchInterval: 60000,
  });

  const { data: porDia, isLoading: loadingDia } = useQuery({
    queryKey: ["contratos-por-dia", periodDays],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contratos_por_dia", { p_days: periodDays });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: topOrgaos, isLoading: loadingOrgaos } = useQuery({
    queryKey: ["contratos-top-orgaos", periodDays],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contratos_top_orgaos", { p_days: periodDays, p_limit: 10 });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const maxDia = Math.max(1, ...(porDia?.map((d: any) => Number(d.total)) ?? [0]));

  const cards = [
    { label: "Total de Contratos", value: stats?.total, icon: FileText, color: "text-primary" },
    { label: "Últimos 30 dias", value: stats?.total_30d, icon: Calendar, color: "text-module-teal" },
    { label: "Últimos 7 dias", value: stats?.total_7d, icon: TrendingUp, color: "text-module-purple" },
    { label: "Hoje", value: stats?.total_hoje, icon: TrendingUp, color: "text-success" },
  ];

  const periodOptions: PeriodDays[] = [7, 30, 90];

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <c.icon className={`h-4 w-4 ${c.color}`} />
              <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
            </div>
            <p className="mt-2 font-display text-xl font-bold text-foreground">
              {loadingStats ? "—" : formatBR(Number(c.value))}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Seletor de período */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Janela de análise:</span>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm">
          {periodOptions.map((d) => (
            <button
              key={d}
              onClick={() => setPeriodDays(d)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                periodDays === d
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Contratos por dia */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">Contratos por Dia ({periodDays}d)</h3>
          </div>
          {loadingDia ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !porDia?.length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum contrato ingerido nos últimos {periodDays} dias.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {porDia.map((d: any) => (
                    <tr key={d.dia} className="border-b border-border last:border-0">
                      <td className="w-20 px-4 py-2 text-xs text-muted-foreground">{formatDay(d.dia)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${(Number(d.total) / maxDia) * 100}%` }}
                            />
                          </div>
                          <span className="w-16 text-right text-xs font-medium text-foreground">
                            {formatBR(Number(d.total))}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Top órgãos */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">Top Órgãos (30d)</h3>
          </div>
          {loadingOrgaos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !topOrgaos?.length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum contrato ingerido nos últimos 30 dias.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Órgão</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Contratos</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {topOrgaos.map((o: any, i: number) => (
                    <tr key={`${o.cnpj_orgao}-${i}`} className="border-b border-border last:border-0 hover:bg-secondary/30">
                      <td className="max-w-[260px] truncate px-4 py-2 text-foreground" title={o.orgao_nome}>
                        {o.orgao_nome}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-foreground">{formatBR(Number(o.total))}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {formatCurrency(Number(o.valor_total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

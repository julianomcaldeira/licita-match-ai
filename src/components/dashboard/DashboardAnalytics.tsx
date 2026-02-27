import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Trophy, Building2, DollarSign, Calendar,
  BarChart3, Loader2,
} from "lucide-react";
import { format, subMonths } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))",
  "hsl(var(--destructive))", "hsl(var(--info))", "#8b5cf6", "#f59e0b",
  "#10b981", "#ef4444", "#6366f1",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function SectionTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground mb-4">
      <Icon className="h-4 w-4 text-primary" /> {title}
    </h3>
  );
}

export default function DashboardAnalytics() {
  const [period, setPeriod] = useState(6);
  const dateFrom = format(subMonths(new Date(), period), "yyyy-MM-dd");
  const dateTo = format(new Date(), "yyyy-MM-dd");

  // Server-side RPCs — no 1000-row limit
  const { data: salesTotals, isLoading: l1 } = useQuery({
    queryKey: ["analytics-sales-totals", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("analytics_sales_totals", { p_date_from: dateFrom, p_date_to: dateTo });
      if (error) throw error;
      return data?.[0] as { total_sales: number; total_contracts: number } | undefined;
    },
  });

  const { data: topWinners, isLoading: l2 } = useQuery({
    queryKey: ["analytics-top-winners", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("analytics_top_winners", { p_date_from: dateFrom, p_date_to: dateTo, p_limit: 20 });
      if (error) throw error;
      return data as { razao_social: string; cnpj: string; wins: number; total_valor: number }[];
    },
  });

  const { data: topBuyers, isLoading: l3 } = useQuery({
    queryKey: ["analytics-top-buyers", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("analytics_top_buyers", { p_date_from: dateFrom, p_date_to: dateTo, p_limit: 20 });
      if (error) throw error;
      return data as { orgao: string; purchases: number; total_valor: number }[];
    },
  });

  const { data: monthlySales, isLoading: l4 } = useQuery({
    queryKey: ["analytics-monthly-sales", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("analytics_monthly_sales", { p_date_from: dateFrom, p_date_to: dateTo });
      if (error) throw error;
      return data as { month: string; total_valor: number; contract_count: number }[];
    },
  });

  const { data: dailyStats, isLoading: l5 } = useQuery({
    queryKey: ["analytics-daily-status", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("analytics_daily_by_status", { p_date_from: dateFrom, p_date_to: dateTo });
      if (error) throw error;
      const rows = data as { pub_date: string; situacao: string; count: number }[];
      const allStatuses = new Set<string>();
      const dateMap: Record<string, Record<string, number>> = {};
      for (const r of rows) {
        allStatuses.add(r.situacao);
        if (!dateMap[r.pub_date]) dateMap[r.pub_date] = {};
        dateMap[r.pub_date][r.situacao] = r.count;
      }
      return {
        daily: Object.entries(dateMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, statuses]) => ({
          date,
          ...statuses,
          total: Object.values(statuses).reduce((s, v) => s + v, 0),
        })),
        statuses: Array.from(allStatuses),
      };
    },
  });

  const { data: totals, isLoading: l6 } = useQuery({
    queryKey: ["analytics-totals", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("analytics_totals", { p_date_from: dateFrom, p_date_to: dateTo });
      if (error) throw error;
      return data?.[0] as { total_empresas: number; total_orgaos: number } | undefined;
    },
  });

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6;

  const totalLicitacoes = dailyStats?.daily.reduce((s, d) => s + d.total, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Período:</span>
        {[3, 6, 12, 24].map((m) => (
          <button key={m} onClick={() => setPeriod(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              period === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}>
            {m} meses
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Total Vendas (Período)</span>
              <p className="mt-1 font-display text-xl font-bold text-foreground">{formatCurrency(salesTotals?.total_sales || 0)}</p>
              <p className="text-xs text-muted-foreground">{(salesTotals?.total_contracts || 0).toLocaleString("pt-BR")} contratos</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Empresas Participantes</span>
              <p className="mt-1 font-display text-xl font-bold text-foreground">{(totals?.total_empresas || 0).toLocaleString("pt-BR")}</p>
              <p className="text-xs text-muted-foreground">CNPJs distintos</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Órgãos Compradores</span>
              <p className="mt-1 font-display text-xl font-bold text-foreground">{(totals?.total_orgaos || 0).toLocaleString("pt-BR")}</p>
              <p className="text-xs text-muted-foreground">Órgãos distintos</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Top Vencedor</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-1 font-display text-sm font-bold text-foreground truncate cursor-help">{topWinners?.[0]?.razao_social || "—"}</p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">
                  <p className="font-bold">{topWinners?.[0]?.razao_social}</p>
                  <p className="text-xs">CNPJ: {topWinners?.[0]?.cnpj || "Não informado"}</p>
                  <p className="text-xs">Total: {formatCurrency(topWinners?.[0]?.total_valor || 0)}</p>
                </TooltipContent>
              </Tooltip>
              <p className="text-xs text-muted-foreground">{topWinners?.[0]?.wins || 0} vitórias</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Top Comprador</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-1 font-display text-sm font-bold text-foreground truncate cursor-help">{topBuyers?.[0]?.orgao || "—"}</p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">
                  <p className="font-bold">{topBuyers?.[0]?.orgao}</p>
                  <p className="text-xs">Valor Total: {formatCurrency(topBuyers?.[0]?.total_valor || 0)}</p>
                </TooltipContent>
              </Tooltip>
              <p className="text-xs text-muted-foreground">{topBuyers?.[0]?.purchases || 0} compras</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Licitações no Período</span>
              <p className="mt-1 font-display text-xl font-bold text-foreground">{totalLicitacoes.toLocaleString("pt-BR")}</p>
              <p className="text-xs text-muted-foreground">{dailyStats?.statuses.length || 0} status distintos</p>
            </motion.div>
          </div>

          {/* Monthly sales chart */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <SectionTitle icon={DollarSign} title="Vendas Mensais" />
            {monthlySales?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => { const [y, m] = v.split("-"); return `${m}/${y.slice(2)}`; }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => v >= 1000000 ? `R$${(v / 1000000).toFixed(1)}M` : `R$${(v / 1000).toFixed(0)}k`} />
                  <ReTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [formatCurrency(v), "Valor"]}
                    labelFormatter={(l) => { const [y, m] = l.split("-"); return `${m}/${y}`; }}
                  />
                  <Bar dataKey="total_valor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
            )}
          </motion.div>

          {/* Top 20 winners + buyers */}
          <div className="grid gap-4 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <SectionTitle icon={Trophy} title="Top 20 Empresas Vencedoras" />
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {topWinners?.map((w, i) => (
                  <Tooltip key={w.razao_social}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition cursor-help">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          i < 3 ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
                        }`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{w.razao_social}</p>
                          <p className="text-xs text-muted-foreground">{w.cnpj || "CNPJ não informado"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-foreground">{w.wins} vitórias</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(w.total_valor)}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="font-bold text-sm">{w.razao_social}</p>
                      <p className="text-xs mt-1">CNPJ: {w.cnpj || "Não informado"}</p>
                      <p className="text-xs">Vitórias: {w.wins}</p>
                      <p className="text-xs">Valor Total Ganho: {formatCurrency(w.total_valor)}</p>
                      <p className="text-xs">Ticket Médio: {formatCurrency(w.total_valor / w.wins)}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {(!topWinners || topWinners.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum vencedor encontrado</p>
                )}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <SectionTitle icon={Building2} title="Top 20 Órgãos Compradores" />
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {topBuyers?.map((b, i) => (
                  <Tooltip key={b.orgao}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition cursor-help">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          i < 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{b.orgao}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-foreground">{b.purchases} compras</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(b.total_valor)}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="font-bold text-sm">{b.orgao}</p>
                      <p className="text-xs mt-1">Licitações: {b.purchases}</p>
                      <p className="text-xs">Valor Total: {formatCurrency(b.total_valor)}</p>
                      <p className="text-xs">Ticket Médio: {formatCurrency(b.total_valor / b.purchases)}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {(!topBuyers || topBuyers.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum comprador encontrado</p>
                )}
              </div>
            </motion.div>
          </div>

          {/* Daily opportunities by status */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <SectionTitle icon={BarChart3} title="Novas Licitações Diárias por Status" />
            {dailyStats?.daily.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyStats.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => { const parts = v.split("-"); return `${parts[2]}/${parts[1]}`; }}
                    interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  <Line dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Total" />
                  {dailyStats.statuses.slice(0, 5).map((status, i) => (
                    <Line key={status} dataKey={status} stroke={COLORS[i + 1] || COLORS[0]} strokeWidth={1.5} dot={false} name={status} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}

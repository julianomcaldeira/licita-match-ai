import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Trophy, Building2, TrendingUp, DollarSign, Calendar,
  BarChart3, Loader2,
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

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
  const [period, setPeriod] = useState(6); // months

  const dateFrom = format(subMonths(new Date(), period), "yyyy-MM-dd");

  // Top 20 empresas vencedoras
  const { data: topWinners, isLoading: loadingWinners } = useQuery({
    queryKey: ["analytics-top-winners", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacao_vencedores")
        .select("razao_social, valor_final, cnpj, created_at");
      if (error) throw error;
      const filtered = (data || []).filter(
        (v) => v.razao_social && new Date(v.created_at) >= new Date(dateFrom)
      );
      const map: Record<string, { name: string; cnpj: string; wins: number; total: number }> = {};
      for (const v of filtered) {
        const key = v.razao_social!;
        if (!map[key]) map[key] = { name: key, cnpj: v.cnpj || "", wins: 0, total: 0 };
        map[key].wins++;
        map[key].total += v.valor_final || 0;
      }
      return Object.values(map).sort((a, b) => b.wins - a.wins).slice(0, 20);
    },
  });

  // Top 20 órgãos compradores
  const { data: topBuyers, isLoading: loadingBuyers } = useQuery({
    queryKey: ["analytics-top-buyers", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes")
        .select("id, orgao, valor_estimado, data_publicacao");
      if (error) throw error;
      // Only licitações with winners in the period
      const { data: winners } = await supabase
        .from("licitacao_itens")
        .select("licitacao_id, licitacao_vencedores(id)");
      const licitacoesComVencedor = new Set(
        (winners || [])
          .filter((i: any) => i.licitacao_vencedores && i.licitacao_vencedores.length > 0)
          .map((i: any) => i.licitacao_id)
      );
      const filtered = (data || []).filter(
        (l) => licitacoesComVencedor.has(l.id) && l.data_publicacao && l.data_publicacao >= dateFrom
      );
      const map: Record<string, { name: string; purchases: number; total: number }> = {};
      for (const l of filtered) {
        const key = l.orgao;
        if (!map[key]) map[key] = { name: key, purchases: 0, total: 0 };
        map[key].purchases++;
        map[key].total += l.valor_estimado || 0;
      }
      return Object.values(map).sort((a, b) => b.purchases - a.purchases).slice(0, 20);
    },
  });

  // Daily new licitações by situação
  const { data: dailyStats, isLoading: loadingDaily } = useQuery({
    queryKey: ["analytics-daily-status", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes")
        .select("data_publicacao, situacao")
        .gte("data_publicacao", dateFrom)
        .order("data_publicacao");
      if (error) throw error;
      const map: Record<string, Record<string, number>> = {};
      for (const l of data || []) {
        const date = l.data_publicacao || "N/A";
        const status = l.situacao || "Sem status";
        if (!map[date]) map[date] = {};
        map[date][status] = (map[date][status] || 0) + 1;
      }
      // Get all statuses
      const allStatuses = new Set<string>();
      for (const d of Object.values(map)) for (const s of Object.keys(d)) allStatuses.add(s);
      return {
        daily: Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, statuses]) => ({ date, ...statuses, total: Object.values(statuses).reduce((s, v) => s + v, 0) })),
        statuses: Array.from(allStatuses),
      };
    },
  });

  // Monthly sales totals
  const { data: monthlySales, isLoading: loadingMonthlySales } = useQuery({
    queryKey: ["analytics-monthly-sales", period],
    queryFn: async () => {
      const { data: winners } = await supabase
        .from("licitacao_vencedores")
        .select("valor_final, created_at")
        .gte("created_at", dateFrom);
      const { data: items } = await supabase
        .from("licitacao_itens")
        .select("licitacao_id, licitacao_vencedores(id, valor_final, created_at)");
      
      // Aggregate by month from winners
      const monthMap: Record<string, { month: string; total: number; count: number }> = {};
      let grandTotal = 0;
      for (const w of winners || []) {
        const monthKey = (w.created_at || "").slice(0, 7);
        if (!monthMap[monthKey]) monthMap[monthKey] = { month: monthKey, total: 0, count: 0 };
        monthMap[monthKey].total += w.valor_final || 0;
        monthMap[monthKey].count++;
        grandTotal += w.valor_final || 0;
      }
      return {
        monthly: Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)),
        grandTotal,
        totalCount: winners?.length || 0,
      };
    },
  });

  const isLoading = loadingWinners || loadingBuyers || loadingDaily || loadingMonthlySales;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Período:</span>
        {[3, 6, 12, 24].map((m) => (
          <button
            key={m}
            onClick={() => setPeriod(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              period === m
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}
          >
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Total Vendas (Período)</span>
              <p className="mt-1 font-display text-xl font-bold text-foreground">
                {formatCurrency(monthlySales?.grandTotal || 0)}
              </p>
              <p className="text-xs text-muted-foreground">{monthlySales?.totalCount || 0} contratos</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Top Vencedor</span>
              <p className="mt-1 font-display text-sm font-bold text-foreground truncate">
                {topWinners?.[0]?.name || "—"}
              </p>
              <p className="text-xs text-muted-foreground">{topWinners?.[0]?.wins || 0} vitórias</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Top Comprador</span>
              <p className="mt-1 font-display text-sm font-bold text-foreground truncate">
                {topBuyers?.[0]?.name || "—"}
              </p>
              <p className="text-xs text-muted-foreground">{topBuyers?.[0]?.purchases || 0} compras</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="text-sm text-muted-foreground">Licitações no Período</span>
              <p className="mt-1 font-display text-xl font-bold text-foreground">
                {dailyStats?.daily.reduce((s, d) => s + d.total, 0)?.toLocaleString("pt-BR") || "0"}
              </p>
              <p className="text-xs text-muted-foreground">{dailyStats?.statuses.length || 0} status distintos</p>
            </motion.div>
          </div>

          {/* Monthly sales chart */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <SectionTitle icon={DollarSign} title="Vendas Mensais" />
            {monthlySales?.monthly.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlySales.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => {
                      const [y, m] = v.split("-");
                      return `${m}/${y.slice(2)}`;
                    }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <ReTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [formatCurrency(v), "Valor"]}
                    labelFormatter={(l) => { const [y, m] = l.split("-"); return `${m}/${y}`; }}
                  />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
            )}
          </motion.div>

          {/* Top 20 winners + buyers */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top 20 Vencedores */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <SectionTitle icon={Trophy} title="Top 20 Empresas Vencedoras" />
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {topWinners?.map((w, i) => (
                  <div key={w.name} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      i < 3 ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{w.name}</p>
                      <p className="text-xs text-muted-foreground">{w.cnpj || "CNPJ não informado"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">{w.wins} vitórias</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(w.total)}</p>
                    </div>
                  </div>
                ))}
                {(!topWinners || topWinners.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum vencedor encontrado</p>
                )}
              </div>
            </motion.div>

            {/* Top 20 Compradores */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <SectionTitle icon={Building2} title="Top 20 Órgãos Compradores" />
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {topBuyers?.map((b, i) => (
                  <div key={b.name} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      i < 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{b.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">{b.purchases} compras</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(b.total)}</p>
                    </div>
                  </div>
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
                  <ReTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  />
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

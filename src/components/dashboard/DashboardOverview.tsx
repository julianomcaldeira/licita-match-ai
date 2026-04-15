import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import {
  Search, Building2, BarChart3, ArrowRight, TrendingUp, Activity,
  Database, AlertTriangle, FileText, Trophy, MapPin, ShieldAlert,
} from "lucide-react";
import heroBanner from "@/assets/hero-banner.jpg";
import SancionadosAlertCard from "./SancionadosAlertCard";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const fmt = (n: number | null | undefined) =>
  n != null ? n.toLocaleString("pt-BR") : "—";

const fmtBRL = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n)
    : "—";

function StatCard({ label, value, icon: Icon, subtitle, color = "text-primary" }: {
  label: string; value: string | number; icon: any; subtitle?: string; color?: string;
}) {
  return (
    <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
      {subtitle && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          {subtitle}
        </div>
      )}
    </motion.div>
  );
}

export default function DashboardOverview() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin_central";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // Main KPIs
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats-v2"],
    queryFn: async () => {
      const [licQ, vencQ, sancionadasQ, orgaosQ, itensQ] = await Promise.all([
        supabase.from("licitacoes").select("*", { count: "estimated", head: true }),
        supabase.from("licitacao_vencedores").select("*", { count: "estimated", head: true }),
        supabase.from("empresas_sancionadas").select("*", { count: "estimated", head: true }),
        supabase.from("licitacoes").select("orgao").limit(1), // just to trigger
        supabase.from("licitacao_itens").select("*", { count: "estimated", head: true }),
      ]);

      // Get totals from RPCs
      const [totalsQ, salesTotalsQ] = await Promise.all([
        (supabase as any).rpc("analytics_totals"),
        (supabase as any).rpc("analytics_sales_totals"),
      ]);

      const totals = totalsQ.data?.[0] || {};
      const salesTotals = salesTotalsQ.data?.[0] || {};

      return {
        totalLicitacoes: licQ.count ?? 0,
        totalVencedores: vencQ.count ?? 0,
        totalSancionadas: sancionadasQ.count ?? 0,
        totalItens: itensQ.count ?? 0,
        totalEmpresas: totals.total_empresas ?? 0,
        totalOrgaos: totals.total_orgaos ?? 0,
        totalSales: salesTotals.total_sales ?? 0,
        totalContracts: salesTotals.total_contracts ?? 0,
      };
    },
  });

  // Top winners
  const { data: topWinners } = useQuery({
    queryKey: ["dashboard-top-winners"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("analytics_top_winners", { p_limit: 5 });
      return data || [];
    },
  });

  // Top buyers
  const { data: topBuyers } = useQuery({
    queryKey: ["dashboard-top-buyers"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("analytics_top_buyers", { p_limit: 5 });
      return data || [];
    },
  });

  // Recent ingestion activity
  const { data: recentLogs } = useQuery({
    queryKey: ["dashboard-recent-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("ingestao_logs")
        .select("fonte, endpoint, status, registros_processados, created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "usuário";

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8" style={{ background: "var(--gradient-hero)" }}>
        <img src={heroBanner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay" />
        <div className="relative z-10">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-primary-foreground">
            {greeting}, {displayName}! 👋
          </h1>
          <p className="mt-1 text-sm sm:text-base text-primary-foreground/80">
            Inteligência B2G — Visão geral da plataforma
          </p>
        </div>
      </div>

      {/* Sancionados Alert */}
      <SancionadosAlertCard />

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Licitações" value={fmt(stats?.totalLicitacoes)} icon={Database}
          subtitle={`${fmt(stats?.totalItens)} itens catalogados`} />
        <StatCard label="Empresas Vencedoras" value={fmt(stats?.totalEmpresas)} icon={Trophy}
          subtitle={`${fmt(stats?.totalVencedores)} vitórias`} color="text-success" />
        <StatCard label="Órgãos Compradores" value={fmt(stats?.totalOrgaos)} icon={Building2}
          subtitle={`${fmt(stats?.totalContracts)} contratos`} />
        <StatCard label="Empresas Sancionadas" value={fmt(stats?.totalSancionadas)} icon={ShieldAlert}
          subtitle="CEIS + CNEP" color="text-destructive" />
      </motion.div>

      {/* Volume financeiro */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-3">
        <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-1">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-success" /> Volume Financeiro
          </h3>
          <p className="mt-4 font-display text-3xl font-bold text-foreground">
            {fmtBRL(stats?.totalSales)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Valor total homologado em {fmt(stats?.totalContracts)} registros
          </p>
        </motion.div>

        {/* Top Vencedoras */}
        <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <Trophy className="h-4 w-4 text-warning" /> Top Empresas Vencedoras
            </h3>
            <Link to="/empresas" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {topWinners?.length ? topWinners.map((w: any, i: number) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/30 transition">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{w.razao_social || "—"}</p>
                  <p className="text-xs text-muted-foreground">{w.cnpj || "—"} · {w.wins} vitórias</p>
                </div>
                <span className="text-sm font-bold text-foreground shrink-0">{fmtBRL(w.total_valor)}</span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Órgãos */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-primary" /> Top Órgãos Compradores
            </h3>
            <Link to="/licitacoes" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Ver licitações <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {topBuyers?.length ? topBuyers.map((b: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground truncate">{b.orgao || "—"}</p>
                  <p className="text-xs text-muted-foreground">{b.purchases} licitações</p>
                </div>
                <span className="text-sm font-bold text-foreground shrink-0">{fmtBRL(b.total_valor)}</span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            )}
          </div>
        </motion.div>

        {/* Atividade de Ingestão */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground mb-3">
            <BarChart3 className="h-4 w-4 text-primary" /> Atividade de Ingestão
          </h3>
          <div className="space-y-2">
            {recentLogs?.length ? recentLogs.map((log: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className={`flex h-2 w-2 rounded-full shrink-0 ${
                  log.status === "sucesso" ? "bg-success" : log.status === "parcial" ? "bg-warning" : "bg-destructive"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground truncate">{log.fonte} — {log.endpoint}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground shrink-0">
                  {log.registros_processados ?? 0} reg.
                </span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum log recente</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { name: "Licitações", icon: Search, href: "/licitacoes", color: "border-t-module-blue" },
          { name: "Sancionadas", icon: ShieldAlert, href: "/sancionadas", color: "border-t-destructive" },
          { name: "Empresas", icon: Building2, href: "/empresas", color: "border-t-module-green" },
          { name: "Monitor", icon: Activity, href: "/monitor-ingestao", color: "border-t-module-orange" },
        ].map((m) => (
          <Link key={m.name} to={m.href}
            className={`group flex items-center gap-3 rounded-xl border-t-4 ${m.color} border border-border bg-card p-4 shadow-sm transition hover:shadow-md`}>
            <m.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition" />
            <span className="text-sm font-medium text-foreground">{m.name}</span>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </Link>
        ))}
      </motion.div>
    </div>
  );
}

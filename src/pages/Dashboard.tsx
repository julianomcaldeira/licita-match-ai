import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import {
  Search,
  Zap,
  Building2,
  Brain,
  BarChart3,
  ArrowRight,
  TrendingUp,
  Activity,
  Database,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Star,
  Trophy,
  MapPin,
} from "lucide-react";
import heroBanner from "@/assets/hero-banner.jpg";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

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

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 80 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round"
          className="transition-all duration-1000" />
      </svg>
      <span className="absolute font-display text-lg font-bold text-foreground">{score}</span>
    </div>
  );
}

function TopOportunidadeCard({ op }: { op: any }) {
  const lic = op.licitacoes;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition">
      <ScoreRing score={op.score_aderencia} size={48} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{lic?.objeto || "—"}</p>
        <p className="text-xs text-muted-foreground truncate">{lic?.orgao || "—"}</p>
      </div>
      <div className="hidden sm:block text-right shrink-0">
        <p className="text-sm font-bold text-foreground">
          {lic?.valor_estimado
            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lic.valor_estimado)
            : "—"}
        </p>
        <p className={`text-xs capitalize ${
          op.nivel_risco === "baixo" ? "text-success" : op.nivel_risco === "medio" ? "text-warning" : "text-destructive"
        }`}>{op.nivel_risco || "—"}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, role, empresaId } = useAuth();
  const isAdmin = role === "admin_central";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // Stats query — scoped by empresa for non-admin users
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", empresaId, isAdmin],
    queryFn: async () => {
      const [licQ, opsQ] = await Promise.all([
        supabase.from("licitacoes").select("*", { count: "exact", head: true }),
        (() => {
          let q = supabase.from("oportunidades").select("score_aderencia, nivel_risco, tipo_oportunidade, empresa_id");
          if (!isAdmin && empresaId) q = q.eq("empresa_id", empresaId);
          return q;
        })(),
      ]);

      const ops = opsQ.data || [];
      const totalOps = ops.length;
      const highScore = ops.filter(o => o.score_aderencia >= 80).length;
      const midScore = ops.filter(o => o.score_aderencia >= 50 && o.score_aderencia < 80).length;
      const lowScore = ops.filter(o => o.score_aderencia < 50).length;
      const avgScore = totalOps > 0 ? Math.round(ops.reduce((s, o) => s + o.score_aderencia, 0) / totalOps) : 0;
      const coreBusiness = ops.filter(o => o.tipo_oportunidade === "core business").length;
      const riskLow = ops.filter(o => o.nivel_risco === "baixo").length;

      // Distinct empresas if admin
      let empresasCount = 0;
      if (isAdmin) {
        const { count } = await supabase.from("empresas_clientes").select("*", { count: "exact", head: true });
        empresasCount = count ?? 0;
      }

      return {
        licitacoes: licQ.count ?? 0,
        totalOps,
        highScore,
        midScore,
        lowScore,
        avgScore,
        coreBusiness,
        riskLow,
        empresas: empresasCount,
      };
    },
  });

  // Top oportunidades
  const { data: topOps } = useQuery({
    queryKey: ["dashboard-top-ops", empresaId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from("oportunidades")
        .select("*, licitacoes(objeto, orgao, valor_estimado, uf), empresas_clientes(nome)")
        .order("score_aderencia", { ascending: false })
        .limit(5);
      if (!isAdmin && empresaId) q = q.eq("empresa_id", empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // UF distribution for top ops
  const { data: ufStats } = useQuery({
    queryKey: ["dashboard-uf", empresaId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from("oportunidades")
        .select("licitacoes(uf)")
        .gte("score_aderencia", 50);
      if (!isAdmin && empresaId) q = q.eq("empresa_id", empresaId);
      const { data } = await q;
      const ufMap: Record<string, number> = {};
      for (const op of data || []) {
        const uf = (op.licitacoes as any)?.uf || "N/A";
        ufMap[uf] = (ufMap[uf] || 0) + 1;
      }
      return Object.entries(ufMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    },
  });

  // Recent analysis activity
  const { data: recentActivity } = useQuery({
    queryKey: ["dashboard-recent", empresaId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from("oportunidades")
        .select("score_aderencia, tipo_oportunidade, created_at, licitacoes(objeto), empresas_clientes(nome)")
        .order("created_at", { ascending: false })
        .limit(6);
      if (!isAdmin && empresaId) q = q.eq("empresa_id", empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
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
            {isAdmin
              ? "Visão geral de todas as empresas e oportunidades"
              : "Suas oportunidades e análises de licitações"}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Licitações na Base" value={stats?.licitacoes?.toLocaleString("pt-BR") ?? "—"} icon={Database} subtitle="Total ingeridas" />
        <StatCard label="Oportunidades Analisadas" value={stats?.totalOps?.toLocaleString("pt-BR") ?? "—"} icon={Brain} subtitle={`${stats?.coreBusiness ?? 0} core business`} />
        <StatCard label="Score Médio" value={stats?.avgScore ?? "—"} icon={TrendingUp}
          subtitle={stats?.avgScore && stats.avgScore >= 50 ? "Bom desempenho" : "Refine as keywords"}
          color={stats?.avgScore && stats.avgScore >= 50 ? "text-success" : "text-warning"} />
        {isAdmin ? (
          <StatCard label="Empresas Ativas" value={stats?.empresas ?? "—"} icon={Building2} subtitle="Multi-tenant" />
        ) : (
          <StatCard label="Alta Aderência" value={stats?.highScore ?? "—"} icon={Target} subtitle="Score ≥ 80" color="text-success" />
        )}
      </motion.div>

      {/* Score Distribution */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-3">
        <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" /> Distribuição de Scores
          </h3>
          <div className="mt-4 space-y-3">
            {[
              { label: "Alta (≥80)", count: stats?.highScore ?? 0, total: stats?.totalOps ?? 1, color: "bg-success" },
              { label: "Média (50-79)", count: stats?.midScore ?? 0, total: stats?.totalOps ?? 1, color: "bg-warning" },
              { label: "Baixa (<50)", count: stats?.lowScore ?? 0, total: stats?.totalOps ?? 1, color: "bg-destructive" },
            ].map((b) => (
              <div key={b.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="font-bold text-foreground">{b.count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div className={`h-2 rounded-full ${b.color} transition-all duration-700`}
                    style={{ width: `${b.total > 0 ? (b.count / b.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Risk breakdown */}
        <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" /> Perfil de Risco
          </h3>
          <div className="mt-4 flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-success/10 mx-auto">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <p className="mt-2 font-display text-xl font-bold text-foreground">{stats?.riskLow ?? 0}</p>
              <p className="text-xs text-muted-foreground">Baixo</p>
            </div>
            <div className="text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-warning/10 mx-auto">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>
              <p className="mt-2 font-display text-xl font-bold text-foreground">
                {(stats?.totalOps ?? 0) - (stats?.riskLow ?? 0) - ((stats?.totalOps ?? 0) - (stats?.riskLow ?? 0) - (stats?.highScore ?? 0) > 0 ? 0 : 0)}
              </p>
              <p className="text-xs text-muted-foreground">Médio/Alto</p>
            </div>
          </div>
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              {stats?.riskLow && stats.totalOps ? Math.round((stats.riskLow / stats.totalOps) * 100) : 0}% das oportunidades com risco baixo
            </p>
          </div>
        </motion.div>

        {/* UF Map */}
        <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <MapPin className="h-4 w-4 text-primary" /> Top UFs (Score ≥ 50)
          </h3>
          <div className="mt-4 space-y-2">
            {ufStats?.length ? ufStats.map(([uf, count]) => (
              <div key={uf} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-8 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">{uf}</span>
                  <div className="h-1.5 rounded-full bg-primary/20" style={{ width: `${Math.max(24, (count / (ufStats[0]?.[1] || 1)) * 100)}px` }}>
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: "100%" }} />
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">{count}</span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma análise ainda</p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top opportunities */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <Trophy className="h-4 w-4 text-warning" /> Top Oportunidades
            </h3>
            <Link to="/oportunidades" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {topOps?.length ? topOps.map((op: any) => (
              <TopOportunidadeCard key={op.id} op={op} />
            )) : (
              <div className="flex flex-col items-center py-8">
                <Brain className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Nenhuma oportunidade analisada</p>
                <Link to="/oportunidades" className="mt-2 text-xs text-primary hover:underline">
                  Analisar agora →
                </Link>
              </div>
            )}
          </div>
        </motion.div>

        {/* Recent activity */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground mb-4">
            <Clock className="h-4 w-4 text-primary" /> Atividade Recente
          </h3>
          <div className="space-y-3">
            {recentActivity?.length ? recentActivity.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  a.score_aderencia >= 80 ? "bg-success/10 text-success" :
                  a.score_aderencia >= 50 ? "bg-warning/10 text-warning" :
                  "bg-destructive/10 text-destructive"
                }`}>
                  {a.score_aderencia}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-foreground">{(a.licitacoes as any)?.objeto || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin && (a.empresas_clientes as any)?.nome ? `${(a.empresas_clientes as any).nome} · ` : ""}
                    {new Date(a.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                  a.tipo_oportunidade === "core business" ? "bg-success/10 text-success" :
                  a.tipo_oportunidade === "oportunidade lateral" ? "bg-warning/10 text-warning" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {a.tipo_oportunidade || "—"}
                </span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade recente</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { name: "Licitações", icon: Search, href: "/licitacoes", color: "border-t-module-blue" },
          { name: "Oportunidades", icon: Zap, href: "/oportunidades", color: "border-t-module-purple" },
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

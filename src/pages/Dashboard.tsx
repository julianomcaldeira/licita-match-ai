import { motion } from "framer-motion";
import {
  Search,
  Zap,
  Building2,
  Brain,
  BarChart3,
  FileText,
  Bell,
  Shield,
  Users,
  Settings,
  ArrowRight,
  TrendingUp,
  Activity,
  Database,
} from "lucide-react";
import heroBanner from "@/assets/hero-banner.jpg";

const modules = [
  { name: "Licitações", desc: "Dados do PNCP e Portal da Transparência", icon: Search, color: "bg-module-blue", borderCss: "border-t-module-blue", href: "/licitacoes", status: "Ativo" },
  { name: "Oportunidades", desc: "Matching semântico com IA", icon: Zap, color: "bg-module-purple", borderCss: "border-t-module-purple", href: "/oportunidades", status: "Ativo" },
  { name: "Empresas", desc: "Gestão multi-tenant de clientes", icon: Building2, color: "bg-module-green", borderCss: "border-t-module-green", href: "/empresas", status: "Ativo" },
  { name: "Motor IA", desc: "Configuração do motor de análise", icon: Brain, color: "bg-module-orange", borderCss: "border-t-module-orange", href: "/motor-ia", status: "Ativo" },
  { name: "Relatórios", desc: "Exportação CSV e PDF", icon: FileText, color: "bg-module-teal", borderCss: "border-t-module-teal", href: "/relatorios", status: "Ativo" },
  { name: "Analytics", desc: "Métricas globais e consumo", icon: BarChart3, color: "bg-module-pink", borderCss: "border-t-module-pink", href: "/analytics", status: "Ativo" },
  { name: "Notificações", desc: "Alertas de oportunidades > 80%", icon: Bell, color: "bg-module-yellow", borderCss: "border-t-module-yellow", href: "/notificacoes", status: "Ativo" },
  { name: "Auditoria", desc: "Logs e controle de segurança", icon: Shield, color: "bg-module-red", borderCss: "border-t-module-red", href: "/auditoria", status: "Ativo" },
];

const stats = [
  { label: "Licitações Ingeridas", value: "12.847", icon: Database, change: "+342 hoje" },
  { label: "Análises IA Realizadas", value: "8.291", icon: Brain, change: "+156 hoje" },
  { label: "Empresas Ativas", value: "24", icon: Building2, change: "+2 este mês" },
  { label: "Score Médio", value: "73.4", icon: TrendingUp, change: "+2.1 pts" },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-2xl p-8"
        style={{ background: "var(--gradient-hero)" }}
      >
        <img
          src={heroBanner}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay"
        />
        <div className="relative z-10">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">
            {greeting}! 👋
          </h1>
          <p className="mt-1 text-lg text-primary-foreground/80">
            Bem-vindo ao LicitaMatch AI — sua central de inteligência em licitações
          </p>
        </div>
      </div>

      {/* Stats */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {stats.map((s) => (
          <motion.div
            key={s.label}
            variants={item}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">{s.value}</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-success">
              <Activity className="h-3 w-3" />
              {s.change}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Modules */}
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground">Seus Módulos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Acesse diretamente os módulos do sistema</p>
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {modules.map((mod) => (
            <motion.a
              key={mod.name}
              variants={item}
              href={mod.href}
              className={`group rounded-xl border-t-4 ${mod.borderCss} border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md`}
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${mod.color} text-primary-foreground`}>
                <mod.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-foreground">{mod.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{mod.desc}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs font-medium text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {mod.status}
                </span>
                <span className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                  Acessar <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </motion.a>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Building2,
  Users,
  BarChart3,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  ShieldAlert,
  Key,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logoImg from "@/assets/logo-ipesquisei.png";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Licitações", href: "/licitacoes", icon: Search },
  { name: "Empresas", href: "/empresas", icon: Building2 },
  { name: "Sancionadas", href: "/sancionadas", icon: ShieldAlert },
  { name: "Usuários", href: "/usuarios", icon: Users },
  { name: "Relatórios", href: "/relatorios", icon: FileText },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Monitor Ingestão", href: "/monitor-ingestao", icon: Activity },
  { name: "API Pública", href: "/api", icon: Key },
  { name: "Configurações", href: "/configuracoes", icon: Settings },
];

export default function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
      style={{ background: "var(--gradient-sidebar)" }}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 px-4">
        <img src={logoImg} alt="i-pesquisei" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
        {!collapsed && (
          <div className="animate-fade-in">
            <h1 className="font-display text-base font-bold text-sidebar-primary">
              i-pesquisei
            </h1>
            <p className="text-[10px] font-medium tracking-wider text-sidebar-foreground/60 uppercase">
              Inteligência B2G
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-accent-foreground")} />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 transition hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span>Recolher</span>}
        </button>
        {!collapsed && (
          <p className="text-center text-[10px] text-sidebar-foreground/40 font-medium">
            by <span className="text-sidebar-foreground/60 font-semibold">StartGi</span>
          </p>
        )}
      </div>
    </aside>
  );
}

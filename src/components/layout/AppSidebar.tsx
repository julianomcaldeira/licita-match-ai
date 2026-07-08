import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Building2,
  BarChart3,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  ShieldAlert,
  ShieldCheck,
  Key,
  TrendingUp,
  Stethoscope,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import logoImg from "@/assets/logo-ipesquisei.png";

type NavItem = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles?: string[]; // se definido, restringe a esses roles
};

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Licitações", href: "/licitacoes", icon: Search },
  { name: "Empresas", href: "/empresas", icon: Building2 },
  { name: "Sancionadas", href: "/sancionadas", icon: ShieldAlert },
  { name: "Score Órgãos", href: "/score-orgaos", icon: ShieldCheck },
  { name: "Índice StartGi", href: "/indice-startgi", icon: TrendingUp, roles: ["admin_central", "admin_empresa"] },
  { name: "Relatórios", href: "/relatorios", icon: FileText },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Monitor Ingestão", href: "/monitor-ingestao", icon: Activity },
  { name: "API Pública", href: "/api", icon: Key },
  { name: "Configurações", href: "/configuracoes", icon: Settings },
];

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function AppSidebar({ mobileOpen = false, onMobileClose }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { role } = useAuth();
  const visibleNav = navigation.filter((i) => !i.roles || (role && i.roles.includes(role)));

  // Close mobile drawer on route change
  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-fade-in"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-sidebar-border transition-transform duration-300",
          // width
          collapsed ? "w-[72px]" : "w-[260px]",
          // mobile: slide in/out; desktop: always visible
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
        style={{ background: "var(--gradient-sidebar)" }}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
            <img src={logoImg} alt="i-pesquisei" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-1 items-center justify-between animate-fade-in">
              <div>
                <h1 className="font-display text-base font-bold text-sidebar-primary">
                  i-pesquisei
                </h1>
                <p className="text-[10px] font-medium tracking-wider text-sidebar-foreground/60 uppercase">
                  Inteligência B2G
                </p>
              </div>
              <button
                onClick={onMobileClose}
                className="lg:hidden flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
          {visibleNav.map((item) => {
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

        {/* Collapse toggle (desktop only) */}
        <div className="border-t border-sidebar-border p-3 space-y-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 transition hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
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
    </>
  );
}

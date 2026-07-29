import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Building2,
  BarChart3,
  FileText,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Activity,
  ShieldAlert,
  Key,
  TrendingUp,
  Stethoscope,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import logoImg from "@/assets/logo-ipesquisei.png";

type NavItem = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles?: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Inteligência",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Licitações", href: "/licitacoes", icon: Search },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Índice StartGi", href: "/indice-startgi", icon: TrendingUp, roles: ["admin_central", "admin_empresa"] },
    ],
  },
  {
    label: "Mercado",
    items: [
      { name: "Empresas", href: "/empresas", icon: Building2 },
      { name: "Sancionadas", href: "/sancionadas", icon: ShieldAlert },
      { name: "Relatórios", href: "/relatorios", icon: FileText },
    ],
  },
  {
    label: "Administração",
    items: [
      { name: "Clientes", href: "/clientes", icon: Building2, roles: ["admin_central"] },
      { name: "API Pública", href: "/api", icon: Key },
      { name: "Monitor Ingestão", href: "/monitor-ingestao", icon: Activity },
      { name: "Diagnóstico Dados", href: "/diagnostico-dados", icon: Stethoscope, roles: ["admin_central"] },
      { name: "Configurações", href: "/configuracoes", icon: Settings },
    ],
  },
];

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function AppSidebar({
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onToggleCollapse,
}: AppSidebarProps) {
  const location = useLocation();
  const { role } = useAuth();

  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || (role && i.roles.includes(role))) }))
    .filter((g) => g.items.length > 0);

  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-sidebar-border transition-[width,transform] duration-300 ease-out",
          collapsed ? "w-[76px]" : "w-[248px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
        style={{ background: "var(--gradient-sidebar)" }}
      >
        {/* Marca */}
        <div className={cn("flex h-16 items-center gap-3 px-4", collapsed && "justify-center px-0")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-card p-1 shadow-xs">
            <img src={logoImg} alt="i-pesquisei" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-1 items-center justify-between animate-fade-in">
              <div>
                <h1 className="font-display text-[15px] font-bold leading-none text-sidebar-primary">i-pesquisei</h1>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Inteligência B2G
                </p>
              </div>
              <button
                onClick={onMobileClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary lg:hidden"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Navegação */}
        <nav className={cn("mt-2 flex-1 space-y-6 overflow-y-auto pb-4", collapsed ? "px-3" : "px-3")}>
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
              ) : (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = location.pathname === item.href;
                const link = (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "text-primary")} />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </NavLink>
                );

                return collapsed ? (
                  <Tooltip key={item.name} delayDuration={0}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.name}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          ))}
        </nav>

        {/* Rodapé */}
        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={onToggleCollapse}
            className={cn(
              "hidden w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:flex",
              collapsed && "justify-center px-0"
            )}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Recolher</span>}
          </button>
          {!collapsed && (
            <p className="mt-2 text-center text-[10px] font-medium text-muted-foreground/60">
              by <span className="font-semibold text-muted-foreground">StartGi</span>
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

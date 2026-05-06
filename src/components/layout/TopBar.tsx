import { Bell, Search, User, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface TopBarProps {
  onMenuClick?: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, role, signOut } = useAuth();

  const roleName = role === "admin_central" ? "Admin Central" : role === "admin_empresa" ? "Admin Empresa" : "Usuário";
  const userName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4 lg:px-6">
      <div className="flex flex-1 items-center gap-2 sm:gap-4 min-w-0">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Search */}
        <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md lg:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            className="h-10 w-full rounded-lg border border-input bg-secondary pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          className="relative hidden sm:flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            3
          </span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3 rounded-lg bg-secondary px-2 sm:px-3 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden md:block text-left min-w-0">
            <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{roleName}</p>
          </div>
          <button
            onClick={signOut}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-destructive transition"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

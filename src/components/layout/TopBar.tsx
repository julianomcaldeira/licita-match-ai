import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LogOut, Menu, User, Command as CommandIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopBarProps {
  onMenuClick?: () => void;
}

const destinations: { label: string; href: string; group: string }[] = [
  { label: "Dashboard", href: "/dashboard", group: "Inteligência" },
  { label: "Licitações", href: "/licitacoes", group: "Inteligência" },
  { label: "Analytics", href: "/analytics", group: "Inteligência" },
  { label: "Índice StartGi", href: "/indice-startgi", group: "Inteligência" },
  { label: "Empresas", href: "/empresas", group: "Mercado" },
  { label: "Sancionadas", href: "/sancionadas", group: "Mercado" },
  { label: "Relatórios", href: "/relatorios", group: "Mercado" },
  { label: "Clientes", href: "/clientes", group: "Administração" },
  { label: "API Pública", href: "/api", group: "Administração" },
  { label: "Monitor Ingestão", href: "/monitor-ingestao", group: "Administração" },
  { label: "Configurações", href: "/configuracoes", group: "Administração" },
];

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const roleName = role === "admin_central" ? "Admin Central" : role === "admin_empresa" ? "Admin Empresa" : "Usuário";
  const userName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário";
  const initials = userName.slice(0, 2).toUpperCase();

  const groups = Array.from(new Set(destinations.map((d) => d.group)));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-4 lg:px-6">
        <div className="flex flex-1 items-center gap-2 sm:gap-4">
          <button
            onClick={onMenuClick}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => setOpen(true)}
            className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground shadow-xs transition hover:border-primary/40 hover:text-foreground lg:w-96"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Ir para… ou buscar</span>
            <kbd className="hidden items-center gap-0.5 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium sm:flex">
              <CommandIcon className="h-3 w-3" />K
            </kbd>
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 shadow-xs transition hover:bg-secondary sm:px-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </span>
            <span className="hidden min-w-0 text-left md:block">
              <span className="block max-w-[150px] truncate text-sm font-medium text-foreground">{userName}</span>
              <span className="block text-xs text-muted-foreground">{roleName}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
              <User className="mr-2 h-4 w-4" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar telas do sistema..." />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g} heading={g}>
              {destinations
                .filter((d) => d.group === g)
                .map((d) => (
                  <CommandItem
                    key={d.href}
                    value={d.label}
                    onSelect={() => {
                      setOpen(false);
                      navigate(d.href);
                    }}
                  >
                    {d.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

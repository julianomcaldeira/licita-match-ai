import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, Users, Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  empresa_id: string;
  nome: string;
  cnpj: string | null;
  criada_em: string;
  plano_codigo: string | null;
  plano_nome: string | null;
  assinatura_status: string | null;
  assinatura_inicio: string | null;
  usuarios_total: number;
  cnpjs_monitorados: number;
  ultimo_acesso: string | null;
  acessos_7d: number;
  acessos_7d_anteriores: number;
  ia_consultas_30d: number;
  usuarios_ativos_30d: number;
  top_paginas_30d: { page: string; count: number }[];
};

type Health = "verde" | "amarelo" | "vermelho" | "cinza";

function healthOf(ultimo: string | null): Health {
  if (!ultimo) return "cinza";
  const days = (Date.now() - new Date(ultimo).getTime()) / 86400000;
  if (days <= 7) return "verde";
  if (days <= 14) return "amarelo";
  return "vermelho";
}

const healthOrder: Record<Health, number> = { vermelho: 0, cinza: 1, amarelo: 2, verde: 3 };

function healthBadge(h: Health) {
  const cfg: Record<Health, { label: string; cls: string }> = {
    vermelho: { label: "Em risco", cls: "bg-red-100 text-red-700 border-red-200" },
    amarelo:  { label: "Atenção",  cls: "bg-amber-100 text-amber-700 border-amber-200" },
    verde:    { label: "Saudável", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    cinza:    { label: "Sem uso",  cls: "bg-muted text-muted-foreground border-border" },
  };
  const c = cfg[h];
  return <Badge variant="outline" className={cn("font-medium", c.cls)}>{c.label}</Badge>;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function fmtCnpj(v: string | null) {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return v;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function statusBadge(s: string | null) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    ativa: "bg-emerald-100 text-emerald-700 border-emerald-200",
    trial: "bg-blue-100 text-blue-700 border-blue-200",
    inadimplente: "bg-amber-100 text-amber-700 border-amber-200",
    cancelada: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={cn(map[s] ?? "")}>{s}</Badge>;
}

type SortKey =
  | "nome" | "cnpj" | "plano_nome" | "assinatura_status"
  | "criada_em" | "usuarios_total" | "cnpjs_monitorados";

export default function ClientesAdminPage() {
  const { role, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "nome", dir: "asc",
  });

  useEffect(() => {
    if (role !== "admin_central") return;
    (async () => {
      const { data, error } = await supabase.rpc("admin_clientes_overview" as any);
      if (error) setErr(error.message);
      else setRows((data as any) ?? []);
    })();
  }, [role]);

  const sortedList = useMemo(() => {
    if (!rows) return [];
    const arr = [...rows];
    arr.sort((a, b) => {
      const av: any = (a as any)[sort.key];
      const bv: any = (b as any)[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv), "pt-BR")
        : String(bv).localeCompare(String(av), "pt-BR");
    });
    return arr;
  }, [rows, sort]);

  const churnList = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const ha = healthOf(a.ultimo_acesso);
      const hb = healthOf(b.ultimo_acesso);
      if (healthOrder[ha] !== healthOrder[hb]) return healthOrder[ha] - healthOrder[hb];
      const ta = a.ultimo_acesso ? new Date(a.ultimo_acesso).getTime() : 0;
      const tb = b.ultimo_acesso ? new Date(b.ultimo_acesso).getTime() : 0;
      return ta - tb; // mais antigos primeiro
    });
  }, [rows]);

  if (authLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  }
  if (role !== "admin_central") {
    return <Navigate to="/dashboard" replace />;
  }

  const toggleSort = (key: SortKey) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };

  const SortHeader = ({ k, children }: { k: SortKey; children: React.ReactNode }) => {
    const active = sort.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {children}
        <Icon className={cn("h-3.5 w-3.5", active ? "text-foreground" : "text-muted-foreground/60")} />
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" /> Clientes
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão administrativa de clientes, assinaturas e saúde de uso.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {/* SEÇÃO 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de clientes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHeader k="nome">Empresa</SortHeader></TableHead>
                <TableHead><SortHeader k="cnpj">CNPJ</SortHeader></TableHead>
                <TableHead><SortHeader k="plano_nome">Plano</SortHeader></TableHead>
                <TableHead><SortHeader k="assinatura_status">Status</SortHeader></TableHead>
                <TableHead><SortHeader k="criada_em">Entrada</SortHeader></TableHead>
                <TableHead className="text-right"><SortHeader k="usuarios_total">Usuários</SortHeader></TableHead>
                <TableHead className="text-right"><SortHeader k="cnpjs_monitorados">CNPJs monit.</SortHeader></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando…</TableCell></TableRow>
              ) : sortedList.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado.</TableCell></TableRow>
              ) : sortedList.map((r) => (
                <TableRow key={r.empresa_id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtCnpj(r.cnpj)}</TableCell>
                  <TableCell>{r.plano_nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{statusBadge(r.assinatura_status)}</TableCell>
                  <TableCell>{fmtDate(r.criada_em)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.usuarios_total}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.cnpjs_monitorados}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SEÇÃO 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Uso e risco de churn
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ordenado por risco: clientes sem acesso recente aparecem no topo. Janela de tendência: 7d vs. 7d anteriores.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saúde</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-right">Acessos 7d</TableHead>
                <TableHead className="text-right">7d anteriores</TableHead>
                <TableHead className="text-right">Tendência</TableHead>
                <TableHead className="text-right">IA (30d)</TableHead>
                <TableHead className="text-right">Ativos / total</TableHead>
                <TableHead>Top 3 telas (30d)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando…</TableCell></TableRow>
              ) : churnList.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado.</TableCell></TableRow>
              ) : churnList.map((r) => {
                const h = healthOf(r.ultimo_acesso);
                const delta = r.acessos_7d - r.acessos_7d_anteriores;
                const trendSymbol =
                  delta > 0 ? <span className="text-emerald-600">▲ {delta}</span> :
                  delta < 0 ? <span className="text-red-600">▼ {Math.abs(delta)}</span> :
                  <span className="text-muted-foreground">–</span>;
                return (
                  <TableRow key={r.empresa_id}>
                    <TableCell>{healthBadge(h)}</TableCell>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell>{r.ultimo_acesso ? new Date(r.ultimo_acesso).toLocaleString("pt-BR") : <span className="text-muted-foreground">nunca</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.acessos_7d}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.acessos_7d_anteriores}</TableCell>
                    <TableCell className="text-right tabular-nums">{trendSymbol}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.ia_consultas_30d}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.usuarios_ativos_30d}<span className="text-muted-foreground"> / {r.usuarios_total}</span>
                    </TableCell>
                    <TableCell>
                      {r.top_paginas_30d.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.top_paginas_30d.map((p, i) => (
                            <Badge key={i} variant="secondary" className="font-mono text-[10px]">
                              {p.page} · {p.count}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

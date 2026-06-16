import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy, FileText, Loader2, Search, Building2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const PAGE_SIZE = 50;

function fmtMoney(v: any) {
  const n = Number(v ?? 0);
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtDate(d: any) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return String(d); }
}

function MatchBadge({ source }: { source?: string }) {
  if (!source) return null;
  const map: Record<string, { label: string; cls: string }> = {
    cnpj: { label: "CNPJ", cls: "bg-emerald-500/10 text-emerald-600" },
    keyword: { label: "Palavra-chave", cls: "bg-primary/10 text-primary" },
    both: { label: "CNPJ + Keyword", cls: "bg-amber-500/10 text-amber-600" },
  };
  const m = map[source] ?? { label: source, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>;
}

export default function ClienteDetalhePage() {
  const { id: empresaId } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"vitorias" | "contratos">("vitorias");
  const [search, setSearch] = useState("");
  const [onlyVencidas, setOnlyVencidas] = useState(true);
  const [onlyProprios, setOnlyProprios] = useState(true);
  const [page, setPage] = useState(0);

  const { data: empresa } = useQuery({
    queryKey: ["empresa", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas_clientes")
        .select("*")
        .eq("id", empresaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!empresaId,
  });

  const { data: resumo } = useQuery({
    queryKey: ["cliente_resumo", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cliente_resumo", { p_empresa_id: empresaId! });
      if (error) throw error;
      return data as any;
    },
    enabled: !!empresaId,
  });

  const licitacoesQuery = useQuery({
    queryKey: ["cliente_licitacoes", empresaId, search, onlyVencidas, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_cliente_licitacoes", {
        p_empresa_id: empresaId!,
        p_search: search || null,
        p_only_vencidas: onlyVencidas,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!empresaId && tab === "vitorias",
  });

  const contratosQuery = useQuery({
    queryKey: ["cliente_contratos", empresaId, search, onlyProprios, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_cliente_contratos", {
        p_empresa_id: empresaId!,
        p_search: search || null,
        p_only_proprios: onlyProprios,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!empresaId && tab === "contratos",
  });

  const isLicit = tab === "vitorias";
  const rows = isLicit ? licitacoesQuery.data : contratosQuery.data;
  const isLoading = isLicit ? licitacoesQuery.isLoading : contratosQuery.isLoading;
  const total = rows?.[0]?.total_count ? Number(rows[0].total_count) : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/empresas" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition" title="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{empresa?.nome ?? "Carregando..."}</h1>
          {empresa?.cnpj && <p className="text-xs text-muted-foreground font-mono">{empresa.cnpj}</p>}
        </div>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Vitórias</div>
            <div className="mt-1 font-display text-2xl font-bold">{resumo.vitorias ?? 0}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Valor total vencido</div>
            <div className="mt-1 font-display text-xl font-bold">{fmtMoney(resumo.valor_total_vencido)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Contratos</div>
            <div className="mt-1 font-display text-2xl font-bold">{resumo.contratos ?? 0}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Ticket médio</div>
            <div className="mt-1 font-display text-xl font-bold">{fmtMoney(resumo.ticket_medio)}</div>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="vitorias" className="gap-2"><Trophy className="h-4 w-4" /> Licitações</TabsTrigger>
          <TabsTrigger value="contratos" className="gap-2"><FileText className="h-4 w-4" /> Contratos</TabsTrigger>
        </TabsList>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar por objeto, órgão..."
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {isLicit ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyVencidas} onChange={(e) => { setOnlyVencidas(e.target.checked); setPage(0); }} />
              Apenas vencidas pelo cliente
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyProprios} onChange={(e) => { setOnlyProprios(e.target.checked); setPage(0); }} />
              Apenas contratos do cliente
            </label>
          )}
        </div>

        <TabsContent value="vitorias" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !rows?.length ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">Nenhuma licitação encontrada.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Objeto</th>
                    <th className="px-3 py-2">Órgão</th>
                    <th className="px-3 py-2">UF</th>
                    <th className="px-3 py-2 text-right">Valor estimado</th>
                    <th className="px-3 py-2 text-right">Valor vencido</th>
                    <th className="px-3 py-2">Publicação</th>
                    <th className="px-3 py-2">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-3 py-2 max-w-md"><div className="line-clamp-2">{r.objeto}</div></td>
                      <td className="px-3 py-2 max-w-xs"><div className="line-clamp-1 text-muted-foreground">{r.orgao}</div></td>
                      <td className="px-3 py-2">{r.uf ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(r.valor_estimado)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-600">{fmtMoney(r.valor_vencido)}</td>
                      <td className="px-3 py-2">{fmtDate(r.data_publicacao)}</td>
                      <td className="px-3 py-2"><MatchBadge source={r.match_source} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="contratos" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !rows?.length ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">Nenhum contrato encontrado.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Nº</th>
                    <th className="px-3 py-2">Objeto</th>
                    <th className="px-3 py-2">Órgão</th>
                    <th className="px-3 py-2">Fornecedor</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Assinatura</th>
                    <th className="px-3 py-2">Vigência</th>
                    <th className="px-3 py-2">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.numero_contrato ?? "—"}</td>
                      <td className="px-3 py-2 max-w-md"><div className="line-clamp-2">{r.objeto}</div></td>
                      <td className="px-3 py-2 max-w-xs"><div className="line-clamp-1 text-muted-foreground">{r.orgao_nome}</div></td>
                      <td className="px-3 py-2 max-w-xs"><div className="line-clamp-1">{r.fornecedor_nome}</div></td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtMoney(r.valor_final ?? r.valor_inicial)}</td>
                      <td className="px-3 py-2">{fmtDate(r.data_assinatura)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(r.data_vigencia_inicio)} → {fmtDate(r.data_vigencia_fim)}</td>
                      <td className="px-3 py-2"><MatchBadge source={r.match_source} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{total.toLocaleString("pt-BR")} resultado(s) — página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50 hover:bg-muted">Anterior</button>
              <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50 hover:bg-muted">Próxima</button>
            </div>
          </div>
        )}
      </Tabs>
    </div>
  );
}

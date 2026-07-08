import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

type Metrics = {
  totalLicitacoes: number | null;
  porFonte: Record<string, number>;
  ptDuplicateGroups: number;
  ptDuplicateExcess: number;
  homologadasSemVencedores: number | null;
  totalEmpenhos: number | null;
  empenhosMultiContrato: number;
};

const initial: Metrics = {
  totalLicitacoes: null,
  porFonte: {},
  ptDuplicateGroups: 0,
  ptDuplicateExcess: 0,
  homologadasSemVencedores: null,
  totalEmpenhos: null,
  empenhosMultiContrato: 0,
};

async function countExact(table: string, filter?: (q: any) => any): Promise<number> {
  let q: any = (supabase as any).from(table).select("*", { count: "estimated", head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function collectPtDuplicates() {
  // Paginate raw_json->>id for fonte=PORTAL_TRANSPARENCIA and group in JS.
  const map = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("licitacoes")
      .select("rid:raw_json->>id")
      .eq("fonte", "PORTAL_TRANSPARENCIA")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data as any[]) {
      const rid = row.rid;
      if (rid == null || rid === "") continue;
      map.set(rid, (map.get(rid) ?? 0) + 1);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  let groups = 0;
  let excess = 0;
  for (const c of map.values()) {
    if (c > 1) {
      groups += 1;
      excess += c - 1;
    }
  }
  return { groups, excess };
}

async function collectEmpenhosMultiContrato() {
  const map = new Map<string, Set<string>>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("empenhos")
      .select("numero_empenho,cnpj_orgao,contrato_id")
      .not("contrato_id", "is", null)
      .not("numero_empenho", "is", null)
      .not("cnpj_orgao", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data as any[]) {
      const key = `${row.cnpj_orgao}|${row.numero_empenho}`;
      const set = map.get(key) ?? new Set<string>();
      set.add(row.contrato_id);
      map.set(key, set);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  let multi = 0;
  for (const s of map.values()) if (s.size > 1) multi += 1;
  return multi;
}

async function getLatestHomologadasSemVencedores() {
  const { data, error } = await supabase
    .from("auditoria_ingestao")
    .select("homologadas_sem_vencedores")
    .order("executed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Number(data?.homologadas_sem_vencedores ?? 0);
}

type OrfaosBreakdown = {
  total: number;
  sem_itens: number;
  com_itens_sem_venc: number;
  por_fonte: { fonte: string; count: number }[];
  por_situacao: { situacao: string; count: number }[];
};

async function getOrfaosBreakdown(): Promise<OrfaosBreakdown | null> {
  const { data, error } = await (supabase as any).rpc("diagnostico_orfaos_homologadas");
  if (error) throw error;
  return (data as OrfaosBreakdown) ?? null;
}

function fmt(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

export default function DiagnosticoDadosPage() {
  const { role, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>(initial);
  const [orfaos, setOrfaos] = useState<OrfaosBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    const tasks = {
      total: countExact("licitacoes"),
      pncp: countExact("licitacoes", (q) => q.eq("fonte", "PNCP")),
      pt: countExact("licitacoes", (q) => q.eq("fonte", "PORTAL_TRANSPARENCIA")),
      pncpDA: countExact("licitacoes", (q) => q.eq("fonte", "PNCP_DADOS_ABERTOS")),
      homolog: getLatestHomologadasSemVencedores(),
      empenhosTotal: countExact("empenhos"),
      ptDup: collectPtDuplicates(),
      empMulti: collectEmpenhosMultiContrato(),
      orfaosBreak: getOrfaosBreakdown(),
    };

    const keys = Object.keys(tasks) as (keyof typeof tasks)[];
    const results = await Promise.allSettled(Object.values(tasks));
    const out: Record<string, any> = {};
    const errs: string[] = [];
    results.forEach((r, i) => {
      const k = keys[i];
      if (r.status === "fulfilled") {
        out[k] = r.value;
      } else {
        out[k] = null;
        const msg = (r.reason as any)?.message ?? String(r.reason);
        errs.push(`${k}: ${msg}`);
        console.error(`[diagnostico] ${k} falhou:`, r.reason);
      }
    });

    setMetrics({
      totalLicitacoes: out.total ?? null,
      porFonte: {
        PNCP: out.pncp ?? null,
        PORTAL_TRANSPARENCIA: out.pt ?? null,
        PNCP_DADOS_ABERTOS: out.pncpDA ?? null,
      },
      ptDuplicateGroups: out.ptDup?.groups ?? 0,
      ptDuplicateExcess: out.ptDup?.excess ?? 0,
      homologadasSemVencedores: out.homolog ?? null,
      totalEmpenhos: out.empenhosTotal ?? null,
      empenhosMultiContrato: out.empMulti ?? 0,
    });
    setOrfaos(out.orfaosBreak ?? null);
    setRanAt(new Date());
    setError(errs.length ? errs.join(" • ") : null);
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && role === "admin_central") run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, role]);

  if (authLoading) return null;
  if (role !== "admin_central") return <Navigate to="/dashboard" replace />;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Diagnóstico de Dados</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot somente-leitura. Nenhum dado é alterado. Totais por fonte são estimados (planner) para evitar timeout em tabelas grandes.
            {ranAt && <> Última execução: {ranAt.toLocaleString("pt-BR")}.</>}
          </p>
        </div>
        <Button onClick={run} disabled={loading} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Recarregar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Licitações por fonte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between border-b pb-2 mb-2">
              <span className="font-medium">Total</span>
              <span className="font-mono">{fmt(metrics.totalLicitacoes)}</span>
            </div>
            <div className="flex justify-between">
              <span>PNCP</span>
              <span className="font-mono">{fmt(metrics.porFonte.PNCP ?? null)}</span>
            </div>
            <div className="flex justify-between">
              <span>PORTAL_TRANSPARENCIA</span>
              <span className="font-mono">{fmt(metrics.porFonte.PORTAL_TRANSPARENCIA ?? null)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>PNCP_DADOS_ABERTOS</span>
              <span className="font-mono">{fmt(metrics.porFonte.PNCP_DADOS_ABERTOS ?? null)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Duplicatas PORTAL_TRANSPARENCIA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Grupos duplicados (mesmo raw_json.id)</span>
              <span className="font-mono">{fmt(metrics.ptDuplicateGroups)}</span>
            </div>
            <div className="flex justify-between">
              <span>Linhas excedentes</span>
              <span className="font-mono">{fmt(metrics.ptDuplicateExcess)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Grupos = ids repetidos. Excedentes = total de linhas — 1 por grupo (o que seria removido para desduplicar).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Homologadas sem vencedores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Licitações com valor_homologado &gt; 0 e nenhum vencedor</span>
              <span className="font-mono">{fmt(metrics.homologadasSemVencedores)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Fonte: última auditoria de ingestão registrada no banco.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Empenhos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between border-b pb-2 mb-2">
              <span className="font-medium">Total</span>
              <span className="font-mono">{fmt(metrics.totalEmpenhos)}</span>
            </div>
            <div className="flex justify-between">
              <span>Vinculados a &gt; 1 contrato (mesmo nº + CNPJ órgão)</span>
              <span className="font-mono">{fmt(metrics.empenhosMultiContrato)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            5. Composição das homologadas sem vencedor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <p className="text-xs text-muted-foreground">
            Universo: <span className="font-mono">valor_homologado &gt; 0</span> e nenhum vencedor em <span className="font-mono">licitacao_vencedores</span> (via <span className="font-mono">licitacao_itens</span>). Apenas leitura.
          </p>

          <div className="flex flex-wrap gap-6 border-y py-3">
            <div>
              <div className="text-xs text-muted-foreground">Total órfãs</div>
              <div className="font-mono text-lg">{fmt(orfaos?.total ?? null)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Sem nenhum item cadastrado</div>
              <div className="font-mono text-lg">{fmt(orfaos?.sem_itens ?? null)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Com itens, porém sem vencedor</div>
              <div className="font-mono text-lg">{fmt(orfaos?.com_itens_sem_venc ?? null)}</div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="font-medium mb-2">Quebra por fonte</h4>
              <div className="space-y-1">
                {(orfaos?.por_fonte ?? []).map((r) => (
                  <div key={r.fonte} className="flex justify-between border-b py-1">
                    <span>{r.fonte}</span>
                    <span className="font-mono">{fmt(r.count)}</span>
                  </div>
                ))}
                {!orfaos && <div className="text-xs text-muted-foreground">—</div>}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Quebra por situação</h4>
              <div className="space-y-1">
                {(orfaos?.por_situacao ?? []).map((r) => (
                  <div key={r.situacao} className="flex justify-between border-b py-1">
                    <span>{r.situacao}</span>
                    <span className="font-mono">{fmt(r.count)}</span>
                  </div>
                ))}
                {!orfaos && <div className="text-xs text-muted-foreground">—</div>}
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Situações como <em>Revogada</em>, <em>Anulada</em>, <em>Deserta</em> e <em>Fracassada</em> naturalmente podem não ter vencedor. <em>Divulgada no PNCP</em>/<em>Homologada</em> deveriam ter e indicam encadeamento incompleto.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
  let q: any = (supabase as any).from(table).select("*", { count: "exact", head: true });
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

function fmt(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

export default function DiagnosticoDadosPage() {
  const { role, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const [
        total,
        pncp,
        pt,
        pncpDA,
        homolog,
        empenhosTotal,
        ptDup,
        empMulti,
      ] = await Promise.all([
        countExact("licitacoes"),
        countExact("licitacoes", (q) => q.eq("fonte", "PNCP")),
        countExact("licitacoes", (q) => q.eq("fonte", "PORTAL_TRANSPARENCIA")),
        countExact("licitacoes", (q) => q.eq("fonte", "PNCP_DADOS_ABERTOS")),
        supabase.rpc("licitacoes_pendentes_winners_count").then(({ data, error }) => {
          if (error) throw error;
          return Number(data ?? 0);
        }),
        countExact("empenhos"),
        collectPtDuplicates(),
        collectEmpenhosMultiContrato(),
      ]);

      setMetrics({
        totalLicitacoes: total,
        porFonte: {
          PNCP: pncp,
          PORTAL_TRANSPARENCIA: pt,
          PNCP_DADOS_ABERTOS: pncpDA,
        },
        ptDuplicateGroups: ptDup.groups,
        ptDuplicateExcess: ptDup.excess,
        homologadasSemVencedores: homolog,
        totalEmpenhos: empenhosTotal,
        empenhosMultiContrato: empMulti,
      });
      setRanAt(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Erro ao consultar métricas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && role === "admin_central") run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, role]);

  if (authLoading) return null;
  if (role !== "admin_central") return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Diagnóstico de Dados</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot somente-leitura. Nenhum dado é alterado.
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
              Fonte: RPC <code>licitacoes_pendentes_winners_count</code>.
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
    </div>
  );
}

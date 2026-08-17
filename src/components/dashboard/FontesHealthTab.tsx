import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { EndpointMetricsCard } from "./EndpointMetricsCard";

interface FonteHealth {
  fonte: string;
  ultima_execucao: string | null;
  ultimo_sucesso: string | null;
  horas_desde_sucesso: number | null;
  execucoes_24h: number;
  erros_24h: number;
  registros_24h: number;
  severidade: "ok" | "atencao" | "critico";
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const SEV = {
  ok: { label: "Saudável", icon: CheckCircle2, cls: "bg-success/10 text-success border-success/30" },
  atencao: { label: "Atenção", icon: AlertTriangle, cls: "bg-warning/10 text-warning border-warning/30" },
  critico: { label: "Crítico", icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/30" },
} as const;

const CIRCUIT_LABELS: Record<string, string> = {
  contratos: "Contratos",
  contratos_itens: "Itens de contrato",
  atas: "Atas de registro de preço",
  compras: "Compras / editais",
  compras_itens: "Itens da compra",
  compras_resultados: "Resultados da compra",
  contratacoes: "Contratações (consulta)",
  instrumentos_cobranca: "Instrumentos de cobrança",
  pca: "Plano de contratações (PCA)",
  outros: "Outros endpoints",
};

function CircuitCard() {
  const { data } = useQuery({
    queryKey: ["pncp-circuit"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pncp_circuit_status");
      if (error) throw error;
      return (data || []) as {
        source: string; state: string; failures: number; trips: number;
        open_until: string | null; last_reason: string | null;
      }[];
    },
    refetchInterval: 30000,
  });

  if (!data?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Circuit breaker do PNCP (por endpoint)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((c) => (
          <div key={c.source} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{CIRCUIT_LABELS[c.source] ?? c.source}</span>

            <Badge
              variant="outline"
              className={
                c.state === "open"
                  ? SEV.critico.cls
                  : c.state === "half_open"
                  ? SEV.atencao.cls
                  : SEV.ok.cls
              }
            >
              {c.state === "open" ? "Pausado" : c.state === "half_open" ? "Sondando" : "Ativo"}
            </Badge>
            <span className="text-muted-foreground">
              falhas: {c.failures} · pausas seguidas: {c.trips}
              {c.state === "open" && c.open_until ? ` · retoma ${fmt(c.open_until)}` : ""}
              {c.last_reason ? ` · ${c.last_reason}` : ""}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AlertasCard() {
  const { data } = useQuery({
    queryKey: ["ingestao-alertas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ingestao_alertas")
        .select("id, tipo, severidade, titulo, created_at")
        .is("resolvido_em", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as {
        id: string; tipo: string; severidade: string; titulo: string; created_at: string;
      }[];
    },
    refetchInterval: 60000,
  });

  if (!data?.length) return null;

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Alertas de ingestão em aberto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className={a.severidade === "critico" ? SEV.critico.cls : SEV.atencao.cls}>
              {a.tipo}
            </Badge>
            <span className="font-medium">{a.titulo}</span>
            <span className="text-muted-foreground">· {fmt(a.created_at)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function FontesHealthTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["fontes-health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fontes_health");
      if (error) throw error;
      return (data || []) as FonteHealth[];
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const rows = data || [];
  const problemas = rows.filter((r) => r.severidade !== "ok");

  return (
    <div className="space-y-4">
      <AlertasCard />
      <CircuitCard />
      <EndpointMetricsCard />

      {problemas.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <strong>{problemas.length}</strong> fonte{problemas.length > 1 ? "s" : ""} precisa
          {problemas.length > 1 ? "m" : ""} de atenção: {problemas.map((p) => p.fonte).join(", ")}.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const sev = SEV[r.severidade] ?? SEV.ok;
          const Icon = sev.icon;
          return (
            <Card key={r.fonte}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold">{r.fonte}</CardTitle>
                <Badge variant="outline" className={`gap-1 ${sev.cls}`}>
                  <Icon className="h-3 w-3" /> {sev.label}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Último sucesso</span>
                  <span className="font-medium text-foreground">
                    {fmt(r.ultimo_sucesso)}
                    {r.horas_desde_sucesso != null && ` (${r.horas_desde_sucesso}h)`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Execuções 24h</span>
                  <span className="font-medium text-foreground">{r.execucoes_24h.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Erros 24h</span>
                  <span className={`font-medium ${r.erros_24h > 0 ? "text-destructive" : "text-foreground"}`}>
                    {r.erros_24h.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Registros 24h</span>
                  <span className="font-medium text-foreground">{r.registros_24h.toLocaleString("pt-BR")}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rows.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma execução registrada nos últimos 7 dias.
        </p>
      )}
    </div>
  );
}

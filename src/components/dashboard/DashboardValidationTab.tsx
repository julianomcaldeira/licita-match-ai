import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2, ShieldCheck,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Summary = {
  run_id: string;
  executed_at: string;
  total: number;
  ok_count: number;
  divergent_count: number;
  error_count: number;
  divergences: Array<{
    periodo: string; metric: string;
    expected: number | null; actual: number | null;
    diff: number | null; detail: string | null;
  }>;
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);

export function DashboardValidationTab() {
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-validation-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dashboard_validation_summary");
      if (error) throw error;
      return (data?.[0] || null) as Summary | null;
    },
    refetchInterval: 60_000,
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("validate_dashboard_metrics");
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Validação executada", description: "Resultados atualizados." });
      qc.invalidateQueries({ queryKey: ["dashboard-validation-summary"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  const status =
    !data ? "empty" :
    data.error_count > 0 ? "error" :
    data.divergent_count > 0 ? "divergent" : "ok";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            status === "ok" ? "bg-success/10" : status === "divergent" ? "bg-warning/10" :
            status === "error" ? "bg-destructive/10" : "bg-muted"
          }`}>
            {status === "ok" && <CheckCircle2 className="h-5 w-5 text-success" />}
            {status === "divergent" && <AlertTriangle className="h-5 w-5 text-warning" />}
            {status === "error" && <XCircle className="h-5 w-5 text-destructive" />}
            {status === "empty" && <ShieldCheck className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-foreground">
              Validação Automática do Dashboard
            </h3>
            <p className="text-xs text-muted-foreground">
              {data
                ? `Última execução: ${new Date(data.executed_at).toLocaleString("pt-BR")} · ${data.ok_count}/${data.total} checks OK`
                : "Nenhuma execução registrada ainda"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            {runNow.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
            Rodar agora
          </Button>
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Total de checks" value={data.total} color="text-foreground" />
          <Stat label="OK" value={data.ok_count} color="text-success" />
          <Stat label="Divergentes" value={data.divergent_count} color="text-warning" />
          <Stat label="Erros" value={data.error_count} color="text-destructive" />
        </div>
      )}

      {/* Divergences */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h4 className="font-display text-sm font-semibold text-foreground mb-3">
          Divergências encontradas
        </h4>
        {!data || data.divergences.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Nenhuma divergência. Dashboard 100% consistente com o banco.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Período</th>
                  <th className="py-2 pr-3">Métrica</th>
                  <th className="py-2 pr-3 text-right">Esperado</th>
                  <th className="py-2 pr-3 text-right">RPC</th>
                  <th className="py-2 pr-3 text-right">Diferença</th>
                  <th className="py-2 pr-3">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {data.divergences.map((d, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono text-xs">{d.periodo}</td>
                    <td className="py-2 pr-3">{d.metric}</td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">{fmt(d.expected)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">{fmt(d.actual)}</td>
                    <td className={`py-2 pr-3 text-right font-mono text-xs ${
                      (d.diff ?? 0) > 0 ? "text-warning" : "text-destructive"
                    }`}>
                      {d.diff != null ? (d.diff > 0 ? "+" : "") + fmt(d.diff) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{d.detail || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Roda automaticamente todos os dias às 04h30 (após a ingestão diária).
        Compara cards e gráficos do dashboard com queries diretas no banco em 5 períodos
        (mês, trimestre, ano vigente, ano anterior, todo o período) cobrindo 7 métricas.
      </p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

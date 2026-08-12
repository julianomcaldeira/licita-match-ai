import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Loader2 } from "lucide-react";

interface EndpointRow {
  endpoint: string;
  function_name: string;
  requests: number;
  errors: number;
  aborts: number;
  retries: number;
  http_429: number;
  http_4xx: number;
  http_5xx: number;
  error_rate: number | null;
  avg_latency_ms: number | null;
  max_latency_ms: number | null;
  last_error: string | null;
  last_seen: string | null;
}

const WINDOWS = [
  { label: "15 min", value: 15 },
  { label: "1 h", value: 60 },
  { label: "6 h", value: 360 },
  { label: "24 h", value: 1440 },
];

function n(v: number | null | undefined) {
  return (v ?? 0).toLocaleString("pt-BR");
}

function rateCls(rate: number) {
  if (rate >= 25) return "bg-destructive/10 text-destructive border-destructive/30";
  if (rate >= 5) return "bg-warning/10 text-warning border-warning/30";
  return "bg-success/10 text-success border-success/30";
}

export function EndpointMetricsCard() {
  const [minutes, setMinutes] = useState(60);

  const { data, isLoading } = useQuery({
    queryKey: ["pncp-endpoint-metrics", minutes],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pncp_endpoint_metrics_summary", {
        p_minutes: minutes,
      });
      if (error) throw error;
      return (data || []) as EndpointRow[];
    },
    refetchInterval: 15000,
  });

  const rows = data || [];
  const totalReq = rows.reduce((s, r) => s + Number(r.requests || 0), 0);
  const totalErr = rows.reduce((s, r) => s + Number(r.errors || 0), 0);
  const globalRate = totalReq ? (100 * totalErr) / totalReq : 0;

  // gargalo real: endpoint com maior peso de latência x erro
  const gargalo = [...rows].sort(
    (a, b) =>
      Number(b.avg_latency_ms ?? 0) * Number(b.requests) -
      Number(a.avg_latency_ms ?? 0) * Number(a.requests),
  )[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4" /> Métricas por endpoint do PNCP
        </CardTitle>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <Button
              key={w.value}
              size="sm"
              variant={minutes === w.value ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setMinutes(w.value)}
            >
              {w.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma chamada registrada nesta janela.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={rateCls(globalRate)}>
                {globalRate.toFixed(1)}% de erro
              </Badge>
              <span>{n(totalReq)} chamadas · {n(totalErr)} falhas</span>
              {gargalo && (
                <span>
                  · gargalo atual:{" "}
                  <span className="font-medium text-foreground">{gargalo.endpoint}</span>
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">Endpoint</th>
                    <th className="py-2 text-right font-medium">Chamadas</th>
                    <th className="py-2 text-right font-medium">Erro</th>
                    <th className="py-2 text-right font-medium">Lat. média</th>
                    <th className="py-2 text-right font-medium">Lat. máx</th>
                    <th className="py-2 text-right font-medium">Aborts</th>
                    <th className="py-2 text-right font-medium">Retries</th>
                    <th className="py-2 text-right font-medium">429/5xx</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.function_name}-${r.endpoint}`} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-foreground">{r.endpoint}</div>
                        <div className="text-muted-foreground">{r.function_name}</div>
                        {r.last_error && (
                          <div className="truncate text-destructive" title={r.last_error}>
                            {r.last_error}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right">{n(r.requests)}</td>
                      <td className="py-2 text-right">
                        <Badge variant="outline" className={rateCls(Number(r.error_rate ?? 0))}>
                          {Number(r.error_rate ?? 0).toFixed(1)}%
                        </Badge>
                      </td>
                      <td className="py-2 text-right">{n(r.avg_latency_ms)} ms</td>
                      <td className="py-2 text-right">{n(r.max_latency_ms)} ms</td>
                      <td className="py-2 text-right">{n(r.aborts)}</td>
                      <td className="py-2 text-right">{n(r.retries)}</td>
                      <td className="py-2 text-right">
                        {n(r.http_429)} / {n(r.http_5xx)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

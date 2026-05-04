import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  cnpj: string | null | undefined;
  nome?: string;
  uf?: string | null;
  showRefresh?: boolean;
  size?: "sm" | "md";
}

const colorByClass: Record<string, string> = {
  AAA: "bg-emerald-500 text-white",
  AA: "bg-emerald-500 text-white",
  A: "bg-green-500 text-white",
  BBB: "bg-lime-500 text-white",
  BB: "bg-yellow-500 text-white",
  B: "bg-yellow-500 text-white",
  CCC: "bg-orange-500 text-white",
  CC: "bg-orange-600 text-white",
  C: "bg-red-500 text-white",
  D: "bg-red-600 text-white",
  SD: "bg-muted text-muted-foreground",
};

export function OrgaoScoreBadge({ cnpj, nome, uf, showRefresh, size = "sm" }: Props) {
  const cnpjNorm = (cnpj || "").replace(/\D/g, "");
  const enabled = cnpjNorm.length === 14;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orgao-score", cnpjNorm],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_orgao_score", { p_cnpj: cnpjNorm });
      if (error) throw error;
      return (data?.[0] || null) as any;
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  const calc = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-orgao-score", {
        body: { cnpj: cnpjNorm, nome, uf },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Score atualizado", description: "Métricas recalculadas com dados frescos." });
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!enabled) return <span className="text-xs text-muted-foreground">—</span>;
  if (isLoading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;

  // Sem score calculado ainda
  if (!data) {
    return showRefresh ? (
      <Button
        size="sm" variant="outline"
        onClick={() => calc.mutate()} disabled={calc.isPending}
        className="h-7 text-xs"
      >
        {calc.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
        Calcular score
      </Button>
    ) : (
      <Badge variant="secondary" className="text-xs opacity-60">SD</Badge>
    );
  }

  const cls = colorByClass[data.score_classificacao] || colorByClass.SD;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`${cls} ${size === "md" ? "text-sm px-3 py-1" : "text-xs"} font-bold`}>
              {data.score_classificacao}
              {data.score_classificacao !== "SD" && (
                <span className="ml-1.5 opacity-90 font-mono">{data.score_numerico}</span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1.5 text-xs">
              <div className="font-semibold text-sm">Score do Órgão: {data.score_numerico}/1000</div>
              <div className="border-t pt-1.5 space-y-0.5">
                <div className="flex justify-between gap-4">
                  <span>💰 Pagamento (50%)</span><span className="font-mono">{data.score_pagamento}/500</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>📊 Saúde fiscal (30%)</span><span className="font-mono">{data.score_fiscal}/300</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>📋 Execução (20%)</span><span className="font-mono">{data.score_execucao}/200</span>
                </div>
              </div>
              {data.pct_pago_sobre_empenhado > 0 && (
                <div className="border-t pt-1.5 text-muted-foreground">
                  {data.pct_pago_sobre_empenhado.toFixed(1)}% pago do empenhado
                </div>
              )}
              {data.pct_divida_rcl > 0 && (
                <div className="text-muted-foreground">
                  Dívida/RCL: {data.pct_divida_rcl.toFixed(1)}%
                </div>
              )}
              <div className="text-muted-foreground text-[10px] pt-1">
                Fontes: {(data.fontes_utilizadas || []).join(", ") || "—"}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
        {showRefresh && (
          <Button size="icon" variant="ghost" className="h-6 w-6"
            onClick={() => calc.mutate()} disabled={calc.isPending}>
            {calc.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}

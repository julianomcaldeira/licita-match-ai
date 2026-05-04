import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, HelpCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cnpj: string | null;
};

const fmtMoney = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toFixed(1)}%`;
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR") : "—";

function trustOf(score: number, classif: string) {
  if (classif === "SD") return { label: "Sem dados", color: "bg-muted text-muted-foreground", Icon: HelpCircle };
  if (score >= 700) return { label: "Confiável", color: "bg-emerald-500 text-white", Icon: ShieldCheck };
  if (score >= 500) return { label: "Atenção", color: "bg-yellow-500 text-white", Icon: ShieldAlert };
  return { label: "Não confiável", color: "bg-red-500 text-white", Icon: ShieldX };
}

export function ScoreAuditDialog({ open, onOpenChange, cnpj }: Props) {
  const { data: row, isLoading } = useQuery({
    queryKey: ["orgao-score-detail", cnpj],
    enabled: !!cnpj && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_score")
        .select("*")
        .eq("cnpj_orgao", cnpj!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const fontes: string[] = row?.fontes_utilizadas || [];
  const temPortal = fontes.some((f) => f.startsWith("portal_transparencia"));
  const portalTipo = fontes.find((f) => f.startsWith("portal_transparencia"))?.split(":")[1] || null;
  const temSiconfi = fontes.includes("siconfi");
  const temInternos = fontes.includes("contratos_internos");

  const score = row?.score_numerico ?? 0;
  const classif = row?.score_classificacao ?? "SD";
  const trust = trustOf(score, classif);

  const sPag = row?.score_pagamento ?? 0;
  const sFis = row?.score_fiscal ?? 0;
  const sExe = row?.score_execucao ?? 0;
  const pesoMax = (temPortal ? 500 : 0) + (temSiconfi ? 300 : 0) + (temInternos ? 200 : 0);
  const somaBruta = sPag + sFis + sExe;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Auditoria do Score
          </DialogTitle>
          <DialogDescription>
            Breakdown completo do cálculo por fonte e critério.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !row ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Cabeçalho do órgão */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">{row.nome_orgao}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    CNPJ {row.cnpj_orgao} · {row.uf || "—"} · ano-base {row.ano_referencia}
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={`${trust.color} font-bold gap-1`}>
                    <trust.Icon className="h-3.5 w-3.5" /> {trust.label}
                  </Badge>
                  <div className="font-mono text-2xl font-bold mt-1">{score}<span className="text-sm text-muted-foreground"> /1000</span></div>
                  <div className="text-xs text-muted-foreground">classe {classif}</div>
                </div>
              </div>
            </div>

            {/* Regra de classificação */}
            <div>
              <div className="text-sm font-semibold mb-2">Regra de classificação</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="border rounded p-2">
                  <div className="flex items-center gap-1 font-semibold text-emerald-700"><ShieldCheck className="h-3 w-3"/>Confiável</div>
                  <div className="text-muted-foreground">score ≥ 700</div>
                </div>
                <div className="border rounded p-2">
                  <div className="flex items-center gap-1 font-semibold text-yellow-700"><ShieldAlert className="h-3 w-3"/>Atenção</div>
                  <div className="text-muted-foreground">500 ≤ score &lt; 700</div>
                </div>
                <div className="border rounded p-2">
                  <div className="flex items-center gap-1 font-semibold text-red-700"><ShieldX className="h-3 w-3"/>Não confiável</div>
                  <div className="text-muted-foreground">score &lt; 500</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                "SD" = Sem dados nas fontes públicas e contratos insuficientes (&lt;3) na plataforma.
              </p>
            </div>

            {/* Fórmula final */}
            <div className="border rounded-lg p-4">
              <div className="text-sm font-semibold mb-2">Fórmula do score final</div>
              <div className="font-mono text-xs bg-muted rounded p-2 overflow-x-auto">
                score = round( (S<sub>pag</sub> + S<sub>fiscal</sub> + S<sub>exec</sub>) / pesoMax × 1000 )
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                <div>Soma bruta = {sPag} + {sFis} + {sExe} = <strong className="text-foreground">{somaBruta}</strong></div>
                <div>pesoMax (somente fontes disponíveis) = <strong className="text-foreground">{pesoMax}</strong></div>
                <div>Score normalizado = round({somaBruta}/{pesoMax || 1} × 1000) = <strong className="text-foreground">{score}</strong></div>
              </div>
            </div>

            {/* Breakdown por fonte */}
            <div className="space-y-3">
              <div className="text-sm font-semibold">Breakdown por critério</div>

              {/* Portal */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Pagamento (Portal da Transparência)</span>
                    {temPortal ? (
                      <Badge variant="secondary" className="text-[10px]">id usado: {portalTipo}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">sem dados</Badge>
                    )}
                  </div>
                  <span className="font-mono text-sm">{sPag} / 500</span>
                </div>
                <Progress value={(sPag / 500) * 100} className="h-2" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div>Empenhado: <span className="text-foreground">{fmtMoney(row.total_empenhado)}</span></div>
                  <div>Liquidado: <span className="text-foreground">{fmtMoney(row.total_liquidado)}</span></div>
                  <div>Pago: <span className="text-foreground">{fmtMoney(row.total_pago)}</span></div>
                  <div>% pago/empenh.: <span className="text-foreground">{fmtPct(row.pct_pago_sobre_empenhado)}</span></div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Cálculo: <code>min(500, round(% pago × 5))</code> · peso 50% do score
                </div>
              </div>

              {/* SICONFI */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Saúde fiscal (SICONFI/Tesouro)</span>
                    {!temSiconfi && <Badge variant="outline" className="text-[10px]">sem dados</Badge>}
                  </div>
                  <span className="font-mono text-sm">{sFis} / 300</span>
                </div>
                <Progress value={(sFis / 300) * 100} className="h-2" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>RCL: <span className="text-foreground">{fmtMoney(row.receita_corrente_liquida)}</span></div>
                  <div>Dívida consolidada: <span className="text-foreground">{fmtMoney(row.divida_consolidada_liquida)}</span></div>
                  <div>% dívida/RCL: <span className="text-foreground">{fmtPct(row.pct_divida_rcl)}</span></div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Cálculo: &lt;60% (limite LRF) → 300 · 60–120% degrade linear · ≥120% → 0 · peso 30%
                </div>
              </div>

              {/* Contratos internos */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Execução de contratos (interno)</span>
                    {!temInternos && <Badge variant="outline" className="text-[10px]">{(row.qtd_contratos_analisados ?? 0) < 3 ? "<3 contratos" : "sem dados"}</Badge>}
                  </div>
                  <span className="font-mono text-sm">{sExe} / 200</span>
                </div>
                <Progress value={(sExe / 200) * 100} className="h-2" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>Contratos analisados: <span className="text-foreground">{row.qtd_contratos_analisados ?? 0}</span></div>
                  <div>% em dia: <span className="text-foreground">{fmtPct(row.pct_contratos_em_dia)}</span></div>
                  <div>Atraso médio: <span className="text-foreground">{Number(row.atraso_medio_dias ?? 0).toFixed(0)} dias</span></div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Cálculo: <code>round(% em dia × 2)</code> · peso 20%
                </div>
              </div>
            </div>

            {/* Metadados */}
            <div className="border rounded-lg p-3 bg-muted/30 text-xs space-y-1">
              <div><strong>Fontes utilizadas:</strong> {fontes.length ? fontes.join(", ") : "nenhuma"}</div>
              <div><strong>Calculado em:</strong> {fmtDate(row.calculado_em)}</div>
              {row.observacoes && <div><strong>Obs:</strong> {row.observacoes}</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

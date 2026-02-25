import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Star, Loader2, Brain, Search, Filter, X, ExternalLink, AlertTriangle, CheckCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function ScoreBadge({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const color = score >= 80 ? "text-success bg-success/10 border-success/20" : score >= 50 ? "text-warning bg-warning/10 border-warning/20" : "text-destructive bg-destructive/10 border-destructive/20";
  const cls = size === "lg" ? "px-4 py-2 text-lg font-bold" : "px-2.5 py-0.5 text-xs font-bold";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${color} ${cls}`}>
      <Star className={size === "lg" ? "h-5 w-5" : "h-3 w-3"} />
      {score}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return null;
  const config: Record<string, string> = {
    baixo: "bg-success/10 text-success border-success/20",
    medio: "bg-warning/10 text-warning border-warning/20",
    alto: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return <Badge variant="outline" className={`capitalize ${config[risk] || ""}`}>{risk}</Badge>;
}

function DetailModal({ op, open, onClose }: { op: any; open: boolean; onClose: () => void }) {
  if (!op) return null;
  const lic = op.licitacoes;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ScoreBadge score={op.score_aderencia} size="lg" />
            <div>
              <DialogTitle className="text-base font-semibold leading-tight">{lic?.objeto || "—"}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{lic?.orgao || "—"}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Tipo de Oportunidade</p>
            <p className="text-sm font-medium capitalize">{op.tipo_oportunidade || "—"}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Nível de Risco</p>
            <div className="mt-0.5"><RiskBadge risk={op.nivel_risco} /></div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Valor Estimado</p>
            <p className="text-sm font-medium">
              {lic?.valor_estimado
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(lic.valor_estimado)
                : "Não informado"}
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Modalidade</p>
            <p className="text-sm font-medium capitalize">{lic?.modalidade || "Não informada"}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">UF</p>
            <p className="text-sm font-medium">{lic?.uf || "—"}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Situação</p>
            <p className="text-sm font-medium capitalize">{lic?.situacao || "—"}</p>
          </div>
        </div>

        {op.motivo_recomendacao && (
          <>
            <Separator className="my-4" />
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                {op.score_aderencia >= 50 ? <CheckCircle className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
                Recomendação
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{op.motivo_recomendacao}</p>
            </div>
          </>
        )}

        {op.justificativa_tecnica && (
          <>
            <Separator className="my-4" />
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Justificativa Técnica</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{op.justificativa_tecnica}</p>
            </div>
          </>
        )}

        {op.empresas_clientes?.nome && (
          <>
            <Separator className="my-4" />
            <p className="text-xs text-muted-foreground">Empresa: <span className="font-medium text-foreground">{op.empresas_clientes.nome}</span></p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function OportunidadesPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const [selectedOp, setSelectedOp] = useState<any>(null);
  const isAdmin = role === "admin_central";

  const { data: empresas } = useQuery({
    queryKey: ["empresas-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas_clientes").select("id, nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: previewData, isLoading: previewLoading, refetch: refetchPreview } = useQuery({
    queryKey: ["keyword-preview", selectedEmpresa],
    queryFn: async () => {
      if (!selectedEmpresa) return null;
      const { data, error } = await supabase.rpc("match_licitacoes_por_keywords", {
        p_empresa_id: selectedEmpresa,
        p_limit: 50,
      });
      if (error) throw error;
      return data;
    },
    enabled: false,
  });

  const { data: oportunidades, isLoading } = useQuery({
    queryKey: ["oportunidades", selectedEmpresa],
    queryFn: async () => {
      let query = supabase
        .from("oportunidades")
        .select("*, licitacoes(objeto, orgao, modalidade, valor_estimado, situacao, uf), empresas_clientes(nome)")
        .order("score_aderencia", { ascending: false })
        .limit(50);
      if (selectedEmpresa) query = query.eq("empresa_id", selectedEmpresa);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const matchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmpresa) throw new Error("Selecione uma empresa");
      const { data, error } = await supabase.functions.invoke("match-ia", {
        body: { empresa_id: selectedEmpresa, limit: 50 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || "Análise concluída!");
      queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
      setShowPreview(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePreview = () => {
    setShowPreview(true);
    refetchPreview();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">Pré-filtro por palavras-chave + refinamento IA</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedEmpresa}
            onChange={(e) => { setSelectedEmpresa(e.target.value); setShowPreview(false); }}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas as empresas</option>
            {empresas?.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
          {isAdmin && selectedEmpresa && (
            <>
              <button onClick={handlePreview} disabled={previewLoading}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted transition disabled:opacity-50">
                {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Pré-filtrar
              </button>
              <button onClick={() => matchMutation.mutate()} disabled={matchMutation.isPending}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50">
                {matchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                {matchMutation.isPending ? "Analisando..." : "Analisar com IA"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Keyword preview */}
      <AnimatePresence>
        {showPreview && previewData && previewData.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{previewData.length} licitações pré-filtradas por keywords</span>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Clique em "Analisar com IA" para gerar scores detalhados.</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {previewData.map((item: any) => (
                <div key={item.licitacao_id} className="flex items-center gap-2 rounded-lg bg-card p-2.5 border border-border text-sm">
                  <span className="flex-shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{item.match_count}</span>
                  <p className="flex-1 truncate text-foreground">{item.objeto}</p>
                  <div className="hidden sm:flex gap-1 flex-shrink-0">
                    {item.keywords_matched?.slice(0, 3).map((kw: string, i: number) => (
                      <span key={i} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{kw}</span>
                    ))}
                    {item.keywords_matched?.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{item.keywords_matched.length - 3}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        {showPreview && previewData?.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-xl border border-warning/20 bg-warning/5 p-4 text-center">
            <p className="text-sm text-warning font-medium">Nenhuma licitação encontrada com as palavras-chave desta empresa.</p>
            <p className="text-xs text-muted-foreground mt-1">Verifique os termos no cadastro da empresa.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : !oportunidades?.length ? (
        <div className="flex flex-col items-center py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"><Brain className="h-7 w-7 text-primary" /></div>
          <h2 className="mt-3 font-display text-base font-semibold text-foreground">Nenhuma oportunidade</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm text-center">
            {selectedEmpresa ? 'Use "Pré-filtrar" e depois "Analisar com IA".' : "Selecione uma empresa para começar."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Score</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Objeto</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Órgão</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Tipo</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Risco</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden xl:table-cell">Valor</th>
              </tr>
            </thead>
            <tbody>
              {oportunidades.map((op: any) => (
                <tr key={op.id} onClick={() => setSelectedOp(op)}
                  className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3"><ScoreBadge score={op.score_aderencia} /></td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-foreground truncate">{op.licitacoes?.objeto || "—"}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground truncate max-w-[200px]">{op.licitacoes?.orgao || "—"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell capitalize text-muted-foreground">{op.tipo_oportunidade || "—"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell"><RiskBadge risk={op.nivel_risco} /></td>
                  <td className="px-4 py-3 hidden xl:table-cell text-muted-foreground">
                    {op.licitacoes?.valor_estimado
                      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(op.licitacoes.valor_estimado)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      <DetailModal op={selectedOp} open={!!selectedOp} onClose={() => setSelectedOp(null)} />
    </div>
  );
}

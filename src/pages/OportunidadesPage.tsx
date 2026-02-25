import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Star, Loader2, Brain, Search, Filter } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-success bg-success/10" : score >= 50 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${color}`}>
      <Star className="h-3.5 w-3.5" />
      {score}
    </span>
  );
}

function KeywordBadge({ keyword }: { keyword: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {keyword}
    </span>
  );
}

export default function OportunidadesPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const isAdmin = role === "admin_central";

  const { data: empresas } = useQuery({
    queryKey: ["empresas-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas_clientes").select("id, nome");
      if (error) throw error;
      return data;
    },
  });

  // Preview: keyword pre-filter results (before AI)
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

      if (selectedEmpresa) {
        query = query.eq("empresa_id", selectedEmpresa);
      }

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">Pré-filtro por palavras-chave + refinamento por IA</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedEmpresa}
            onChange={(e) => { setSelectedEmpresa(e.target.value); setShowPreview(false); }}
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas as empresas</option>
            {empresas?.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
          {isAdmin && selectedEmpresa && (
            <>
              <button
                onClick={handlePreview}
                disabled={previewLoading}
                className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition disabled:opacity-50"
              >
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Pré-filtrar
              </button>
              <button
                onClick={() => matchMutation.mutate()}
                disabled={matchMutation.isPending}
                className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
              >
                {matchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                {matchMutation.isPending ? "Analisando..." : "Analisar com IA"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Keyword pre-filter preview */}
      {showPreview && previewData && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-primary" />
            <h3 className="font-medium text-foreground">Pré-filtro por palavras-chave: {previewData.length} licitações encontradas</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Estas licitações contêm termos do cadastro da empresa. Clique em "Analisar com IA" para gerar scores detalhados.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {previewData.map((item: any) => (
              <div key={item.licitacao_id} className="flex items-start gap-3 rounded-lg bg-card p-3 border border-border text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{item.objeto}</p>
                  <p className="text-muted-foreground text-xs">{item.orgao}</p>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  {item.keywords_matched?.map((kw: string, i: number) => (
                    <KeywordBadge key={i} keyword={kw} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {showPreview && previewData?.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-warning/20 bg-warning/5 p-4 text-center">
          <p className="text-sm text-warning font-medium">Nenhuma licitação encontrada com as palavras-chave desta empresa.</p>
          <p className="text-xs text-muted-foreground mt-1">Verifique os termos configurados no cadastro da empresa (palavras-chave e segmentos).</p>
        </motion.div>
      )}

      {/* AI-analyzed results */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !oportunidades?.length ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><Brain className="h-8 w-8 text-primary" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma oportunidade analisada</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center">
            {selectedEmpresa
              ? 'Use "Pré-filtrar" para ver licitações relevantes e depois "Analisar com IA" para gerar scores.'
              : "Selecione uma empresa para começar."}
          </p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {oportunidades.map((op: any, i: number) => (
            <motion.div
              key={op.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md cursor-pointer"
            >
              <ScoreBadge score={op.score_aderencia} />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground truncate">{op.licitacoes?.objeto || "—"}</h3>
                <p className="text-sm text-muted-foreground">{op.licitacoes?.orgao || "—"}</p>
                {op.motivo_recomendacao && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{op.motivo_recomendacao}</p>
                )}
              </div>
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">Tipo</p>
                  <p className="font-medium text-foreground capitalize">{op.tipo_oportunidade || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valor</p>
                  <p className="font-medium text-foreground">
                    {op.licitacoes?.valor_estimado
                      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(op.licitacoes.valor_estimado)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Risco</p>
                  <p className={`font-medium capitalize ${
                    op.nivel_risco === "baixo" ? "text-success" : op.nivel_risco === "medio" ? "text-warning" : "text-destructive"
                  }`}>
                    {op.nivel_risco || "—"}
                  </p>
                </div>
                {!selectedEmpresa && (
                  <div>
                    <p className="text-muted-foreground">Empresa</p>
                    <p className="font-medium text-foreground">{op.empresas_clientes?.nome || "—"}</p>
                  </div>
                )}
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

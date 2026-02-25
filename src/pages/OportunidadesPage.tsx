import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, ArrowRight, Star, Loader2, Brain } from "lucide-react";
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

export default function OportunidadesPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");
  const isAdmin = role === "admin_central";

  const { data: empresas } = useQuery({
    queryKey: ["empresas-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas_clientes").select("id, nome");
      if (error) throw error;
      return data;
    },
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
        body: { empresa_id: selectedEmpresa, limit: 20 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || "Análise concluída!");
      queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">Ranking de licitações por score de aderência (IA)</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedEmpresa}
            onChange={(e) => setSelectedEmpresa(e.target.value)}
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas as empresas</option>
            {empresas?.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
          {isAdmin && selectedEmpresa && (
            <button
              onClick={() => matchMutation.mutate()}
              disabled={matchMutation.isPending}
              className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
            >
              {matchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              {matchMutation.isPending ? "Analisando..." : "Analisar com IA"}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !oportunidades?.length ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><Brain className="h-8 w-8 text-primary" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma oportunidade analisada</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center">
            {selectedEmpresa
              ? 'Clique em "Analisar com IA" para processar licitações para esta empresa.'
              : "Selecione uma empresa e clique em 'Analisar com IA' para começar."}
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

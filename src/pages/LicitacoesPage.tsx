import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Calendar, RefreshCw, Loader2, Database } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function formatCurrency(value: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function StatusBadge({ situacao }: { situacao: string | null }) {
  if (!situacao) return <span className="text-muted-foreground text-xs">—</span>;
  const normalized = situacao.toLowerCase();
  const color = normalized.includes("homologad") || normalized.includes("conclu")
    ? "bg-success/10 text-success"
    : normalized.includes("andamento") || normalized.includes("abert")
    ? "bg-warning/10 text-warning"
    : "bg-info/10 text-info";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {situacao}
    </span>
  );
}

export default function LicitacoesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  const { data: licitacoes, isLoading } = useQuery({
    queryKey: ["licitacoes", searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("licitacoes")
        .select("*")
        .order("data_publicacao", { ascending: false })
        .limit(100);

      if (searchTerm.trim()) {
        query = query.or(`objeto.ilike.%${searchTerm}%,orgao.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ingest-pncp", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || "Ingestão concluída!");
      queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
    },
    onError: (error) => {
      toast.error(`Erro na ingestão: ${error.message}`);
    },
  });

  const totalRows = licitacoes?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Licitações</h1>
          <p className="text-sm text-muted-foreground">
            {totalRows > 0
              ? `${totalRows} registros do PNCP`
              : "Dados ingeridos do PNCP e Portal da Transparência"}
          </p>
        </div>
        <button
          onClick={() => ingestMutation.mutate()}
          disabled={ingestMutation.isPending}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
        >
          {ingestMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {ingestMutation.isPending ? "Ingerindo..." : "Ingerir PNCP"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por objeto, órgão..."
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm text-muted-foreground hover:bg-secondary">
          <Filter className="h-4 w-4" /> Filtros
        </button>
        <button className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm text-muted-foreground hover:bg-secondary">
          <Calendar className="h-4 w-4" /> Período
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : totalRows === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma licitação encontrada</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center">
            Clique em "Ingerir PNCP" para buscar dados reais de licitações do Portal Nacional de Contratações Públicas.
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Órgão</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Objeto</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modalidade</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Valor Est.</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">UF</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Situação</th>
                </tr>
              </thead>
              <tbody>
                {licitacoes?.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 transition hover:bg-secondary/30 cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs text-primary max-w-[140px] truncate">{row.id_origem}</td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{row.orgao}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-foreground">{row.objeto}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.modalidade || "—"}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{formatCurrency(row.valor_estimado)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.data_publicacao || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.uf || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge situacao={row.situacao} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}

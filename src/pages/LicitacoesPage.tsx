import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Calendar, RefreshCw, Loader2, Database, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PAGE_SIZE = 20;
const MODALIDADES = [4, 5, 6, 7, 8, 12];
const MODALIDADE_NAMES: Record<number, string> = {
  4: "Concorrência",
  5: "Pregão",
  6: "Dispensa",
  7: "Inexigibilidade",
  8: "Pregão Eletrônico",
  12: "Compra Direta",
};

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

// Generate monthly date chunks from startDate to endDate (YYYYMMDD format)
function generateMonthlyChunks(startDate: string, endDate: string) {
  const chunks: { dataInicial: string; dataFinal: string }[] = [];
  const start = new Date(
    parseInt(startDate.slice(0, 4)),
    parseInt(startDate.slice(4, 6)) - 1,
    parseInt(startDate.slice(6, 8))
  );
  const end = new Date(
    parseInt(endDate.slice(0, 4)),
    parseInt(endDate.slice(4, 6)) - 1,
    parseInt(endDate.slice(6, 8))
  );

  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    // End of month or endDate, whichever is earlier
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const chunkEnd = monthEnd > end ? end : monthEnd;

    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

    chunks.push({ dataInicial: fmt(chunkStart), dataFinal: fmt(chunkEnd) });

    // Move to first day of next month
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return chunks;
}

interface IngestProgress {
  totalProcessed: number;
  currentChunk: string;
  currentModalidade: string;
  currentPage: number;
  isRunning: boolean;
}

export default function LicitacoesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  const { data: totalCount } = useQuery({
    queryKey: ["licitacoes-count", searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("licitacoes")
        .select("*", { count: "exact", head: true });
      if (searchTerm.trim()) {
        query = query.or(`objeto.ilike.%${searchTerm}%,orgao.ilike.%${searchTerm}%`);
      }
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: licitacoes, isLoading } = useQuery({
    queryKey: ["licitacoes", searchTerm, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("licitacoes")
        .select(`
          *,
          licitacao_itens (
            id,
            licitacao_vencedores (
              razao_social
            )
          )
        `)
        .order("data_publicacao", { ascending: false })
        .range(from, to);
      if (searchTerm.trim()) {
        query = query.or(`objeto.ilike.%${searchTerm}%,orgao.ilike.%${searchTerm}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const startBulkIngestion = useCallback(async () => {
    abortRef.current = false;
    const chunks = generateMonthlyChunks("20230101", "20260224");
    let grandTotal = 0;

    setProgress({
      totalProcessed: 0,
      currentChunk: "",
      currentModalidade: "",
      currentPage: 1,
      isRunning: true,
    });

    for (const chunk of chunks) {
      if (abortRef.current) break;

      for (const modalidade of MODALIDADES) {
        if (abortRef.current) break;

        let pagina = 1;
        let hasMore = true;

        while (hasMore && !abortRef.current) {
          const chunkLabel = `${chunk.dataInicial.slice(0, 4)}-${chunk.dataInicial.slice(4, 6)}`;
          setProgress({
            totalProcessed: grandTotal,
            currentChunk: chunkLabel,
            currentModalidade: MODALIDADE_NAMES[modalidade] || String(modalidade),
            currentPage: pagina,
            isRunning: true,
          });

          try {
            const { data, error } = await supabase.functions.invoke("ingest-pncp", {
              body: {
                dataInicial: chunk.dataInicial,
                dataFinal: chunk.dataFinal,
                modalidade,
                pagina,
              },
            });

            if (error) {
              console.warn(`Error chunk ${chunkLabel} mod ${modalidade} pag ${pagina}:`, error);
              hasMore = false;
              continue;
            }

            grandTotal += data?.totalProcessed || 0;
            hasMore = data?.hasMore || false;
            pagina++;

            // Refresh table periodically
            if (grandTotal % 500 < 100) {
              queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
              queryClient.invalidateQueries({ queryKey: ["licitacoes-count"] });
            }
          } catch (err) {
            console.warn(`Exception:`, err);
            hasMore = false;
          }
        }
      }
    }

    setProgress((p) => (p ? { ...p, isRunning: false } : null));
    queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
    queryClient.invalidateQueries({ queryKey: ["licitacoes-count"] });
    toast.success(`Ingestão concluída! ${grandTotal} registros processados.`);
  }, [queryClient]);

  const cancelIngestion = () => {
    abortRef.current = true;
    toast.info("Cancelando ingestão...");
  };

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function getVencedor(row: any): string {
    const itens = row.licitacao_itens;
    if (!itens || !Array.isArray(itens)) return "—";
    for (const item of itens) {
      const vencedores = item.licitacao_vencedores;
      if (vencedores && Array.isArray(vencedores) && vencedores.length > 0) {
        return vencedores[0].razao_social || "—";
      }
    }
    return "—";
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Licitações</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("pt-BR")} registros do PNCP`
              : "Dados ingeridos do PNCP e Portal da Transparência"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {progress?.isRunning && (
            <button
              onClick={cancelIngestion}
              className="flex h-10 items-center gap-2 rounded-lg border border-destructive px-4 text-sm font-medium text-destructive hover:bg-destructive/10 transition"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          )}
          <button
            onClick={startBulkIngestion}
            disabled={progress?.isRunning}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
          >
            {progress?.isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {progress?.isRunning ? "Ingerindo..." : "Ingerir PNCP (2023–2026)"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-4 space-y-2"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              {progress.isRunning ? "Ingestão em andamento..." : "Ingestão concluída"}
            </span>
            <span className="font-mono text-primary font-bold">
              {progress.totalProcessed.toLocaleString("pt-BR")} registros
            </span>
          </div>
          {progress.isRunning && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Período: {progress.currentChunk}</span>
              <span>Modalidade: {progress.currentModalidade}</span>
              <span>Página: {progress.currentPage}</span>
            </div>
          )}
          {progress.isRunning && (
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: ["0%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
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
      ) : total === 0 ? (
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
            Clique em "Ingerir PNCP (2023–2026)" para buscar dados reais de licitações do Portal Nacional de Contratações Públicas.
          </p>
        </motion.div>
      ) : (
        <>
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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencedor</th>
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
                      <td className="px-4 py-3 text-foreground max-w-[180px] truncate">{getVencedor(row)}</td>
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

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total.toLocaleString("pt-BR")}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-foreground">
                {page + 1} / {totalPages.toLocaleString("pt-BR")}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-secondary disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

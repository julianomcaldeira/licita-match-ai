import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

export default function TopLicitacoesList() {
  const [search, setSearch] = useState("");
  const [uf, setUf] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["top-licitacoes", search, uf, page],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("search_licitacoes", {
        p_search: search || null,
        p_uf: uf === "all" ? null : uf,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return data as {
        id: string;
        orgao: string;
        uf: string;
        municipio: string;
        objeto: string;
        valor_estimado: number;
        valor_homologado: number;
        situacao: string;
        data_publicacao: string;
        total_count: number;
      }[];
    },
  });

  const totalCount = data?.[0]?.total_count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const { data: ufs } = useQuery({
    queryKey: ["ufs-licitacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes")
        .select("uf")
        .not("uf", "is", null)
        .limit(1000);
      if (error) throw error;
      const unique = [...new Set(data.map((r) => r.uf).filter(Boolean))].sort();
      return unique as string[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por órgão ou objeto..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={uf} onValueChange={(v) => { setUf(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas UFs</SelectItem>
            {ufs?.map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Órgão</TableHead>
                  <TableHead className="w-[60px]">UF</TableHead>
                  <TableHead>Município</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-[100px]">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((l, i) => {
                  const valor = l.valor_homologado || l.valor_estimado || 0;
                  return (
                    <Tooltip key={l.id}>
                      <TooltipTrigger asChild>
                        <TableRow className="cursor-help">
                          <TableCell className="text-muted-foreground text-xs">{page * PAGE_SIZE + i + 1}</TableCell>
                          <TableCell className="font-medium max-w-[300px] truncate">{l.orgao}</TableCell>
                          <TableCell>{l.uf || "—"}</TableCell>
                          <TableCell>{l.municipio || "—"}</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(valor)}</TableCell>
                          <TableCell>
                            <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs">
                              {l.situacao || "—"}
                            </span>
                          </TableCell>
                        </TableRow>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-md">
                        <p className="text-xs font-bold mb-1">Objeto:</p>
                        <p className="text-xs leading-relaxed">{l.objeto || "Sem descrição"}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                {(!data || data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma licitação encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {totalCount.toLocaleString("pt-BR")} licitações
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page + 1} / {totalPages || 1}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

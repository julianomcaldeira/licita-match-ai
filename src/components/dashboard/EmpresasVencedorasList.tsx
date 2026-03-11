import { useState, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Loader2, Trophy, MapPin, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function EmpresasVencedorasList() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [uf, setUf] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("total_vitorias");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["list-empresas-vencedoras", deferredSearch, uf, orderBy, page],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_empresas_vencedoras", {
        p_search: deferredSearch || null,
        p_uf: uf || null,
        p_limit: limit,
        p_offset: page * limit,
        p_order_by: orderBy,
      });
      if (error) throw error;
      return data as { razao_social: string; cnpj: string; uf: string; municipio: string; total_vitorias: number; total_valor: number; total_count: number }[];
    },
    placeholderData: (prev) => prev,
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const totalCount = data?.[0]?.total_count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa ou CNPJ..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={uf} onValueChange={(v) => { setUf(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={orderBy} onValueChange={(v) => { setOrderBy(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="total_vitorias">Ordenar por Qtd</SelectItem>
            <SelectItem value="total_valor">Ordenar por Valor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Total */}
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {totalCount.toLocaleString("pt-BR")} empresas encontradas
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (
        <>
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Razão Social</TableHead>
                  <TableHead className="w-[160px]">CNPJ</TableHead>
                  <TableHead className="w-[80px]">UF</TableHead>
                  <TableHead>Município</TableHead>
                  <TableHead className="text-right w-[100px]">Vitórias</TableHead>
                  <TableHead className="text-right w-[160px]">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((row, i) => (
                  <TableRow key={`${row.cnpj}-${row.uf}-${row.municipio}`}>
                    <TableCell className="text-muted-foreground text-xs">{page * limit + i + 1}</TableCell>
                    <TableCell className="font-medium text-sm">{row.razao_social}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{row.cnpj}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{row.uf}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {row.municipio}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold text-sm">{row.total_vitorias.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right font-bold text-sm text-primary">{fmt(row.total_valor)}</TableCell>
                  </TableRow>
                ))}
                {(!data || data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma empresa encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

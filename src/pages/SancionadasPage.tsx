import { useState, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Search, AlertTriangle, CheckCircle2, X, ChevronLeft, ChevronRight, Building2, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";

const PAGE_SIZE = 50;

// Extract best CNPJ/CPF from row, falling back to raw_json fields
function extractCnpjCpf(row: any): string {
  const candidates = [
    row?.cnpj_cpf,
    row?.raw_json?.cpfCnpjSancionado,
    row?.raw_json?.sancionado?.cpfCnpj,
    row?.raw_json?.sancionado?.codigoFormatado,
    row?.raw_json?.sancionado?.cnpjFormatado,
  ];
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c).trim();
  }
  return "";
}

function formatCnpjCpf(raw: string): { display: string; isForeign: boolean } {
  if (!raw) return { display: "—", isForeign: false };
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 14) {
    return {
      display: `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`,
      isForeign: false,
    };
  }
  if (digits.length === 11) {
    return {
      display: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`,
      isForeign: false,
    };
  }
  // Foreign / non-standard identifier
  return { display: raw, isForeign: true };
}

export default function SancionadasPage() {
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<"nome" | "cnpj">("nome");
  const [page, setPage] = useState(0);
  const [cnpjCheck, setCnpjCheck] = useState("");
  const [checkResult, setCheckResult] = useState<null | { found: boolean; records: any[] }>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["sancionadas-list", search, searchField, page],
    queryFn: async () => {
      let q = supabase
        .from("empresas_sancionadas")
        .select("*", { count: "estimated" })
        .order("data_inicio", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (search.trim()) {
        const term = search.trim();
        if (searchField === "cnpj") {
          q = q.ilike("cnpj_cpf", `%${term.replace(/\D/g, "")}%`);
        } else {
          q = q.ilike("nome", `%${term}%`);
        }
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data || [], count: count || 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const sancionadas = data?.rows;
  const total = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleCheck = async () => {
    const clean = cnpjCheck.replace(/[.\-\/\s]/g, "");
    if (clean.length < 8) return;

    const { data } = await supabase
      .from("empresas_sancionadas")
      .select("*")
      .ilike("cnpj_cpf", `%${clean}%`)
      .limit(50);

    setCheckResult({ found: (data?.length ?? 0) > 0, records: data || [] });
  };

  const activeCount = useMemo(
    () => sancionadas?.filter((s) => !s.data_fim || new Date(s.data_fim) >= new Date()).length ?? 0,
    [sancionadas]
  );

  const onSearchChange = (v: string) => {
    setSearch(v);
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          Empresas Sancionadas (CEIS/CNEP)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consulte empresas com restrições nos cadastros CEIS e CNEP do Portal da Transparência
        </p>
      </div>

      {/* Quick CNPJ check */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <h2 className="font-display text-sm font-semibold text-foreground mb-3">Verificação Rápida de CNPJ</h2>
        <div className="flex gap-2 max-w-lg">
          <Input
            placeholder="Digite o CNPJ para verificar..."
            value={cnpjCheck}
            onChange={(e) => {
              setCnpjCheck(e.target.value);
              setCheckResult(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
            className="font-mono"
            maxLength={20}
          />
          <Button onClick={handleCheck} disabled={cnpjCheck.replace(/\D/g, "").length < 8}>
            Verificar
          </Button>
        </div>

        {checkResult && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
            {checkResult.found ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="font-semibold text-destructive">
                    ⚠️ CNPJ encontrado em {checkResult.records.length} registro(s)
                  </span>
                </div>
                <div className="space-y-2">
                  {checkResult.records.map((r, i) => (
                    <div key={i} className="text-sm text-foreground">
                      <span className="font-medium">{r.nome}</span> — {r.tipo_cadastro}
                      {r.tipo_sancao && ` (${r.tipo_sancao})`}
                      {r.data_fim && (
                        <span className="text-muted-foreground">
                          {" "}
                          · até {new Date(r.data_fim).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {!r.data_fim && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">
                          Vigente
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-success/30 bg-success/5 p-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="font-medium text-success">CNPJ não encontrado nos cadastros CEIS/CNEP</span>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Search + table */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:flex-wrap">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Lista de Sancionados
            <span className="text-muted-foreground font-normal ml-2">
              ({total.toLocaleString("pt-BR")} registros{search ? " filtrados" : " no total"} ·{" "}
              {activeCount} vigentes nesta página)
            </span>
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={searchField} onValueChange={(v: "nome" | "cnpj") => { setSearchField(v); setPage(0); }}>
              <SelectTrigger className="h-10 w-[160px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Nome da empresa
                  </span>
                </SelectItem>
                <SelectItem value="cnpj">
                  <span className="flex items-center gap-2">
                    <Hash className="h-4 w-4" /> CNPJ/CPF
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchField === "nome" ? "Buscar por nome da empresa..." : "Buscar por CNPJ/CPF..."}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-10"
                maxLength={100}
              />
              {search && (
                <button
                  onClick={() => onSearchChange("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Sanção</TableHead>
                <TableHead>Órgão Sancionador</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : !sancionadas?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum resultado encontrado
                  </TableCell>
                </TableRow>
              ) : (
                sancionadas.map((s) => {
                  const vigente = !s.data_fim || new Date(s.data_fim) >= new Date();
                  const raw = extractCnpjCpf(s);
                  const { display, isForeign } = formatCnpjCpf(raw);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium max-w-[220px] truncate">{s.nome}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {display}
                        {isForeign && raw && (
                          <Badge variant="outline" className="ml-2 text-[9px]">
                            estrangeiro
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.tipo_cadastro === "CEIS" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {s.tipo_cadastro}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">{s.tipo_sancao || "—"}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">{s.orgao_sancionador || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {s.data_inicio ? new Date(s.data_inicio).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.data_fim ? new Date(s.data_fim).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell>
                        {vigente ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Vigente
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Expirada
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPages.toLocaleString("pt-BR")} · Mostrando {sancionadas?.length ?? 0} de{" "}
              {total.toLocaleString("pt-BR")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || isFetching}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= total || isFetching}
              >
                Próxima <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

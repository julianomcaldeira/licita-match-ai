import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText,
  DollarSign,
  MapPin,
  Clock,
  ExternalLink,
  Package,
  Award,
  Trophy,
  Sparkles,
  Brain,
  Loader2,
} from "lucide-react";
import { OrgaoScoreBadge } from "@/components/OrgaoScoreBadge";
import { LicitacaoStatusBadge } from "./LicitacaoStatusBadge";
import { cn } from "@/lib/utils";

interface LicitacaoDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLicitacao: any | null;
  detailItems: any[];
  detailWinners: any[];
  detailLoading: boolean;
  aiAnalysis: string | null;
  aiLoading: boolean;
  onRunAiAnalysis: (objeto: string, items: any[]) => void;
  onSearchByWinner: (winnerName: string) => void;
  formatCurrency: (val: number | null) => string;
}

export function LicitacaoDetailModal({
  open,
  onOpenChange,
  selectedLicitacao,
  detailItems,
  detailWinners,
  detailLoading,
  aiAnalysis,
  aiLoading,
  onRunAiAnalysis,
  onSearchByWinner,
  formatCurrency,
}: LicitacaoDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="font-display text-lg font-bold text-foreground">
            Detalhes da Licitação
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-80px)]">
          {selectedLicitacao && (
            <div className="px-6 pb-6 space-y-6">
              {/* Header info */}
              <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground leading-tight">
                        {selectedLicitacao.orgao}
                      </p>
                      <OrgaoScoreBadge
                        cnpj={selectedLicitacao.raw_json?.orgaoEntidade?.cnpj}
                        nome={selectedLicitacao.orgao}
                        uf={selectedLicitacao.uf}
                        showRefresh
                        size="md"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {selectedLicitacao.objeto}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LicitacaoStatusBadge
                    situacao={selectedLicitacao.situacao}
                    hasWinner={detailWinners.length > 0}
                    valorHomologado={selectedLicitacao.valor_homologado}
                  />
                  {selectedLicitacao.modalidade && (
                    <Badge variant="outline" className="text-xs">
                      {selectedLicitacao.modalidade}
                    </Badge>
                  )}
                  {selectedLicitacao.numero_controle_pncp &&
                    (() => {
                      const match = selectedLicitacao.numero_controle_pncp.match(
                        /^(\d+)-\d+-(\d+)\/(\d+)$/
                      );
                      const link = match
                        ? `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${parseInt(
                            match[2]
                          )}`
                        : null;
                      return link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver no PNCP
                        </a>
                      ) : null;
                    })()}
                </div>
              </div>

              {/* AI Analysis */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" /> Análise IA do Objeto
                  </h3>
                  <button
                    onClick={() =>
                      onRunAiAnalysis(selectedLicitacao.objeto, detailItems)
                    }
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Brain className="h-3.5 w-3.5" />
                    )}
                    {aiLoading ? "Analisando..." : aiAnalysis ? "Reanalisar" : "Analisar Objeto"}
                  </button>
                </div>
                {aiAnalysis && (
                  <div className="prose prose-sm max-w-none text-foreground [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm [&_strong]:text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</ReactMarkdown>
                  </div>
                )}
                {!aiAnalysis && !aiLoading && (
                  <p className="text-xs text-muted-foreground">
                    Clique em "Analisar Objeto" para a IA identificar os itens e serviços desta licitação.
                  </p>
                )}
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-medium uppercase">Valor Estimado</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {formatCurrency(selectedLicitacao.valor_estimado)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-medium uppercase">Valor Homologado</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {formatCurrency(selectedLicitacao.valor_homologado)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-medium uppercase">Local</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {[selectedLicitacao.municipio, selectedLicitacao.uf]
                      .filter(Boolean)
                      .join("/") || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-medium uppercase">Publicação</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {selectedLicitacao.data_publicacao
                      ? format(
                          new Date(selectedLicitacao.data_publicacao + "T12:00:00"),
                          "dd/MM/yyyy"
                        )
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Additional info from raw_json */}
              {(() => {
                const raw = selectedLicitacao.raw_json || {};
                const infoItems = [
                  {
                    label: "Data Resultado",
                    value: selectedLicitacao.data_resultado
                      ? format(
                          new Date(selectedLicitacao.data_resultado + "T12:00:00"),
                          "dd/MM/yyyy"
                        )
                      : null,
                  },
                  { label: "Fonte", value: selectedLicitacao.fonte },
                  {
                    label: "Nº Controle",
                    value: selectedLicitacao.numero_controle_pncp,
                    mono: true,
                  },
                  {
                    label: "Critério de Julgamento",
                    value: raw.criterioJulgamentoNome || raw.tipoCriterioJulgamento,
                  },
                  {
                    label: "Modo de Disputa",
                    value: raw.modoDisputaNome || raw.tipoModoDisputa,
                  },
                  {
                    label: "Amparo Legal",
                    value: raw.amparoLegal?.descricao || raw.amparoLegalNome,
                  },
                  {
                    label: "Instrumento Convocatório",
                    value: raw.tipoInstrumentoConvocatorioNome,
                  },
                  { label: "CNPJ Órgão", value: raw.orgaoEntidade?.cnpj },
                  {
                    label: "Unidade Compradora",
                    value: raw.unidadeOrgao?.nomeUnidade,
                  },
                  { label: "CNPJ Unidade", value: raw.unidadeOrgao?.cnpj },
                  {
                    label: "Srp",
                    value:
                      raw.srp != null
                        ? raw.srp
                          ? "Sim (Registro de Preços)"
                          : "Não"
                        : null,
                  },
                  {
                    label: "Nº Processo",
                    value: raw.processo?.numeroProcesso || raw.numeroProcesso,
                  },
                  { label: "Nº Edital", value: raw.numeroEdital },
                  {
                    label: "Link do Sistema Origem",
                    value: raw.linkSistemaOrigem,
                    link: true,
                  },
                  {
                    label: "Informação Complementar",
                    value: raw.informacaoComplementar,
                  },
                ].filter((i) => i.value);

                return infoItems.length > 0 ? (
                  <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Informações Adicionais
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {infoItems.map((item, idx) => (
                        <div key={idx}>
                          <span className="text-muted-foreground">{item.label}:</span>{" "}
                          {item.link ? (
                            <a
                              href={String(item.value)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Acessar <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span
                              className={cn(
                                "font-medium text-foreground",
                                item.mono && "font-mono text-xs"
                              )}
                            >
                              {String(item.value)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              <Separator />

              {/* Items */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Itens da Licitação
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {detailItems.length}
                  </Badge>
                </div>
                {detailLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : detailItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum item encontrado para esta licitação.
                  </p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-secondary/50 border-b border-border">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">
                            #
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Descrição
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Qtd
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Und
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Val. Unit. Est.
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Val. Final Item
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Vencedor
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailItems.map((item: any) => (
                          <tr
                            key={item.id}
                            className="border-b border-border last:border-0 hover:bg-secondary/20"
                          >
                            <td className="px-3 py-2 text-muted-foreground font-mono">
                              {item.numero_item ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-foreground max-w-[280px]">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="block truncate">
                                    {item.descricao}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-sm">
                                  <p className="text-xs">{item.descricao}</p>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                            <td className="px-3 py-2 text-right text-foreground">
                              {item.quantidade?.toLocaleString("pt-BR") ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {item.unidade || "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-foreground">
                              {formatCurrency(item.valor_unitario_estimado)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-success">
                              {(() => {
                                const venc = item.licitacao_vencedores;
                                const winner = Array.isArray(venc) ? venc[0] : venc;
                                return winner?.valor_final
                                  ? formatCurrency(winner.valor_final)
                                  : item.valor_unitario_final
                                  ? formatCurrency(item.valor_unitario_final)
                                  : "—";
                              })()}
                            </td>
                            <td className="px-3 py-2 text-foreground text-xs max-w-[150px]">
                              {(() => {
                                const venc = item.licitacao_vencedores;
                                const winner = Array.isArray(venc) ? venc[0] : venc;
                                return winner?.razao_social ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="block truncate">
                                        {winner.razao_social}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="bottom"
                                      className="max-w-sm space-y-1"
                                    >
                                      <p className="font-medium">
                                        {winner.razao_social}
                                      </p>
                                      {winner.cnpj && (
                                        <p className="text-xs font-mono">
                                          CNPJ: {winner.cnpj}
                                        </p>
                                      )}
                                      {winner.percentual_desconto != null && (
                                        <p className="text-xs">
                                          Desconto:{" "}
                                          {winner.percentual_desconto.toFixed(2)}%
                                        </p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  "—"
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Winners */}
              {detailWinners.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-warning" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Vencedores
                      </h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {detailWinners.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {detailWinners.map((w: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10">
                            <Trophy className="h-4 w-4 text-warning" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() =>
                                w.razao_social && onSearchByWinner(w.razao_social)
                              }
                              className="text-sm font-medium text-primary truncate hover:underline text-left"
                              title={`Ver todas licitações de ${w.razao_social}`}
                            >
                              {w.razao_social || "—"}
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {w.cnpj && `CNPJ: ${w.cnpj}`}
                              {w.numero_item != null && ` · Item ${w.numero_item}`}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-success">
                              {formatCurrency(w.valor_final)}
                            </p>
                            {w.percentual_desconto != null && (
                              <p className="text-[10px] text-muted-foreground">
                                -{w.percentual_desconto.toFixed(1)}%
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default LicitacaoDetailModal;

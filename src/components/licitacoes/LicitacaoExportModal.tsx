import { Loader2, FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ExportPreviewState {
  uiCount: number;
  serverCount: number | null;
  diff: number | null;
  tolerance: number;
  inconsistent: boolean;
  loading: boolean;
}

export interface AppliedFilterSummaryItem {
  label: string;
  value: string;
}

interface LicitacaoExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exporting: boolean;
  exportPreview: ExportPreviewState | null;
  filterSummary: AppliedFilterSummaryItem[];
  onExport: () => void;
}

export function LicitacaoExportModal({
  open,
  onOpenChange,
  exporting,
  exportPreview,
  filterSummary,
  onExport,
}: LicitacaoExportModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Confirmar exportação para Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filter summary */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">Filtros aplicados</h4>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              {filterSummary.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum filtro adicional aplicado.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {filterSummary.map((f) => (
                    <Badge key={f.label} variant="secondary" className="text-xs">
                      <span className="font-medium">{f.label}:</span>
                      <span className="ml-1 font-normal">{f.value}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Count comparison */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">Validação de contagem</h4>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-border">
                <div className="p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pesquisa (UI)</p>
                  <p className="text-lg font-semibold text-foreground mt-1">
                    {(exportPreview?.uiCount ?? 0).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Calculada (Servidor)</p>
                  <p className="text-lg font-semibold text-foreground mt-1">
                    {exportPreview?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    ) : exportPreview?.serverCount === null ? (
                      <span className="text-muted-foreground text-sm">indisponível</span>
                    ) : (
                      (exportPreview?.serverCount ?? 0).toLocaleString("pt-BR")
                    )}
                  </p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Diferença</p>
                  <p
                    className={cn(
                      "text-lg font-semibold mt-1",
                      exportPreview?.inconsistent ? "text-destructive" : "text-success"
                    )}
                  >
                    {exportPreview?.loading || exportPreview?.diff === null
                      ? "—"
                      : (exportPreview?.diff ?? 0).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            </div>

            {exportPreview && !exportPreview.loading && (
              <p
                className={cn(
                  "text-xs mt-2",
                  exportPreview.inconsistent ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {exportPreview.inconsistent
                  ? `⚠️ Diferença acima da tolerância (${exportPreview.tolerance.toLocaleString("pt-BR")} registros). Os filtros podem estar inconsistentes.`
                  : `✓ Contagens compatíveis (tolerância: ${exportPreview.tolerance.toLocaleString("pt-BR")} registros).`}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Limite máximo de exportação: 10.000 registros por arquivo.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button onClick={onExport} disabled={exporting || exportPreview?.loading}>
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exportando...
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Gerar arquivo
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LicitacaoExportModal;

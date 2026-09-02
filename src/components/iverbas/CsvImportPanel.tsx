import React, { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, Download, AlertTriangle, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

interface ImportResult {
  success: boolean;
  arquivo?: string;
  tamanho_mb?: number;
  arquivosCSV?: number;
  arquivosNomes?: string[];
  totalLinhas?: number;
  linhasIgnoradas?: number;
  registrosConsolidados?: number;
  registrosInseridos?: number;
  orgaos?: number;
  anos?: number[];
  totais?: {
    empenhado_formatado: string;
    liquidado_formatado: string;
    pago_formatado: string;
  };
  durationMs?: number;
  erros?: string[];
  error?: string;
}

const CsvImportPanel: React.FC<{ onImportComplete?: () => void }> = ({ onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [replace, setReplace] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcDone, setRecalcDone] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv") && !f.name.endsWith(".zip")) {
      setResult({ success: false, error: "Apenas arquivos .csv ou .zip são aceitos" });
      return;
    }
    if (f.size > 500 * 1024 * 1024) {
      setResult({ success: false, error: "Arquivo muito grande (máx 500MB)" });
      return;
    }
    setFile(f);
    setResult(null);
    setRecalcDone(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);
    setResult(null);
    setRecalcDone(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("ano", ano);
      formData.append("replace", String(replace));

      setProgress(30);

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trigger-sync?target=import-csv-transparencia`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: formData,
        }
      );

      setProgress(80);
      const wrapped = await response.json();
      const data = wrapped?.data ?? wrapped;
      setProgress(100);
      setResult(data);

      // Auto-trigger analytics recalculation after successful import
      if (data.success) {
        setRecalculating(true);
        try {
          await supabase.functions.invoke("trigger-sync", {
            body: { target: "compute-analytics", payload: { ano: Number(ano), computeType: "all" } },
          });
          setRecalcDone(true);
        } catch (e) {
          console.error("Analytics recalc error:", e);
        }
        setRecalculating(false);

        if (onImportComplete) {
          onImportComplete();
        }
      }
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : "Erro ao importar" });
    }

    setUploading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-5 shadow-card"
    >
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <Upload className="w-4 h-4 text-primary" />
        Importar CSV/ZIP — Portal da Transparência
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Baixe o ZIP em{" "}
        <a
          href="https://portaldatransparencia.gov.br/download-de-dados/despesas"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          portaldatransparencia.gov.br/download-de-dados/despesas
        </a>{" "}
        e faça upload aqui (ZIP com múltiplos CSVs ou CSV individual).
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : file
            ? "border-emerald-500/50 bg-emerald-500/5"
            : "border-border hover:border-primary/50"
        }`}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".csv,.zip";
          input.onchange = (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) handleFile(f);
          };
          input.click();
        }}
      >
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-medium text-foreground">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              ({(file.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </div>
        ) : (
          <div>
            <Download className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Arraste o ZIP ou CSV aqui ou clique para selecionar
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Formato: ZIP do Portal da Transparência ou CSV individual (Latin-1, separador ;)
            </p>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Ano:</label>
          <input
            type="number"
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            className="w-20 px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
            className="rounded border-border"
          />
          Substituir dados CSV anteriores
        </label>
      </div>

      {/* Upload button */}
      <button
        disabled={!file || uploading}
        onClick={handleUpload}
        className="mt-3 w-full px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Importar
          </>
        )}
      </button>

      {/* Progress */}
      <AnimatePresence>
        {uploading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3"
          >
            <Progress value={progress} className="h-2" />
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              {progress < 30 ? "Preparando..." : progress < 80 ? "Processando CSV no servidor..." : "Finalizando..."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-4 p-4 rounded-lg border ${
              result.success
                ? "bg-emerald-500/5 border-emerald-500/30"
                : "bg-destructive/5 border-destructive/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
              <span className={`text-sm font-semibold ${result.success ? "text-emerald-600" : "text-destructive"}`}>
                {result.success ? "Importação concluída!" : "Erro na importação"}
              </span>
            </div>

            {result.success ? (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>📂 {result.arquivo} ({result.tamanho_mb}MB){result.arquivosCSV && result.arquivosCSV > 1 ? ` — ${result.arquivosCSV} CSVs` : ""}</p>
                {result.arquivosNomes && result.arquivosNomes.length > 1 && (
                  <p className="text-[10px] text-muted-foreground/70 pl-4">
                    {result.arquivosNomes.join(", ")}
                  </p>
                )}
                <p>📊 {result.totalLinhas?.toLocaleString("pt-BR")} linhas → {result.registrosConsolidados?.toLocaleString("pt-BR")} registros consolidados</p>
                <p>💾 {result.registrosInseridos?.toLocaleString("pt-BR")} inseridos | {result.orgaos} órgãos</p>
                <div className="pt-1.5 border-t border-border/50 mt-1.5">
                  <p>💰 Empenhado: {result.totais?.empenhado_formatado}</p>
                  <p>📋 Liquidado: {result.totais?.liquidado_formatado}</p>
                  <p>✅ Pago: {result.totais?.pago_formatado}</p>
                </div>
                <p className="text-[10px] text-muted-foreground/60">⏱ {((result.durationMs || 0) / 1000).toFixed(1)}s</p>
                {result.erros && result.erros.length > 0 && (
                  <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3 text-yellow-600" />
                      <span className="text-[10px] font-medium text-yellow-600">Avisos:</span>
                    </div>
                    {result.erros.map((e, i) => (
                      <p key={i} className="text-[10px] text-yellow-600/80">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-destructive">{result.error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analytics recalculation status */}
      <AnimatePresence>
        {(recalculating || recalcDone) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-3 p-3 rounded-lg border flex items-center gap-2 ${
              recalcDone
                ? "bg-emerald-500/5 border-emerald-500/30"
                : "bg-primary/5 border-primary/30"
            }`}
          >
            {recalculating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs text-foreground font-medium">Recalculando Analytics (iScores, HHI, Insights)...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-foreground font-medium">Analytics atualizados! Dashboards refletem os novos dados.</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CsvImportPanel;

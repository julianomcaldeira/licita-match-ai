import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Loader2, Sparkles, TrendingUp, Target, MapPin, Swords, BarChart3,
  Send, Calendar, MessageSquare, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { format, subMonths } from "date-fns";

const ANALYSIS_TYPES = [
  { id: "market_overview", label: "Visão Geral do Mercado", icon: BarChart3, description: "Tendências, concentrações e oportunidades gerais" },
  { id: "competitive", label: "Análise Competitiva", icon: Swords, description: "Cenário competitivo, market share e padrões de vitória" },
  { id: "regional", label: "Análise Regional", icon: MapPin, description: "Oportunidades por UF/região e órgãos compradores" },
  { id: "trend", label: "Tendências Temporais", icon: TrendingUp, description: "Crescimento, sazonalidade e evolução de valores" },
  { id: "opportunity", label: "Oportunidades Estratégicas", icon: Target, description: "Nichos com pouca competição e segmentos em crescimento" },
  { id: "custom", label: "Pergunta Livre", icon: MessageSquare, description: "Faça qualquer pergunta sobre os dados" },
];

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

interface AnalysisResult {
  type: string;
  question?: string;
  content: string;
  timestamp: Date;
}

export default function AIMarketAnalysis() {
  const [selectedType, setSelectedType] = useState("market_overview");
  const [customQuestion, setCustomQuestion] = useState("");
  const [period, setPeriod] = useState(6);
  const [uf, setUf] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentContent, setCurrentContent] = useState("");
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentContent]);

  const runAnalysis = async () => {
    if (isStreaming) return;
    if (selectedType === "custom" && !customQuestion.trim()) return;

    setIsStreaming(true);
    setCurrentContent("");

    const dateFrom = format(subMonths(new Date(), period), "yyyy-MM-dd");
    const dateTo = format(new Date(), "yyyy-MM-dd");

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-analysis`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            analysisType: selectedType,
            filters: { dateFrom, dateTo, uf: uf || null, period },
            userQuestion: selectedType === "custom" ? customQuestion : undefined,
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        setCurrentContent(`❌ **Erro:** ${err.error || `Status ${resp.status}`}`);
        setIsStreaming(false);
        return;
      }

      if (!resp.body) throw new Error("Sem corpo na resposta");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullContent = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setCurrentContent(fullContent);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setCurrentContent(fullContent);
            }
          } catch { /* ignore */ }
        }
      }

      const typeLabel = ANALYSIS_TYPES.find(t => t.id === selectedType)?.label || selectedType;
      setHistory(prev => [...prev, {
        type: typeLabel,
        question: selectedType === "custom" ? customQuestion : undefined,
        content: fullContent,
        timestamp: new Date(),
      }]);
      setCustomQuestion("");

    } catch (e) {
      console.error("Analysis error:", e);
      setCurrentContent("❌ **Erro ao conectar com a IA.** Tente novamente.");
    } finally {
      setIsStreaming(false);
    }
  };

  const activeType = ANALYSIS_TYPES.find(t => t.id === selectedType);

  return (
    <div className="space-y-4">
      {/* Analysis type selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {ANALYSIS_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => setSelectedType(type.id)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
              selectedType === type.id
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border bg-card hover:bg-muted/50"
            }`}
          >
            <type.icon className={`h-5 w-5 ${selectedType === type.id ? "text-primary" : "text-muted-foreground"}`} />
            <span className={`text-xs font-medium leading-tight ${selectedType === type.id ? "text-primary" : "text-foreground"}`}>
              {type.label}
            </span>
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Período</label>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {[3, 6, 12, 24].map((m) => (
              <button key={m} onClick={() => setPeriod(m)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  period === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}>
                {m}m
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">UF</label>
          <Select value={uf || "__all__"} onValueChange={(v) => setUf(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {selectedType === "custom" && (
          <div className="flex-1 min-w-[250px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sua pergunta</label>
            <div className="flex gap-2">
              <Textarea
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder="Ex: Quais segmentos têm menos concorrência no Nordeste?"
                className="min-h-[36px] max-h-[80px] text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAnalysis(); }
                }}
              />
            </div>
          </div>
        )}

        <Button onClick={runAnalysis} disabled={isStreaming || (selectedType === "custom" && !customQuestion.trim())}
          className="h-9 gap-2 shrink-0">
          {isStreaming ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analisando...</>
          ) : (
            <><Sparkles className="h-4 w-4" /> {selectedType === "custom" ? "Perguntar" : "Gerar Análise"}</>
          )}
        </Button>
      </div>

      {/* Active analysis description */}
      {activeType && selectedType !== "custom" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Brain className="h-4 w-4 text-primary" />
          <span>{activeType.description}</span>
        </div>
      )}

      {/* Result area */}
      {(currentContent || history.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
        >
          {/* History tabs */}
          {history.length > 0 && (
            <div className="flex items-center gap-1 border-b border-border px-4 py-2 overflow-x-auto">
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentContent(h.content)}
                  className="shrink-0 rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition truncate max-w-[150px]"
                  title={h.question || h.type}
                >
                  {h.question ? `💬 ${h.question.substring(0, 20)}...` : h.type}
                </button>
              ))}
              {isStreaming && (
                <span className="shrink-0 flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" /> Gerando...
                </span>
              )}
            </div>
          )}

          {/* Content */}
          <div ref={scrollRef} className="max-h-[600px] overflow-y-auto">
            <div className="p-6 prose prose-sm dark:prose-invert max-w-none
              prose-headings:text-foreground prose-headings:font-display
              prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3
              prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-strong:text-foreground
              prose-li:text-muted-foreground
              prose-ul:my-2 prose-ol:my-2
            ">
              <ReactMarkdown>{currentContent}</ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!currentContent && history.length === 0 && !isStreaming && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Brain className="h-8 w-8 text-primary" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground">Análise de Mercado com IA</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Selecione um tipo de análise acima e clique em "Gerar Análise" para obter insights
            estratégicos baseados nos dados reais de licitações do sistema.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {["Quem domina o mercado?", "Onde há menos concorrência?", "Quais segmentos crescem mais?"].map((q) => (
              <button key={q} onClick={() => { setSelectedType("custom"); setCustomQuestion(q); }}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition">
                {q}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

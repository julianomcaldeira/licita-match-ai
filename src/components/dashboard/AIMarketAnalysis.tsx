import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Loader2, Sparkles, TrendingUp, Target, MapPin, Swords, BarChart3,
  Send, Calendar, MessageSquare, Clock, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import { format, subMonths } from "date-fns";

const ANALYSIS_TYPES = [
  { id: "market_overview", label: "Visão Geral", icon: BarChart3, description: "Tendências, concentrações e oportunidades gerais" },
  { id: "competitive", label: "Competitiva", icon: Swords, description: "Cenário competitivo, market share e padrões de vitória" },
  { id: "regional", label: "Regional", icon: MapPin, description: "Oportunidades por UF/região e órgãos compradores" },
  { id: "trend", label: "Tendências", icon: TrendingUp, description: "Crescimento, sazonalidade e evolução de valores" },
  { id: "opportunity", label: "Oportunidades", icon: Target, description: "Nichos com pouca competição e segmentos em crescimento" },
  { id: "custom", label: "Pergunta Livre", icon: MessageSquare, description: "Faça qualquer pergunta sobre os dados" },
];

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const STORAGE_KEY = "ai-market-analysis-last";

interface SavedAnalysis {
  type: string;
  typeId: string;
  question?: string;
  content: string;
  timestamp: string;
  period: number;
  uf: string;
}

function loadLastAnalysis(): SavedAnalysis | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLastAnalysis(a: SavedAnalysis) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); } catch { /* ignore */ }
}

export default function AIMarketAnalysis() {
  const [selectedType, setSelectedType] = useState("market_overview");
  const [customQuestion, setCustomQuestion] = useState("");
  const [period, setPeriod] = useState(6);
  const [uf, setUf] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentContent, setCurrentContent] = useState("");
  const [lastMeta, setLastMeta] = useState<{ type: string; timestamp: string; period: number; uf: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load persisted analysis on mount
  useEffect(() => {
    const saved = loadLastAnalysis();
    if (saved) {
      setCurrentContent(saved.content);
      setLastMeta({ type: saved.type, timestamp: saved.timestamp, period: saved.period, uf: saved.uf });
      setSelectedType(saved.typeId);
      setPeriod(saved.period);
      if (saved.uf) setUf(saved.uf);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentContent]);

  const runAnalysis = useCallback(async () => {
    if (isStreaming) return;
    if (selectedType === "custom" && !customQuestion.trim()) return;

    setIsStreaming(true);
    setCurrentContent("");
    setLastMeta(null);

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
      const now = new Date().toISOString();
      setLastMeta({ type: typeLabel, timestamp: now, period, uf });

      saveLastAnalysis({
        type: typeLabel,
        typeId: selectedType,
        question: selectedType === "custom" ? customQuestion : undefined,
        content: fullContent,
        timestamp: now,
        period,
        uf,
      });

      setCustomQuestion("");
    } catch (e) {
      console.error("Analysis error:", e);
      setCurrentContent("❌ **Erro ao conectar com a IA.** Tente novamente.");
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, selectedType, customQuestion, period, uf]);

  const clearAnalysis = () => {
    setCurrentContent("");
    setLastMeta(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const activeType = ANALYSIS_TYPES.find(t => t.id === selectedType);

  return (
    <div className="space-y-4">
      {/* Analysis type selector */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {ANALYSIS_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => setSelectedType(type.id)}
            className={`group flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
              selectedType === type.id
                ? "border-primary bg-primary/10 shadow-md shadow-primary/10"
                : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
            }`}
          >
            <type.icon className={`h-5 w-5 transition ${selectedType === type.id ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"}`} />
            <span className={`text-[11px] font-semibold leading-tight ${selectedType === type.id ? "text-primary" : "text-foreground"}`}>
              {type.label}
            </span>
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Período</label>
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground mr-1" />
            {[3, 6, 12, 24].map((m) => (
              <button key={m} onClick={() => setPeriod(m)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  period === m ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}>
                {m}m
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">UF</label>
          <Select value={uf || "__all__"} onValueChange={(v) => setUf(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-9 w-[110px] text-xs">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {selectedType === "custom" && (
          <div className="flex-1 min-w-[250px] space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sua pergunta</label>
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
        )}

        <div className="flex gap-2 ml-auto">
          {currentContent && !isStreaming && (
            <Button variant="ghost" size="sm" onClick={clearAnalysis} className="h-9 gap-1.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
          <Button onClick={runAnalysis} disabled={isStreaming || (selectedType === "custom" && !customQuestion.trim())}
            className="h-9 gap-2 shrink-0 shadow-sm">
            {isStreaming ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Analisando...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> {selectedType === "custom" ? "Perguntar" : "Gerar Análise"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Active type description */}
      {activeType && selectedType !== "custom" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Brain className="h-4 w-4 text-primary" />
          <span>{activeType.description}</span>
        </div>
      )}

      {/* Result area */}
      {(currentContent || isStreaming) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
        >
          {/* Header bar */}
          {lastMeta && !isStreaming && (
            <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Brain className="h-3.5 w-3.5" />
                {lastMeta.type}
              </div>
              <span className="text-muted-foreground text-[10px]">•</span>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(lastMeta.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </div>
              <span className="text-muted-foreground text-[10px]">•</span>
              <span className="text-[11px] text-muted-foreground">Últimos {lastMeta.period} meses{lastMeta.uf ? ` · ${lastMeta.uf}` : ""}</span>
            </div>
          )}

          {isStreaming && (
            <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-5 py-2.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span className="text-xs font-semibold text-primary">Gerando análise...</span>
            </div>
          )}

          {/* Content */}
          <div ref={scrollRef} className="max-h-[650px] overflow-y-auto">
            <div className="p-6 md:p-8
              prose prose-sm dark:prose-invert max-w-none
              prose-headings:text-foreground prose-headings:font-display prose-headings:tracking-tight
              prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border
              prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-strong:text-foreground prose-strong:font-semibold
              prose-li:text-muted-foreground prose-li:leading-relaxed
              prose-ul:my-2 prose-ol:my-2
              prose-table:text-sm prose-th:text-left prose-th:font-semibold prose-th:text-foreground prose-th:pb-2 prose-th:border-b prose-th:border-border
              prose-td:py-1.5 prose-td:text-muted-foreground prose-td:border-b prose-td:border-border/50
            ">
              <ReactMarkdown>{currentContent}</ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-5 bg-primary rounded-sm animate-pulse ml-0.5" />
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!currentContent && !isStreaming && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Brain className="h-8 w-8 text-primary" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground">Análise de Mercado com IA</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Selecione um tipo de análise e clique em "Gerar Análise" para obter insights
            estratégicos baseados nos dados reais de licitações.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            {["Quem domina o mercado?", "Onde há menos concorrência?", "Quais segmentos crescem mais?"].map((q) => (
              <button key={q} onClick={() => { setSelectedType("custom"); setCustomQuestion(q); }}
                className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-primary/5 hover:border-primary/30 hover:text-foreground transition">
                {q}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

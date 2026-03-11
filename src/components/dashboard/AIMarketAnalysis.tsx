import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Brain, Loader2, Sparkles, TrendingUp, Target, MapPin, Swords, BarChart3,
  Calendar, MessageSquare, Clock, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

/* Custom markdown components for rich rendering */
const mdComponents = {
  h2: ({ children, ...props }: any) => (
    <h2 className="flex items-center gap-2 text-lg font-display font-bold text-foreground mt-8 mb-3 pb-2 border-b border-border" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 className="text-base font-display font-semibold text-foreground mt-5 mb-2" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }: any) => (
    <p className="text-sm leading-relaxed text-muted-foreground mb-3" {...props}>{children}</p>
  ),
  strong: ({ children, ...props }: any) => (
    <strong className="font-semibold text-foreground" {...props}>{children}</strong>
  ),
  ul: ({ children, ...props }: any) => (
    <ul className="my-2 ml-1 space-y-1.5 text-sm text-muted-foreground list-none" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol className="my-2 ml-4 space-y-1.5 text-sm text-muted-foreground list-decimal" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: any) => (
    <li className="text-sm leading-relaxed text-muted-foreground pl-1" {...props}>
      <span className="inline">{children}</span>
    </li>
  ),
  table: ({ children, ...props }: any) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead className="bg-muted/60" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }: any) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-foreground border-b border-border" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="px-4 py-2 text-sm text-muted-foreground border-b border-border/40" {...props}>
      {children}
    </td>
  ),
  tr: ({ children, ...props }: any) => (
    <tr className="hover:bg-muted/30 transition-colors" {...props}>{children}</tr>
  ),
  blockquote: ({ children, ...props }: any) => (
    <blockquote className="my-3 border-l-4 border-primary/40 bg-primary/5 rounded-r-lg pl-4 pr-3 py-3 text-sm text-muted-foreground italic" {...props}>
      {children}
    </blockquote>
  ),
  hr: (props: any) => (
    <hr className="my-6 border-border" {...props} />
  ),
};

export default function AIMarketAnalysis() {
  const [selectedType, setSelectedType] = useState("market_overview");
  const [customQuestion, setCustomQuestion] = useState("");
  const [period, setPeriod] = useState(6);
  const [uf, setUf] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentContent, setCurrentContent] = useState("");
  const [lastMeta, setLastMeta] = useState<{ type: string; timestamp: string; period: number; uf: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;
      if (!accessToken) {
        setCurrentContent("❌ **Erro:** Você precisa estar logado para usar a análise IA.");
        setIsStreaming(false);
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-analysis`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
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
          <div className={`flex items-center gap-3 px-6 py-3 ${isStreaming ? "bg-primary/5 border-b border-primary/20" : "bg-muted/30 border-b border-border"}`}>
            {isStreaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs font-semibold text-primary">i-pesquisei está gerando sua análise...</span>
              </>
            ) : lastMeta ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold text-primary">{lastMeta.type}</span>
                </div>
                <span className="h-3 w-px bg-border" />
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(lastMeta.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
                <span className="h-3 w-px bg-border" />
                <span className="text-[11px] text-muted-foreground">Últimos {lastMeta.period} meses{lastMeta.uf ? ` · ${lastMeta.uf}` : ""}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60 font-medium">Powered by i-pesquisei IA</span>
              </>
            ) : null}
          </div>

          {/* Content */}
          <div ref={scrollRef} className="max-h-[650px] overflow-y-auto">
            <div className="px-8 py-6 md:px-10 md:py-8">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {currentContent}
              </ReactMarkdown>
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
          <h3 className="font-display text-lg font-semibold text-foreground">i-pesquisei — Análise de Mercado com IA</h3>
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

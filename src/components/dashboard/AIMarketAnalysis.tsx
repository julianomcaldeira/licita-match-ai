import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Brain, Loader2, Sparkles, MessageSquare, Trash2, RotateCcw, Send, User,
  Calendar, Database, ExternalLink, FileDown, FileText,
} from "lucide-react";
import { exportConversationCsv, exportConversationPdf } from "@/lib/exportConversation";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const STORAGE_KEY = "ai-market-conversation-v2";

const SUGGESTIONS = [
  { label: "Visão geral do mercado", q: "Faça uma visão geral do mercado de licitações no período: total movimentado, número de contratos, principais compradores e vencedores, e tendência mensal." },
  { label: "Quem domina (competitivo)", q: "Quais empresas dominam o mercado no período? Mostre top 10 vencedores com market share, ticket médio, e destaque outliers ou concentração excessiva." },
  { label: "Análise regional", q: "Faça uma análise regional: quais UFs movimentam mais valor, onde há menos concorrência e quais órgãos são os maiores compradores em cada região relevante." },
  { label: "Tendências temporais", q: "Como está a evolução mensal do mercado? Há crescimento, queda ou sazonalidade? Quais meses concentram mais valor?" },
  { label: "Oportunidades pouco exploradas", q: "Identifique nichos com pouca concorrência e segmentos em crescimento que representem boas oportunidades comerciais." },
  { label: "Risco — vencedores sancionados", q: "Algum dos principais vencedores está na lista de sancionados (CEIS/CNEP)? Liste os casos com fonte oficial." },
];

interface ToolMeta { name: string; args: any; summary: string }
interface SourceRef { label: string; url?: string }
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: ToolMeta[];
  sources?: SourceRef[];
}

const TOOL_LABELS: Record<string, string> = {
  get_market_overview: "Visão geral",
  get_top_winners: "Top vencedores",
  get_top_buyers: "Top órgãos compradores",
  search_licitacoes: "Busca de licitações",
  get_orgao_score: "Score do órgão",
  check_vencedores_sancionados: "Vencedores sancionados",
  get_contratos_recentes_orgao: "Contratos recentes",
};

function loadConversation(): ChatMessage[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveConversation(msgs: ChatMessage[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-20))); } catch { /* ignore */ }
}

const mdComponents = {
  h2: ({ children, ...p }: any) => <h2 className="flex items-center gap-2 text-lg font-display font-bold text-foreground mt-6 mb-3 pb-2 border-b border-border" {...p}>{children}</h2>,
  h3: ({ children, ...p }: any) => <h3 className="text-base font-display font-semibold text-foreground mt-4 mb-2" {...p}>{children}</h3>,
  p: ({ children, ...p }: any) => <p className="text-sm leading-relaxed text-muted-foreground mb-3" {...p}>{children}</p>,
  strong: ({ children, ...p }: any) => <strong className="font-semibold text-foreground" {...p}>{children}</strong>,
  ul: ({ children, ...p }: any) => <ul className="my-2 ml-1 space-y-1.5 text-sm text-muted-foreground list-none" {...p}>{children}</ul>,
  ol: ({ children, ...p }: any) => <ol className="my-2 ml-4 space-y-1.5 text-sm text-muted-foreground list-decimal" {...p}>{children}</ol>,
  li: ({ children, ...p }: any) => <li className="text-sm leading-relaxed text-muted-foreground pl-1" {...p}>{children}</li>,
  table: ({ children, ...p }: any) => <div className="my-4 overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm" {...p}>{children}</table></div>,
  thead: ({ children, ...p }: any) => <thead className="bg-muted/60" {...p}>{children}</thead>,
  th: ({ children, ...p }: any) => <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-foreground border-b border-border" {...p}>{children}</th>,
  td: ({ children, ...p }: any) => <td className="px-4 py-2 text-sm text-muted-foreground border-b border-border/40" {...p}>{children}</td>,
  tr: ({ children, ...p }: any) => <tr className="hover:bg-muted/30 transition-colors" {...p}>{children}</tr>,
  blockquote: ({ children, ...p }: any) => <blockquote className="my-3 border-l-4 border-primary/40 bg-primary/5 rounded-r-lg pl-4 pr-3 py-3 text-sm text-muted-foreground italic" {...p}>{children}</blockquote>,
  a: ({ children, href, ...p }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-0.5" {...p}>{children}<ExternalLink className="h-3 w-3" /></a>,
  hr: (p: any) => <hr className="my-5 border-border" {...p} />,
};

export default function AIMarketAnalysis() {
  const [question, setQuestion] = useState("");
  const [period, setPeriod] = useState(6);
  const [uf, setUf] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [pendingTools, setPendingTools] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setConversation(loadConversation()); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [conversation, pendingTools]);

  const ask = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? question).trim();
    if (!text || isLoading) return;

    const newConv: ChatMessage[] = [...conversation, { role: "user", content: text }];
    setConversation(newConv);
    setQuestion("");
    setIsLoading(true);
    setPendingTools(["Consultando dados oficiais..."]);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Você precisa estar logado.");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question: text,
          period_months: period,
          uf: uf || null,
          history: conversation.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${resp.status}`);
      }
      const data = await resp.json();
      const finalConv: ChatMessage[] = [
        ...newConv,
        { role: "assistant", content: data.answer, toolsUsed: data.toolsUsed || [], sources: data.sources || [] },
      ];
      setConversation(finalConv);
      saveConversation(finalConv);
    } catch (e: any) {
      const errConv: ChatMessage[] = [...newConv, { role: "assistant", content: `❌ **Erro:** ${e.message || "Falha ao consultar a IA."}` }];
      setConversation(errConv);
    } finally {
      setIsLoading(false);
      setPendingTools([]);
    }
  }, [question, isLoading, conversation, period, uf]);

  const clearAll = () => { setConversation([]); localStorage.removeItem(STORAGE_KEY); };
  const hasConv = conversation.length > 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Período de análise</label>
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground mr-1" />
            {[3, 6, 12, 24].map(m => (
              <button key={m} onClick={() => setPeriod(m)} disabled={isLoading}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${period === m ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>{m}m</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">UF</label>
          <Select value={uf || "__all__"} onValueChange={v => setUf(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          {hasConv && !isLoading && (
            <>
              <Button variant="ghost" size="sm" onClick={() => clearAll()} className="h-9 gap-1.5 text-muted-foreground hover:text-primary"><RotateCcw className="h-3.5 w-3.5" /> Nova conversa</Button>
              <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 gap-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Limpar</Button>
            </>
          )}
        </div>
      </div>

      {/* Chat container */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-3 bg-muted/30 border-b border-border">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-primary">i-pesquisei IA — Pergunta livre com fontes oficiais</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 font-medium">
            <Database className="h-3 w-3" /> PNCP · Portal da Transparência · SICONFI
          </span>
        </div>

        <div ref={scrollRef} className="max-h-[600px] overflow-y-auto">
          {/* Empty state with suggestions */}
          {!hasConv && !isLoading && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-3"><Sparkles className="h-7 w-7 text-primary" /></div>
              <h3 className="font-display text-base font-semibold text-foreground">Pergunte qualquer coisa sobre o mercado de licitações</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md">A IA consulta dados oficiais sob demanda (PNCP, Portal da Transparência, score de bom-pagador, sancionados CEIS/CNEP) e cita as fontes.</p>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGGESTIONS.map(s => (
                  <button key={s.label} onClick={() => ask(s.q)}
                    className="text-left rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 px-4 py-3 transition group">
                    <div className="text-xs font-semibold text-foreground group-hover:text-primary">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{s.q}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {conversation.map((msg, i) => (
            <div key={i} className={`px-6 py-4 ${msg.role === "user" ? "bg-muted/20" : "bg-card"} ${i > 0 ? "border-t border-border/40" : ""}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${msg.role === "user" ? "bg-secondary" : "bg-primary/10"}`}>
                  {msg.role === "user" ? <User className="h-3.5 w-3.5 text-foreground" /> : <Brain className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                    {msg.role === "user" ? "Você" : "i-pesquisei IA"}
                  </span>
                  {msg.role === "user" ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <>
                      {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {msg.toolsUsed.map((t, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5">
                              <Database className="h-2.5 w-2.5" /> {TOOL_LABELS[t.name] || t.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{msg.content}</ReactMarkdown>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Fontes oficiais</div>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((s, idx) => (
                              s.url
                                ? <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 hover:bg-primary/5 hover:border-primary/30 text-[10px] text-foreground px-2 py-1 transition"><ExternalLink className="h-2.5 w-2.5" /> {s.label}</a>
                                : <span key={idx} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 text-[10px] text-muted-foreground px-2 py-1">{s.label}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="px-6 py-4 bg-card border-t border-border/40">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                </div>
                <div className="flex-1">
                  <span className="text-xs text-primary font-semibold">Consultando fontes oficiais e analisando…</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">A IA pode chamar várias bases (PNCP, Portal da Transparência, score de órgãos, CEIS/CNEP) antes de responder.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-4 bg-muted/10">
          <div className="flex items-end gap-2">
            <Textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder={hasConv ? "Faça uma pergunta de acompanhamento…" : "Ex: Qual o score de bom-pagador da Prefeitura de São Paulo? Mostre as 5 maiores licitações de TI no Nordeste em 2024."}
              className="min-h-[44px] max-h-[120px] text-sm resize-none flex-1"
              disabled={isLoading}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
            />
            <Button onClick={() => ask()} disabled={isLoading || !question.trim()} size="sm" className="h-11 w-11 p-0 shrink-0">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {hasConv && !isLoading && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, 4).map(s => (
                <button key={s.label} onClick={() => ask(s.q)}
                  className="rounded-full border border-border bg-card hover:bg-primary/5 hover:border-primary/30 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground transition">
                  <MessageSquare className="h-2.5 w-2.5 inline mr-1" />{s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

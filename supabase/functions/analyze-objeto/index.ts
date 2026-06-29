import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string, max = 20, windowMs = 3600000): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

async function authenticateUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return null;
  return { userId: data.claims.sub as string };
}

async function logUsage(row: Record<string, unknown>) {
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await sb.from("ai_usage_log").insert(row);
  } catch (e) { console.error("logUsage failed", e); }
}

const MODEL = "google/gemini-3.1-flash-lite";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  let userId: string | null = null;

  try {
    const auth = await authenticateUser(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = auth.userId;

    if (!checkRateLimit(auth.userId, 20, 3600000)) {
      return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente mais tarde." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { objeto, itens } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const itensInfo = itens?.length
      ? `\n\nItens já cadastrados:\n${itens.map((i: any) => `- ${i.numero_item || "?"}: ${i.descricao} (Qtd: ${i.quantidade || "?"}, ${i.unidade || "?"}) - Est: R$${i.valor_unitario_estimado || "?"}`).join("\n")}`
      : "";

    const prompt = `Analise o objeto desta licitação pública brasileira e descreva de forma clara e organizada:

1. **Resumo**: O que está sendo licitado em 1-2 frases simples
2. **Itens/Serviços identificados**: Liste os principais itens, materiais ou serviços que provavelmente serão comprados
3. **Setor**: Identifique o setor/segmento (ex: Saúde, TI, Construção, Alimentação etc.)
4. **Perfil de fornecedor**: Que tipo de empresa normalmente atende esse tipo de licitação?

Objeto da licitação:
"${objeto}"${itensInfo}

Responda em português brasileiro, de forma objetiva e profissional. Use markdown para formatação.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "Você é um especialista em licitações públicas brasileiras. Analise objetos de licitação e descreva claramente o que está sendo comprado/contratado." },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      const errMsg = response.status === 429 ? "Limite de requisições excedido." :
                     response.status === 402 ? "Créditos insuficientes para análise IA." : "Erro na análise IA";
      logUsage({ function_name: "analyze-objeto", model: MODEL, user_id: userId, status: "error", duration_ms: Date.now() - t0, error_message: `${response.status}: ${errMsg}` });
      return new Response(JSON.stringify({ error: errMsg }), {
        status: response.status === 429 || response.status === 402 ? response.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const usage = result.usage || {};
    const analysis = result.choices?.[0]?.message?.content || "Não foi possível gerar a análise.";

    logUsage({
      function_name: "analyze-objeto", model: MODEL, user_id: userId,
      status: "success", cached: false, duration_ms: Date.now() - t0,
      prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens,
    });

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("analyze-objeto error:", e);
    logUsage({ function_name: "analyze-objeto", model: MODEL, user_id: userId, status: "error", duration_ms: Date.now() - t0, error_message: e?.message || "erro interno" });
    return new Response(JSON.stringify({ error: "Erro interno. Tente novamente." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

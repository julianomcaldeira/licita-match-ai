import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um especialista em licitações públicas brasileiras. Analise objetos de licitação e descreva claramente o que está sendo comprado/contratado." },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para análise IA." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro na análise IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content || "Não foi possível gerar a análise.";

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-objeto error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string, max = 5, windowMs = 3600000): boolean {
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

async function checkUserAccessToEmpresa(userId: string, empresaId: string): Promise<boolean> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data } = await supabase
    .from("user_roles")
    .select("role, empresa_id")
    .eq("user_id", userId);

  if (!data?.length) return false;
  // admin_central can access any empresa
  if (data.some((r: any) => r.role === "admin_central")) return true;
  // Others can only access their own empresa
  return data.some((r: any) => r.empresa_id === empresaId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const auth = await authenticateUser(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit
  if (!checkRateLimit(auth.userId, 5, 3600000)) {
    return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente mais tarde." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

  if (!lovableApiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;
    const limit = body.limit || 50;

    if (!empresaId) {
      return new Response(JSON.stringify({ error: "empresa_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user has access to this empresa
    const hasAccess = await checkUserAccessToEmpresa(auth.userId, empresaId);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Acesso negado a esta empresa" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch empresa
    const { data: empresa, error: empError } = await supabase
      .from("empresas_clientes")
      .select("*")
      .eq("id", empresaId)
      .single();

    if (empError || !empresa) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Pre-filter using keyword matching
    const { data: preFiltered, error: matchError } = await supabase
      .rpc("match_licitacoes_por_keywords", {
        p_empresa_id: empresaId,
        p_limit: limit,
      });

    if (matchError) {
      console.error("Keyword match error:", matchError.message);
      return new Response(JSON.stringify({ error: "Erro no filtro por palavras-chave: " + matchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!preFiltered?.length) {
      return new Response(JSON.stringify({
        success: true, processed: 0, pre_filtered: 0,
        message: `Nenhuma licitação encontrada com as palavras-chave de ${empresa.nome}.`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Pre-filtered ${preFiltered.length} licitações by keywords for ${empresa.nome}`);

    // Step 2: AI refinement
    let processed = 0;
    const systemPrompt = `Você é um analista especializado em licitações públicas brasileiras. Analise a aderência entre uma licitação e o perfil de uma empresa.`;

    for (const lic of preFiltered) {
      const userPrompt = `
## Empresa
- Nome: ${empresa.nome}
- Atividade: ${empresa.descricao_atividade || "Não informada"}
- Segmentos: ${empresa.segmentos?.join(", ") || "Não informados"}
- Palavras-chave: ${empresa.palavras_chave?.join(", ") || "Não informadas"}
- Prompt personalizado: ${empresa.prompt_personalizado || "Nenhum"}

## Licitação (pré-filtrada por keywords: ${lic.keywords_matched?.join(", ") || "N/A"})
- Objeto: ${lic.objeto}
- Órgão: ${lic.orgao}
- Modalidade: ${lic.modalidade || "Não informada"}
- Valor estimado: ${lic.valor_estimado ? `R$ ${lic.valor_estimado}` : "Não informado"}
- UF: ${lic.uf || "Não informada"}
- Situação: ${lic.situacao || "Não informada"}
`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "avaliar_aderencia",
                description: "Retorna a análise de aderência entre a licitação e a empresa",
                parameters: {
                  type: "object",
                  properties: {
                    score_aderencia: { type: "integer", description: "Score de 0 a 100" },
                    justificativa_tecnica: { type: "string", description: "Justificativa técnica" },
                    nivel_risco: { type: "string", enum: ["baixo", "medio", "alto"] },
                    tipo_oportunidade: { type: "string", enum: ["core business", "oportunidade lateral", "fora do escopo"] },
                    motivo_recomendacao: { type: "string", description: "Motivo da recomendação" },
                  },
                  required: ["score_aderencia", "justificativa_tecnica", "nivel_risco", "tipo_oportunidade", "motivo_recomendacao"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "avaliar_aderencia" } },
          }),
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) { await new Promise((r) => setTimeout(r, 5000)); continue; }
          if (aiResponse.status === 402) { console.error("Payment required"); break; }
          console.error(`AI error ${aiResponse.status}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) { continue; }

        const result = JSON.parse(toolCall.function.arguments);
        const { error: insertError } = await supabase.from("oportunidades").upsert({
          licitacao_id: lic.licitacao_id, empresa_id: empresaId,
          score_aderencia: Math.min(100, Math.max(0, result.score_aderencia)),
          justificativa_tecnica: result.justificativa_tecnica,
          nivel_risco: result.nivel_risco,
          tipo_oportunidade: result.tipo_oportunidade,
          motivo_recomendacao: result.motivo_recomendacao,
        }, { onConflict: "licitacao_id,empresa_id" });

        if (insertError) console.error("Insert error:", insertError.message);
        else processed++;

        await new Promise((r) => setTimeout(r, 500));
      } catch (aiErr) {
        console.error("AI processing error:", aiErr);
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        success: true, pre_filtered: preFiltered.length, processed,
        message: `Pré-filtro encontrou ${preFiltered.length} licitações relevantes. IA analisou ${processed} para ${empresa.nome}.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Matching error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

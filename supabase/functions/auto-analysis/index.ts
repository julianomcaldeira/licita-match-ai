import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function authenticateAdmin(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAuth.auth.getClaims(token);
  if (error || !data?.claims) return null;

  const userId = data.claims.sub as string;

  // Check admin_central role
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin_central")
    .limit(1);

  if (!roles?.length) return null;
  return { userId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth + admin check
  const auth = await authenticateAdmin(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Não autorizado. Acesso restrito a administradores." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

  if (!lovableApiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: empresas, error: empError } = await supabase.from("empresas_clientes").select("*");
    if (empError) throw empError;
    if (!empresas?.length) {
      return new Response(JSON.stringify({ message: "Nenhuma empresa cadastrada", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ empresa: string; pre_filtered: number; analyzed: number; errors: number }> = [];

    for (const empresa of empresas) {
      const hasKeywords = (empresa.palavras_chave?.length ?? 0) > 0 || (empresa.segmentos?.length ?? 0) > 0;
      if (!hasKeywords) {
        results.push({ empresa: empresa.nome, pre_filtered: 0, analyzed: 0, errors: 0 });
        continue;
      }

      const { data: preFiltered, error: matchError } = await supabase
        .rpc("match_licitacoes_por_keywords", { p_empresa_id: empresa.id, p_limit: 30 });

      if (matchError) {
        results.push({ empresa: empresa.nome, pre_filtered: 0, analyzed: 0, errors: 1 });
        continue;
      }

      if (!preFiltered?.length) {
        results.push({ empresa: empresa.nome, pre_filtered: 0, analyzed: 0, errors: 0 });
        continue;
      }

      let analyzed = 0;
      let errors = 0;
      const systemPrompt = `Você é um analista especializado em licitações públicas brasileiras. Analise a aderência entre uma licitação e o perfil de uma empresa.`;

      for (const lic of preFiltered) {
        const userPrompt = `
## Empresa
- Nome: ${empresa.nome}
- Atividade: ${empresa.descricao_atividade || "Não informada"}
- Segmentos: ${empresa.segmentos?.join(", ") || "Não informados"}
- Palavras-chave: ${empresa.palavras_chave?.join(", ") || "Não informadas"}
- Prompt personalizado: ${empresa.prompt_personalizado || "Nenhum"}

## Licitação (keywords: ${lic.keywords_matched?.join(", ") || "N/A"})
- Objeto: ${lic.objeto}
- Órgão: ${lic.orgao}
- Modalidade: ${lic.modalidade || "Não informada"}
- Valor estimado: ${lic.valor_estimado ? `R$ ${lic.valor_estimado}` : "Não informado"}
- UF: ${lic.uf || "Não informada"}
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
                  description: "Retorna a análise de aderência",
                  parameters: {
                    type: "object",
                    properties: {
                      score_aderencia: { type: "integer", description: "Score de 0 a 100" },
                      justificativa_tecnica: { type: "string" },
                      nivel_risco: { type: "string", enum: ["baixo", "medio", "alto"] },
                      tipo_oportunidade: { type: "string", enum: ["core business", "oportunidade lateral", "fora do escopo"] },
                      motivo_recomendacao: { type: "string" },
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
            if (aiResponse.status === 429) { await new Promise((r) => setTimeout(r, 10000)); continue; }
            if (aiResponse.status === 402) { break; }
            errors++;
            continue;
          }

          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall?.function?.arguments) { errors++; continue; }

          const result = JSON.parse(toolCall.function.arguments);
          const { error: insertError } = await supabase.from("oportunidades").upsert({
            licitacao_id: lic.licitacao_id, empresa_id: empresa.id,
            score_aderencia: Math.min(100, Math.max(0, result.score_aderencia)),
            justificativa_tecnica: result.justificativa_tecnica,
            nivel_risco: result.nivel_risco,
            tipo_oportunidade: result.tipo_oportunidade,
            motivo_recomendacao: result.motivo_recomendacao,
          }, { onConflict: "licitacao_id,empresa_id" });

          if (insertError) errors++;
          else analyzed++;

          await new Promise((r) => setTimeout(r, 1000));
        } catch (aiErr) {
          errors++;
          continue;
        }
      }

      results.push({ empresa: empresa.nome, pre_filtered: preFiltered.length, analyzed, errors });
    }

    const totalAnalyzed = results.reduce((s, r) => s + r.analyzed, 0);
    const totalPreFiltered = results.reduce((s, r) => s + r.pre_filtered, 0);

    return new Response(
      JSON.stringify({
        success: true,
        summary: { empresas: empresas.length, total_pre_filtered: totalPreFiltered, total_analyzed: totalAnalyzed },
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

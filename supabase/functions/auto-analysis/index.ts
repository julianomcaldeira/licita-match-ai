import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    // Fetch all active empresas
    const { data: empresas, error: empError } = await supabase
      .from("empresas_clientes")
      .select("*");

    if (empError) throw empError;
    if (!empresas?.length) {
      return new Response(JSON.stringify({ message: "Nenhuma empresa cadastrada", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ empresa: string; pre_filtered: number; analyzed: number; errors: number }> = [];

    for (const empresa of empresas) {
      // Skip empresas without keywords configured
      const hasKeywords = (empresa.palavras_chave?.length ?? 0) > 0 || (empresa.segmentos?.length ?? 0) > 0;
      if (!hasKeywords) {
        console.log(`Skipping ${empresa.nome}: no keywords configured`);
        results.push({ empresa: empresa.nome, pre_filtered: 0, analyzed: 0, errors: 0 });
        continue;
      }

      // Step 1: Keyword pre-filter
      const { data: preFiltered, error: matchError } = await supabase
        .rpc("match_licitacoes_por_keywords", {
          p_empresa_id: empresa.id,
          p_limit: 30, // limit per empresa per day to control AI costs
        });

      if (matchError) {
        console.error(`Keyword match error for ${empresa.nome}:`, matchError.message);
        results.push({ empresa: empresa.nome, pre_filtered: 0, analyzed: 0, errors: 1 });
        continue;
      }

      if (!preFiltered?.length) {
        console.log(`No keyword matches for ${empresa.nome}`);
        results.push({ empresa: empresa.nome, pre_filtered: 0, analyzed: 0, errors: 0 });
        continue;
      }

      console.log(`${empresa.nome}: ${preFiltered.length} licitações pré-filtradas`);

      // Step 2: AI analysis on pre-filtered results
      let analyzed = 0;
      let errors = 0;

      const systemPrompt = `Você é um analista especializado em licitações públicas brasileiras. Analise a aderência entre uma licitação e o perfil de uma empresa. A licitação já passou por um filtro de palavras-chave, então há alguma relação textual. Avalie a relevância real.`;

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
              tools: [
                {
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
                },
              ],
              tool_choice: { type: "function", function: { name: "avaliar_aderencia" } },
            }),
          });

          if (!aiResponse.ok) {
            if (aiResponse.status === 429) {
              console.log("Rate limited, waiting 10s...");
              await new Promise((r) => setTimeout(r, 10000));
              continue;
            }
            if (aiResponse.status === 402) {
              console.error("Payment required - stopping AI analysis");
              break;
            }
            console.error(`AI error ${aiResponse.status}`);
            errors++;
            continue;
          }

          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall?.function?.arguments) {
            errors++;
            continue;
          }

          const result = JSON.parse(toolCall.function.arguments);

          const { error: insertError } = await supabase.from("oportunidades").upsert(
            {
              licitacao_id: lic.licitacao_id,
              empresa_id: empresa.id,
              score_aderencia: Math.min(100, Math.max(0, result.score_aderencia)),
              justificativa_tecnica: result.justificativa_tecnica,
              nivel_risco: result.nivel_risco,
              tipo_oportunidade: result.tipo_oportunidade,
              motivo_recomendacao: result.motivo_recomendacao,
            },
            { onConflict: "licitacao_id,empresa_id" }
          );

          if (insertError) {
            console.error("Insert error:", insertError.message);
            errors++;
          } else {
            analyzed++;
          }

          // Delay between AI calls to avoid rate limiting
          await new Promise((r) => setTimeout(r, 1000));
        } catch (aiErr) {
          console.error("AI error:", aiErr);
          errors++;
          continue;
        }
      }

      results.push({ empresa: empresa.nome, pre_filtered: preFiltered.length, analyzed, errors });
      console.log(`${empresa.nome}: analyzed ${analyzed}/${preFiltered.length}, errors: ${errors}`);
    }

    // Log summary
    const totalAnalyzed = results.reduce((s, r) => s + r.analyzed, 0);
    const totalPreFiltered = results.reduce((s, r) => s + r.pre_filtered, 0);

    console.log(`Auto-analysis complete: ${totalPreFiltered} pre-filtered, ${totalAnalyzed} analyzed across ${empresas.length} empresas`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          empresas: empresas.length,
          total_pre_filtered: totalPreFiltered,
          total_analyzed: totalAnalyzed,
        },
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

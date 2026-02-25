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
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;
    const limit = body.limit || 20;

    if (!empresaId) {
      return new Response(JSON.stringify({ error: "empresa_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Fetch licitacoes not yet analyzed for this empresa
    const { data: licitacoes, error: licError } = await supabase
      .from("licitacoes")
      .select("id, objeto, orgao, modalidade, valor_estimado, situacao, uf")
      .order("data_publicacao", { ascending: false })
      .limit(limit);

    if (licError || !licitacoes?.length) {
      return new Response(JSON.stringify({ error: "Nenhuma licitação para analisar", processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const lic of licitacoes) {
      // Check if already analyzed
      const { data: existing } = await supabase
        .from("oportunidades")
        .select("id")
        .eq("licitacao_id", lic.id)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (existing) continue;

      const systemPrompt = `Você é um analista especializado em licitações públicas brasileiras. Analise a aderência entre uma licitação e o perfil de uma empresa.`;

      const userPrompt = `
## Empresa
- Nome: ${empresa.nome}
- Atividade: ${empresa.descricao_atividade || "Não informada"}
- Segmentos: ${empresa.segmentos?.join(", ") || "Não informados"}
- Palavras-chave: ${empresa.palavras_chave?.join(", ") || "Não informadas"}
- Prompt personalizado: ${empresa.prompt_personalizado || "Nenhum"}

## Licitação
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
            tools: [
              {
                type: "function",
                function: {
                  name: "avaliar_aderencia",
                  description: "Retorna a análise de aderência entre a licitação e a empresa",
                  parameters: {
                    type: "object",
                    properties: {
                      score_aderencia: {
                        type: "integer",
                        description: "Score de 0 a 100 indicando aderência",
                      },
                      justificativa_tecnica: {
                        type: "string",
                        description: "Justificativa técnica da análise",
                      },
                      nivel_risco: {
                        type: "string",
                        enum: ["baixo", "medio", "alto"],
                        description: "Nível de risco para participação",
                      },
                      tipo_oportunidade: {
                        type: "string",
                        enum: ["core business", "oportunidade lateral", "fora do escopo"],
                        description: "Classificação da oportunidade",
                      },
                      motivo_recomendacao: {
                        type: "string",
                        description: "Motivo da recomendação ou não",
                      },
                    },
                    required: [
                      "score_aderencia",
                      "justificativa_tecnica",
                      "nivel_risco",
                      "tipo_oportunidade",
                      "motivo_recomendacao",
                    ],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "avaliar_aderencia" } },
          }),
        });

        if (!aiResponse.ok) {
          const status = aiResponse.status;
          if (status === 429) {
            console.log("Rate limited, waiting...");
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          if (status === 402) {
            console.error("Payment required for AI gateway");
            break;
          }
          console.error(`AI error ${status}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

        if (!toolCall?.function?.arguments) {
          console.error("No tool call in AI response");
          continue;
        }

        const result = JSON.parse(toolCall.function.arguments);

        const { error: insertError } = await supabase.from("oportunidades").upsert(
          {
            licitacao_id: lic.id,
            empresa_id: empresaId,
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
        } else {
          processed++;
        }

        // Small delay between AI calls
        await new Promise((r) => setTimeout(r, 500));
      } catch (aiErr) {
        console.error("AI processing error:", aiErr);
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        message: `Análise concluída: ${processed} licitações analisadas para ${empresa.nome}`,
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

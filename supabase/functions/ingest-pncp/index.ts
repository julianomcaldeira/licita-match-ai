import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PNCP_BASE_URL = "https://pncp.gov.br/api/consulta/v1";

interface PNCPContratacao {
  numeroControlePNCP?: string;
  orgaoEntidade?: { razaoSocial?: string; cnpj?: string };
  modalidadeId?: number;
  modalidadeNome?: string;
  objetoCompra?: string;
  dataPublicacaoPncp?: string;
  dataResultadoCompra?: string;
  valorTotalEstimado?: number;
  valorTotalHomologado?: number;
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  unidadeOrgao?: { ufSigla?: string; municipioNome?: string };
  [key: string]: unknown;
}

async function fetchWithRetry(url: string, retries = 3, delayMs = 2000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (resp.status === 429) {
        const wait = delayMs * Math.pow(2, i);
        console.log(`Rate limited, waiting ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Max retries reached");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse params
  let dataInicial: string;
  let dataFinal: string;
  let pagina = 1;
  const tamanhoPagina = 50;

  try {
    const body = await req.json().catch(() => ({}));
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split("T")[0]
      .replace(/-/g, "");

    dataInicial = body.dataInicial || sevenDaysAgo;
    dataFinal = body.dataFinal || today;
    pagina = body.pagina || 1;
  } catch {
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split("T")[0]
      .replace(/-/g, "");
    dataInicial = sevenDaysAgo;
    dataFinal = today;
  }

  // Create ingestion log
  const { data: logEntry, error: logError } = await supabase
    .from("ingestao_logs")
    .insert({
      fonte: "PNCP",
      endpoint: "/contratacoes/publicacao",
      data_inicio: new Date().toISOString(),
      status: "running",
    })
    .select()
    .single();

  if (logError) {
    console.error("Failed to create log entry:", logError);
  }

  let totalProcessed = 0;

  try {
    // Fetch contratações from PNCP
    const url = `${PNCP_BASE_URL}/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;
    console.log("Fetching:", url);

    const response = await fetchWithRetry(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PNCP API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const contratacoes: PNCPContratacao[] = data.data || data || [];

    console.log(`Received ${contratacoes.length} contratações`);

    for (const c of contratacoes) {
      const idOrigem = c.numeroControlePNCP || `pncp-${Date.now()}-${Math.random()}`;

      const licitacao = {
        id_origem: idOrigem,
        fonte: "PNCP",
        orgao: c.orgaoEntidade?.razaoSocial || "Não informado",
        modalidade: c.modalidadeNome || null,
        objeto: c.objetoCompra || "Sem descrição",
        data_publicacao: c.dataPublicacaoPncp
          ? c.dataPublicacaoPncp.split("T")[0]
          : null,
        data_resultado: c.dataResultadoCompra
          ? c.dataResultadoCompra.split("T")[0]
          : null,
        valor_estimado: c.valorTotalEstimado || null,
        valor_homologado: c.valorTotalHomologado || null,
        situacao: c.situacaoCompraNome || null,
        numero_controle_pncp: c.numeroControlePNCP || null,
        uf: c.unidadeOrgao?.ufSigla || null,
        municipio: c.unidadeOrgao?.municipioNome || null,
        raw_json: c as unknown as Record<string, unknown>,
      };

      const { error: upsertError } = await supabase
        .from("licitacoes")
        .upsert(licitacao, { onConflict: "id_origem,fonte" });

      if (upsertError) {
        console.error(`Error upserting ${idOrigem}:`, upsertError.message);
      } else {
        totalProcessed++;
      }
    }

    // Update log
    if (logEntry) {
      await supabase
        .from("ingestao_logs")
        .update({
          status: "completed",
          registros_processados: totalProcessed,
          data_fim: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalProcessed,
        pagina,
        message: `Ingestão concluída: ${totalProcessed} registros processados`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingestion error:", error);

    if (logEntry) {
      await supabase
        .from("ingestao_logs")
        .update({
          status: "error",
          erro: error instanceof Error ? error.message : "Unknown error",
          data_fim: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

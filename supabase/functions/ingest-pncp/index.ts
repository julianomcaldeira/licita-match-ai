import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PNCP_BASE_URL = "https://pncp.gov.br/api/consulta/v1";
const PAGE_SIZE = 100;

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
  nomeVencedor?: string;
  niFornecedor?: string;
  nomeRazaoSocialFornecedor?: string;
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

// Try to fetch winner for a specific contratação using resultados endpoint
async function fetchVencedor(numeroControlePNCP: string): Promise<string | null> {
  try {
    // numeroControlePNCP format: CNPJ-ANO-SEQUENCIAL (e.g., "00394460000141-1-000037/2024")
    // The API endpoint for results needs the CNPJ, year and sequential number
    const url = `${PNCP_BASE_URL}/contratacoes/${encodeURIComponent(numeroControlePNCP)}/resultados`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) {
      await resp.text(); // consume body
      return null;
    }
    const data = await resp.json();
    // Try to extract winner from resultados
    if (Array.isArray(data) && data.length > 0) {
      return data[0]?.nomeRazaoSocialFornecedor || data[0]?.niFornecedor || null;
    }
    if (data?.nomeRazaoSocialFornecedor) return data.nomeRazaoSocialFornecedor;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resumable ingestion: processes ONE modalidade + ONE page per call.
 * The frontend orchestrates by calling repeatedly with different params.
 * 
 * Body params:
 *  - dataInicial: YYYYMMDD
 *  - dataFinal: YYYYMMDD
 *  - modalidade: number (default 4)
 *  - pagina: number (default 1)
 *  - fetchWinners: boolean (default false, slower)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await req.json().catch(() => ({}));
  
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const dataInicial: string = body.dataInicial || "20230101";
  const dataFinal: string = body.dataFinal || today;
  const modalidade: number = body.modalidade || 4;
  const pagina: number = body.pagina || 1;
  const fetchWinners: boolean = body.fetchWinners || false;

  let totalProcessed = 0;

  try {
    const url = `${PNCP_BASE_URL}/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;
    console.log("Fetching:", url);

    const response = await fetchWithRetry(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`PNCP modalidade ${modalidade} page ${pagina} error ${response.status}: ${errorText}`);
      // Return gracefully so the orchestrator can continue
      return new Response(
        JSON.stringify({
          success: true,
          totalProcessed: 0,
          hasMore: false,
          modalidade,
          pagina,
          message: `Modalidade ${modalidade} página ${pagina}: API retornou erro ${response.status}, pulando.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const contratacoes: PNCPContratacao[] = data.data || data || [];
    const hasMore = contratacoes.length >= PAGE_SIZE;

    console.log(`Modalidade ${modalidade} página ${pagina}: ${contratacoes.length} contratações`);

    // Batch upsert for performance
    const licitacoesRows = [];
    for (const c of contratacoes) {
      const idOrigem = c.numeroControlePNCP || `pncp-${Date.now()}-${Math.random()}`;

      // Try to get winner name from the contratação data itself
      let vencedorNome: string | null = 
        (c as any).nomeRazaoSocialFornecedor || 
        (c as any).nomeVencedor || 
        null;

      licitacoesRows.push({
        id_origem: idOrigem,
        fonte: "PNCP",
        orgao: c.orgaoEntidade?.razaoSocial || "Não informado",
        modalidade: c.modalidadeNome || null,
        objeto: c.objetoCompra || "Sem descrição",
        data_publicacao: c.dataPublicacaoPncp ? c.dataPublicacaoPncp.split("T")[0] : null,
        data_resultado: c.dataResultadoCompra ? c.dataResultadoCompra.split("T")[0] : null,
        valor_estimado: c.valorTotalEstimado || null,
        valor_homologado: c.valorTotalHomologado || null,
        situacao: c.situacaoCompraNome || null,
        numero_controle_pncp: c.numeroControlePNCP || null,
        uf: c.unidadeOrgao?.ufSigla || null,
        municipio: c.unidadeOrgao?.municipioNome || null,
        raw_json: c as unknown as Record<string, unknown>,
      });
    }

    // Upsert in batches of 50
    for (let i = 0; i < licitacoesRows.length; i += 50) {
      const batch = licitacoesRows.slice(i, i + 50);
      const { error: upsertError } = await supabase
        .from("licitacoes")
        .upsert(batch, { onConflict: "id_origem,fonte" });

      if (upsertError) {
        console.error(`Batch upsert error:`, upsertError.message);
      } else {
        totalProcessed += batch.length;
      }
    }

    // Optionally fetch winners (slower, separate API calls)
    if (fetchWinners) {
      for (const c of contratacoes) {
        if (!c.numeroControlePNCP) continue;
        const vencedor = await fetchVencedor(c.numeroControlePNCP);
        if (vencedor) {
          // Store winner in licitacao_itens + licitacao_vencedores
          // First get the licitacao id
          const { data: lic } = await supabase
            .from("licitacoes")
            .select("id")
            .eq("id_origem", c.numeroControlePNCP)
            .eq("fonte", "PNCP")
            .limit(1)
            .single();

          if (lic) {
            // Upsert a generic item
            const { data: item } = await supabase
              .from("licitacao_itens")
              .upsert(
                { licitacao_id: lic.id, descricao: c.objetoCompra || "Item geral", numero_item: 1 },
                { onConflict: "licitacao_id,numero_item" }
              )
              .select("id")
              .single();

            if (item) {
              await supabase
                .from("licitacao_vencedores")
                .upsert(
                  { item_id: item.id, razao_social: vencedor },
                  { onConflict: "item_id" }
                );
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalProcessed,
        hasMore,
        modalidade,
        pagina,
        dataInicial,
        dataFinal,
        message: `Modalidade ${modalidade} pág ${pagina}: ${totalProcessed} registros`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingestion error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        modalidade,
        pagina,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

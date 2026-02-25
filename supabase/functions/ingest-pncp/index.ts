import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PNCP_BASE_URL = "https://pncp.gov.br/api/consulta/v1";
const PNCP_DATA_URL = "https://pncp.gov.br/api/pncp/v1"; // For orgaos/compras/itens/resultados
const PAGE_SIZE = 50; // PNCP max is 50

interface PNCPContratacao {
  numeroControlePNCP?: string;
  orgaoEntidade?: { razaoSocial?: string; cnpj?: string };
  orgaoSubRogado?: { razaoSocial?: string; cnpj?: string };
  modalidadeId?: number;
  modalidadeNome?: string;
  objetoCompra?: string;
  dataPublicacaoPncp?: string;
  dataResultadoCompra?: string;
  valorTotalEstimado?: number;
  valorTotalHomologado?: number;
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  unidadeOrgao?: { ufSigla?: string; municipioNome?: string; cnpj?: string };
  anoCompra?: number;
  sequencialCompra?: number;
  [key: string]: unknown;
}

async function fetchWithRetry(url: string, retries = 3, delayMs = 2000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
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

// Parse numeroControlePNCP to extract cnpj, ano, sequencial
// Format examples: "00394460000141-1-000037/2024" or similar
function parseNumeroControle(numero: string): { cnpj: string; ano: string; sequencial: string } | null {
  try {
    // Common format: CNPJ-ANO-SEQ or variations
    // Try pattern: {14-digit-cnpj}-{ano}-{sequencial}/{ano2}
    const parts = numero.split("-");
    if (parts.length >= 3) {
      const cnpj = parts[0];
      const ano = parts[1];
      // sequencial may contain /year suffix, clean it
      const seq = parts.slice(2).join("-").split("/")[0];
      return { cnpj, ano, sequencial: seq };
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch winners for a contratação via the itens + resultados endpoints
async function fetchVencedores(
  cnpj: string,
  ano: string,
  sequencial: string
): Promise<Array<{ numeroItem: number; razaoSocial: string; cnpjVencedor: string | null; valorFinal: number | null; descricao: string }>> {
  const winners: Array<{ numeroItem: number; razaoSocial: string; cnpjVencedor: string | null; valorFinal: number | null; descricao: string }> = [];

  try {
    // First get the items
    const itensUrl = `${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`;
    console.log("Fetching itens:", itensUrl);
    const itensResp = await fetch(itensUrl, { headers: { Accept: "application/json" } });
    if (!itensResp.ok) {
      const errText = await itensResp.text();
      console.warn(`Itens error ${itensResp.status} for ${cnpj}/${ano}/${sequencial}: ${errText.slice(0, 200)}`);
      return winners;
    }

    const itens = await itensResp.json();
    console.log(`Found ${Array.isArray(itens) ? itens.length : 'non-array'} itens for ${cnpj}/${ano}/${sequencial}`);
    if (!Array.isArray(itens)) return winners;

    // For each item, try to get the resultado
    for (const item of itens.slice(0, 10)) { // Limit to first 10 items to avoid timeout
      const seqItem = item.numeroItem || item.sequencialItem;
      if (!seqItem) continue;

      try {
        const resultUrl = `${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${seqItem}/resultados`;
        const resultResp = await fetch(resultUrl, { headers: { Accept: "application/json" } });
        if (!resultResp.ok) {
          await resultResp.text();
          continue;
        }

        const resultados = await resultResp.json();
        const resultList = Array.isArray(resultados) ? resultados : [resultados];

        for (const r of resultList) {
          if (r?.nomeRazaoSocialFornecedor || r?.niFornecedor) {
            winners.push({
              numeroItem: seqItem,
              razaoSocial: r.nomeRazaoSocialFornecedor || r.niFornecedor || "Não informado",
              cnpjVencedor: r.niFornecedor || null,
              valorFinal: r.valorTotalHomologado || r.valorUnitarioHomologado || null,
              descricao: item.descricao || item.materialOuServico || "Item",
            });
            break; // Only first winner per item
          }
        }
      } catch {
        // Skip this item
      }
    }
  } catch (e) {
    console.warn("Error fetching vencedores:", e);
  }

  return winners;
}

/**
 * Resumable ingestion: processes ONE modalidade + ONE page per call.
 * 
 * Body params:
 *  - dataInicial: YYYYMMDD
 *  - dataFinal: YYYYMMDD
 *  - modalidade: number
 *  - pagina: number (default 1)
 *  - fetchWinners: boolean (default false)
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
  const fetchWinners: boolean = body.fetchWinners ?? false;

  let totalProcessed = 0;
  let winnersFound = 0;

  try {
    const url = `${PNCP_BASE_URL}/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;
    console.log("Fetching:", url);

    const response = await fetchWithRetry(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`PNCP mod ${modalidade} pag ${pagina} error ${response.status}: ${errorText}`);
      return new Response(
        JSON.stringify({ success: true, totalProcessed: 0, hasMore: false, modalidade, pagina }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const contratacoes: PNCPContratacao[] = data.data || data || [];
    const hasMore = contratacoes.length >= PAGE_SIZE;

    console.log(`Mod ${modalidade} pag ${pagina}: ${contratacoes.length} contratações`);

    // Batch upsert licitacoes
    const licitacoesRows = [];
    for (const c of contratacoes) {
      const idOrigem = c.numeroControlePNCP || `pncp-${Date.now()}-${Math.random()}`;
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

    for (let i = 0; i < licitacoesRows.length; i += 50) {
      const batch = licitacoesRows.slice(i, i + 50);
      const { error: upsertError } = await supabase
        .from("licitacoes")
        .upsert(batch, { onConflict: "id_origem,fonte" });
      if (upsertError) {
        console.error("Batch upsert error:", upsertError.message);
      } else {
        totalProcessed += batch.length;
      }
    }

    // Fetch winners for contratações that have anoCompra and sequencialCompra
    if (fetchWinners) {
      const withData = contratacoes.filter(
        (c) => c.numeroControlePNCP && (c.orgaoEntidade?.cnpj || c.unidadeOrgao?.cnpj) && c.anoCompra && c.sequencialCompra
      );

      for (const c of withData.slice(0, 15)) { // Limit per call to avoid timeout
        const cnpj = c.orgaoEntidade?.cnpj || c.unidadeOrgao?.cnpj || "";
        const ano = String(c.anoCompra);
        const sequencial = String(c.sequencialCompra);

        const vencedores = await fetchVencedores(cnpj, ano, sequencial);
        if (vencedores.length === 0) continue;

        // Get the licitacao id
        const { data: lic } = await supabase
          .from("licitacoes")
          .select("id")
          .eq("id_origem", c.numeroControlePNCP!)
          .eq("fonte", "PNCP")
          .limit(1)
          .single();

        if (!lic) continue;

        for (const v of vencedores) {
          // Upsert item
          const { data: item, error: itemErr } = await supabase
            .from("licitacao_itens")
            .upsert(
              {
                licitacao_id: lic.id,
                descricao: v.descricao,
                numero_item: v.numeroItem,
                valor_unitario_final: v.valorFinal,
              },
              { onConflict: "licitacao_id,numero_item" }
            )
            .select("id")
            .single();

          if (itemErr || !item) {
            console.warn("Item upsert error:", itemErr?.message);
            continue;
          }

          // Upsert winner
          const { error: winErr } = await supabase
            .from("licitacao_vencedores")
            .upsert(
              {
                item_id: item.id,
                razao_social: v.razaoSocial,
                cnpj: v.cnpjVencedor,
                valor_final: v.valorFinal,
              },
              { onConflict: "item_id" }
            );

          if (!winErr) winnersFound++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalProcessed,
        winnersFound,
        hasMore,
        modalidade,
        pagina,
        dataInicial,
        dataFinal,
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

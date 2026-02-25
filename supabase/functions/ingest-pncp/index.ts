import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PNCP_CONSULTA_URL = "https://pncp.gov.br/api/consulta/v1";
const PNCP_DATA_URL = "https://pncp.gov.br/api/pncp/v1";
const PAGE_SIZE = 50;

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

function safeParseJSON(text: string): any {
  if (!text || !text.trim()) return [];
  try {
    return JSON.parse(text);
  } catch {
    const lastBrace = text.lastIndexOf("}");
    if (lastBrace > 0) {
      try {
        return JSON.parse(text.substring(0, lastBrace + 1) + "]");
      } catch { /* fall through */ }
    }
    return null;
  }
}

/**
 * Two modes:
 * 
 * MODE 1 - "ingest" (default): Fast bulk ingestion of licitações
 *   Body: { dataInicial, dataFinal, modalidade, pagina }
 * 
 * MODE 2 - "winners": Fetch winners for licitações that don't have them yet
 *   Body: { mode: "winners", limit?: number }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "ingest";

  try {
    if (mode === "winners") {
      return await handleWinners(supabase, body);
    }
    return await handleIngest(supabase, body);
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleIngest(supabase: any, body: any) {
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const dataInicial: string = body.dataInicial || "20230101";
  const dataFinal: string = body.dataFinal || today;
  const modalidade: number = body.modalidade || 6;
  const pagina: number = body.pagina || 1;

  const url = `${PNCP_CONSULTA_URL}/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;
  console.log("Fetching:", url);

  const response = await fetchWithRetry(url);

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Mod ${modalidade} pag ${pagina} error ${response.status}: ${errorText.slice(0, 200)}`);
    return new Response(
      JSON.stringify({ success: true, totalProcessed: 0, hasMore: false, modalidade, pagina }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const responseText = await response.text();
  const data = safeParseJSON(responseText);
  if (data === null) {
    console.warn(`Unparseable response mod ${modalidade} pag ${pagina}`);
    return new Response(
      JSON.stringify({ success: true, totalProcessed: 0, hasMore: false, modalidade, pagina }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const contratacoes: PNCPContratacao[] = data.data || (Array.isArray(data) ? data : []);
  const hasMore = contratacoes.length >= PAGE_SIZE;
  let totalProcessed = 0;

  console.log(`Mod ${modalidade} pag ${pagina}: ${contratacoes.length} contratações`);

  const licitacoesRows = contratacoes.map((c) => ({
    id_origem: c.numeroControlePNCP || `pncp-${Date.now()}-${Math.random()}`,
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
  }));

  for (let i = 0; i < licitacoesRows.length; i += 50) {
    const batch = licitacoesRows.slice(i, i + 50);
    const { error } = await supabase.from("licitacoes").upsert(batch, { onConflict: "id_origem,fonte" });
    if (error) {
      console.error("Upsert error:", error.message);
    } else {
      totalProcessed += batch.length;
    }
  }

  return new Response(
    JSON.stringify({ success: true, totalProcessed, hasMore, modalidade, pagina }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleWinners(supabase: any, body: any) {
  const batchSize = body.limit || 30;

  // Get licitações that have NO items yet (thus no winners)
  const { data: licitacoes, error: queryErr } = await supabase
    .from("licitacoes")
    .select("id, numero_controle_pncp, raw_json")
    .not("numero_controle_pncp", "is", null)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (queryErr || !licitacoes || licitacoes.length === 0) {
    return new Response(
      JSON.stringify({ success: true, winnersFound: 0, processed: 0, hasMore: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Filter to those without existing items
  const ids = licitacoes.map((l: any) => l.id);
  const { data: existingItems } = await supabase
    .from("licitacao_itens")
    .select("licitacao_id")
    .in("licitacao_id", ids);

  const hasItemsSet = new Set((existingItems || []).map((i: any) => i.licitacao_id));
  const toProcess = licitacoes.filter((l: any) => !hasItemsSet.has(l.id));

  let winnersFound = 0;
  let processed = 0;

  for (const lic of toProcess.slice(0, 20)) { // Process up to 20 per call
    const raw = lic.raw_json;
    const cnpj = raw?.orgaoEntidade?.cnpj || raw?.unidadeOrgao?.cnpj;
    const ano = raw?.anoCompra;
    const seq = raw?.sequencialCompra;

    if (!cnpj || !ano || !seq) {
      // Mark as processed by inserting a placeholder item
      await supabase.from("licitacao_itens").insert({
        licitacao_id: lic.id,
        descricao: raw?.objetoCompra || "Item geral",
        numero_item: 0,
      });
      processed++;
      continue;
    }

    try {
      const itensUrl = `${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens`;
      const itensResp = await fetch(itensUrl, { headers: { Accept: "application/json" } });

      if (!itensResp.ok) {
        await itensResp.text();
        // Insert placeholder so we don't retry
        await supabase.from("licitacao_itens").insert({
          licitacao_id: lic.id,
          descricao: raw?.objetoCompra || "Item geral",
          numero_item: 0,
        });
        processed++;
        continue;
      }

      const itens = await itensResp.json();
      if (!Array.isArray(itens) || itens.length === 0) {
        await supabase.from("licitacao_itens").insert({
          licitacao_id: lic.id,
          descricao: raw?.objetoCompra || "Item geral",
          numero_item: 0,
        });
        processed++;
        continue;
      }

      // Process up to 5 items per licitação to avoid timeout
      for (const item of itens.slice(0, 5)) {
        const seqItem = item.numeroItem || item.sequencialItem;
        if (!seqItem) continue;

        // Upsert the item
        const { data: dbItem } = await supabase
          .from("licitacao_itens")
          .upsert({
            licitacao_id: lic.id,
            descricao: item.descricao || item.materialOuServico || "Item",
            numero_item: seqItem,
            quantidade: item.quantidade || null,
            unidade: item.unidadeMedida || null,
            valor_unitario_estimado: item.valorUnitarioEstimado || null,
          }, { onConflict: "licitacao_id,numero_item" })
          .select("id")
          .single();

        if (!dbItem) continue;

        // Check if item has results
        if (item.temResultado) {
          try {
            const resultUrl = `${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${seqItem}/resultados`;
            const resultResp = await fetch(resultUrl, { headers: { Accept: "application/json" } });
            if (resultResp.ok) {
              const resultados = await resultResp.json();
              const resultList = Array.isArray(resultados) ? resultados : [resultados];
              for (const r of resultList) {
                if (r?.nomeRazaoSocialFornecedor || r?.niFornecedor) {
                  const { error: winErr } = await supabase
                    .from("licitacao_vencedores")
                    .upsert({
                      item_id: dbItem.id,
                      razao_social: r.nomeRazaoSocialFornecedor || "Não informado",
                      cnpj: r.niFornecedor || null,
                      valor_final: r.valorTotalHomologado || r.valorUnitarioHomologado || null,
                      percentual_desconto: r.percentualDesconto || null,
                    }, { onConflict: "item_id" });
                  if (!winErr) winnersFound++;
                  break; // Only first winner per item
                }
              }
            } else {
              await resultResp.text();
            }
          } catch { /* skip */ }
        }
      }
      processed++;
    } catch (e) {
      console.warn(`Error fetching winners for ${lic.numero_controle_pncp}:`, e);
      processed++;
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      winnersFound,
      processed,
      remaining: toProcess.length - Math.min(20, toProcess.length),
      hasMore: toProcess.length > 20,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

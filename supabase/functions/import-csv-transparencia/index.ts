import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseBRL(value: string | undefined | null): number {
  if (!value || value.trim() === "" || value === "--") return 0;
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
}

function parseCSVLine(line: string, sep = ";"): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// Normalize header for matching: remove accents, lowercase, trim quotes
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function findCol(headers: string[], ...patterns: string[]): number {
  for (const pat of patterns) {
    const np = norm(pat);
    const idx = headers.findIndex(h => norm(h) === np || norm(h).includes(np));
    if (idx >= 0) return idx;
  }
  return -1;
}

function extractMonth(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length >= 2) return parseInt(parts[1], 10) || null;
  return null;
}

// ═══════════════════════════════════════════════════════════
// The government ZIP has MULTIPLE CSVs that are RELATED:
//
// 1. Despesas_Empenho.csv → main record with órgão, favorecido, valor empenhado
//    Key: "Código Empenho"
//    Has: Código Órgão Superior, Nome Órgão Superior, Código Favorecido,
//         Nome Favorecido, Valor Empenhado (R$), Data Emissão
//
// 2. Despesas_Liquidacao.csv → liquidation events
//    Key: relates to empenho via Liquidacao_EmpenhosImpactados
//
// 3. Despesas_Liquidacao_EmpenhosImpactados.csv
//    Key: "Código Empenho" + "Valor Liquidado (R$)"
//
// 4. Despesas_Pagamento.csv → payment events
//    Key: relates to empenho via Pagamento_EmpenhosImpactados
//
// 5. Despesas_Pagamento_EmpenhosImpactados.csv
//    Key: "Código Empenho" + "Valor Pago (R$)"
//
// STRATEGY: Parse Empenho as master, then enrich with
// Liquidacao_EmpenhosImpactados and Pagamento_EmpenhosImpactados
// ═══════════════════════════════════════════════════════════

interface EmpenhoRecord {
  codigoEmpenho: string;
  orgaoCodigo: string;
  orgaoNome: string;
  fornecedorId: string;
  fornecedorNome: string;
  empenhado: number;
  liquidado: number;
  pago: number;
  dataEmissao: string;
  mes: number;
  ano: number;
}

function parseCSVToRows(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };

  // Detect separator: if first line has tabs and no semicolons, use tab
  const sep = lines[0].includes("\t") && !lines[0].includes(";") ? "\t" : ";";
  const headers = parseCSVLine(lines[0], sep);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCSVLine(lines[i], sep));
  }
  return { headers, rows };
}

interface DailyPayment {
  data_pagamento: string; // YYYY-MM-DD
  orgao_codigo: string;
  orgao_nome: string;
  cnpj_favorecido: string;
  nome_favorecido: string;
  total_pago_dia: number;
  numero_empenhos: number;
}

function processGovernmentZip(
  csvTexts: Array<{ name: string; text: string }>,
  anoParam: string | null,
): {
  entries: Array<{
    orgao_codigo: string; orgao_nome: string;
    fornecedor_id: string; fornecedor_nome: string;
    ano: number; mes: number;
    empenhado: number; liquidado: number; pago: number; count: number;
  }>;
  dailyPayments: DailyPayment[];
  dailyValidation: Array<{ data_pagamento: string; total_governo: number; total_empresas: number; divergencia: number; status: string }>;
  totalRows: number;
  orgaos: Set<string>;
  erros: string[];
  filesUsed: string[];
  totals: { empenhado: number; liquidado: number; pago: number };
} {
  const erros: string[] = [];
  const filesUsed: string[] = [];

  // Find the relevant CSVs by name pattern
  const find = (pattern: string) => csvTexts.find(c => c.name.toLowerCase().includes(pattern.toLowerCase()));

  const empenhoFile = find("Despesas_Empenho.csv") || find("Empenho.csv");
  const liqImpactFile = find("Liquidacao_EmpenhosImpactados");
  const pagImpactFile = find("Pagamento_EmpenhosImpactados");
  const pagFavFile = find("Pagamento_FavorecidosFinais");
  const pagamentoFile = find("Despesas_Pagamento.csv");

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Parse Empenho (master records)
  // ═══════════════════════════════════════════════════════════
  const empenhos: Record<string, EmpenhoRecord> = {};
  let totalRows = 0;

  if (empenhoFile) {
    const { headers, rows } = parseCSVToRows(empenhoFile.text);
    console.log(`  📋 Empenho headers: ${headers.slice(0, 8).join(" | ")}`);

    const colCodEmpenho = findCol(headers, "Codigo Empenho", "Código Empenho");
    const colOrgCodigo = findCol(headers, "Codigo Orgao Superior", "Código Órgão Superior");
    const colOrgNome = findCol(headers, "Nome Orgao Superior", "Nome Órgão Superior");
    const colFornId = findCol(headers, "Codigo Favorecido", "Código Favorecido");
    const colFornNome = findCol(headers, "Nome Favorecido");
    const colEmpenhado = findCol(headers, "Valor Empenhado", "Valor do Empenho");
    const colData = findCol(headers, "Data Emissao", "Data Emissão");

    console.log(`  🗺️ Empenho map: cod=${colCodEmpenho} org=${colOrgCodigo} forn=${colFornId} emp=${colEmpenhado} data=${colData}`);

    if (colCodEmpenho < 0 || colOrgCodigo < 0) {
      erros.push(`Empenho: colunas essenciais não encontradas (CodEmpenho=${colCodEmpenho}, OrgCodigo=${colOrgCodigo})`);
    } else {
      for (const row of rows) {
        const codEmpenho = row[colCodEmpenho] || "";
        if (!codEmpenho) continue;

        const orgCodigo = row[colOrgCodigo] || "";
        const dataEmissao = colData >= 0 ? (row[colData] || "") : "";
        const mes = extractMonth(dataEmissao) || 1;
        let ano = anoParam ? parseInt(anoParam, 10) : new Date().getFullYear();
        if (!anoParam && dataEmissao) {
          const parts = dataEmissao.split("/");
          if (parts.length === 3) ano = parseInt(parts[2], 10) || ano;
        }

        empenhos[codEmpenho] = {
          codigoEmpenho: codEmpenho,
          orgaoCodigo: orgCodigo,
          orgaoNome: colOrgNome >= 0 ? (row[colOrgNome] || "") : "",
          fornecedorId: colFornId >= 0 ? (row[colFornId] || "SEM_CNPJ") : "SEM_CNPJ",
          fornecedorNome: colFornNome >= 0 ? (row[colFornNome] || "") : "",
          empenhado: colEmpenhado >= 0 ? parseBRL(row[colEmpenhado]) : 0,
          liquidado: 0,
          pago: 0,
          dataEmissao,
          mes,
          ano,
        };
        totalRows++;
      }
      filesUsed.push(empenhoFile.name);
      console.log(`  ✅ Empenho: ${Object.keys(empenhos).length} registros`);
    }
  } else {
    erros.push("Arquivo Despesas_Empenho.csv não encontrado no ZIP");
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Enrich with Liquidacao_EmpenhosImpactados
  // ═══════════════════════════════════════════════════════════
  if (liqImpactFile && Object.keys(empenhos).length > 0) {
    const { headers, rows } = parseCSVToRows(liqImpactFile.text);
    console.log(`  📋 LiqImpact headers: ${headers.slice(0, 6).join(" | ")}`);

    const colCodEmpenho = findCol(headers, "Codigo Empenho", "Código Empenho");
    const colValorLiq = findCol(headers, "Valor Liquidado");

    if (colCodEmpenho >= 0 && colValorLiq >= 0) {
      let enriched = 0;
      for (const row of rows) {
        const cod = row[colCodEmpenho] || "";
        if (empenhos[cod]) {
          empenhos[cod].liquidado += parseBRL(row[colValorLiq]);
          enriched++;
        }
      }
      filesUsed.push(liqImpactFile.name);
      console.log(`  ✅ Liquidação: ${enriched} registros enriquecidos`);
    } else {
      erros.push(`LiqImpact: colunas não encontradas (CodEmpenho=${colCodEmpenho}, ValorLiq=${colValorLiq})`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Enrich with Pagamento_EmpenhosImpactados
  // ═══════════════════════════════════════════════════════════
  if (pagImpactFile && Object.keys(empenhos).length > 0) {
    const { headers, rows } = parseCSVToRows(pagImpactFile.text);
    console.log(`  📋 PagImpact headers: ${headers.slice(0, 6).join(" | ")}`);

    const colCodEmpenho = findCol(headers, "Codigo Empenho", "Código Empenho");
    const colValorPago = findCol(headers, "Valor Pago");

    if (colCodEmpenho >= 0 && colValorPago >= 0) {
      let enriched = 0;
      for (const row of rows) {
        const cod = row[colCodEmpenho] || "";
        if (empenhos[cod]) {
          empenhos[cod].pago += parseBRL(row[colValorPago]);
          enriched++;
        }
      }
      filesUsed.push(pagImpactFile.name);
      console.log(`  ✅ Pagamento: ${enriched} registros enriquecidos`);
    } else {
      erros.push(`PagImpact: colunas não encontradas (CodEmpenho=${colCodEmpenho}, ValorPago=${colValorPago})`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3.5: Parse Despesas_Pagamento.csv for DAILY payment data
  // THIS IS THE SOURCE OF TRUTH FOR "QUEM RECEBEU"
  // ═══════════════════════════════════════════════════════════
  const dailyMap: Record<string, { total: number; empenhos: Set<string>; orgCod: string; orgNome: string; cnpj: string; nome: string }> = {};
  const rawDailyTotalByDay: Record<string, number> = {};

  if (pagamentoFile) {
    const { headers, rows } = parseCSVToRows(pagamentoFile.text);
    console.log(`  📋 Pagamento headers: ${headers.slice(0, 10).join(" | ")}`);

    const colOrgCod = findCol(headers, "Codigo Orgao Superior", "Código Órgão Superior", "Codigo Orgao");
    const colOrgNome = findCol(headers, "Nome Orgao Superior", "Nome Órgão Superior");
    const colFornId = findCol(headers, "Codigo Favorecido", "Código Favorecido");
    const colFornNome = findCol(headers, "Nome Favorecido", "Favorecido");
    const colValorPago = findCol(headers, "Valor Pago", "Valor Pagamento");
    const colDataPag = findCol(headers, "Data Emissao", "Data Emissão", "Data Pagamento");
    const colEmpenho = findCol(headers, "Codigo Empenho", "Código Empenho");

    console.log(`  🗺️ Pagamento map: org=${colOrgCod} forn=${colFornId} pago=${colValorPago} data=${colDataPag}`);

    if (colValorPago >= 0) {
      let pagRows = 0;
      let estornos = 0;

      for (const row of rows) {
        const valor = parseBRL(row[colValorPago]);
        if (valor <= 0) { if (valor < 0) estornos++; continue; } // Remove estornos

        const dataStr = colDataPag >= 0 ? (row[colDataPag] || "") : "";
        let dataPag = "";
        if (dataStr) {
          const parts = dataStr.split("/");
          if (parts.length === 3) {
            dataPag = `${parts[2]}-${parts[1]}-${parts[0]}`; // DD/MM/YYYY → YYYY-MM-DD
          }
        }
        if (!dataPag) continue;

        const orgCod = colOrgCod >= 0 ? (row[colOrgCod] || "00000") : "00000";
        const orgNome = colOrgNome >= 0 ? (row[colOrgNome] || "") : "";
        const cnpj = colFornId >= 0 ? (row[colFornId] || "SEM_CNPJ") : "SEM_CNPJ";
        const nome = colFornNome >= 0 ? (row[colFornNome] || "") : "";
        const empenho = colEmpenho >= 0 ? (row[colEmpenho] || "") : "";

        const key = `${dataPag}|${orgCod}|${cnpj}`;
        if (!dailyMap[key]) {
          dailyMap[key] = { total: 0, empenhos: new Set(), orgCod, orgNome, cnpj, nome };
        }
        dailyMap[key].total += valor;
        if (empenho) dailyMap[key].empenhos.add(empenho);

        rawDailyTotalByDay[dataPag] = (rawDailyTotalByDay[dataPag] || 0) + valor;
        pagRows++;
      }

      filesUsed.push(pagamentoFile.name);
      console.log(`  ✅ Pagamento diário: ${pagRows} registros válidos, ${estornos} estornos removidos`);
    } else {
      erros.push(`Pagamento: coluna de valor não encontrada`);
    }
  }

  // Build daily payments array
  const dailyPayments: DailyPayment[] = Object.values(dailyMap).map(d => ({
    data_pagamento: Object.entries(dailyMap).find(([, v]) => v === d)?.[0].split("|")[0] || "",
    orgao_codigo: d.orgCod,
    orgao_nome: d.orgNome,
    cnpj_favorecido: d.cnpj,
    nome_favorecido: d.nome,
    total_pago_dia: Number(d.total.toFixed(2)),
    numero_empenhos: d.empenhos.size,
  }));

  // Fix: extract date correctly from key
  const dailyPaymentsFinal: DailyPayment[] = [];
  for (const [key, d] of Object.entries(dailyMap)) {
    const dataPag = key.split("|")[0];
    dailyPaymentsFinal.push({
      data_pagamento: dataPag,
      orgao_codigo: d.orgCod,
      orgao_nome: d.orgNome,
      cnpj_favorecido: d.cnpj,
      nome_favorecido: d.nome,
      total_pago_dia: Number(d.total.toFixed(2)),
      numero_empenhos: d.empenhos.size,
    });
  }

  // Daily validation
  const dailyValidation: Array<{ data_pagamento: string; total_governo: number; total_empresas: number; divergencia: number; status: string }> = [];
  for (const [dia, totalGov] of Object.entries(rawDailyTotalByDay)) {
    const totalEmp = dailyPaymentsFinal
      .filter(d => d.data_pagamento === dia)
      .reduce((s, d) => s + d.total_pago_dia, 0);
    const div = Math.abs(totalEmp - totalGov);
    dailyValidation.push({
      data_pagamento: dia,
      total_governo: Number(totalGov.toFixed(2)),
      total_empresas: Number(totalEmp.toFixed(2)),
      divergencia: Number(div.toFixed(2)),
      status: div < 0.01 ? "ok" : "divergente",
    });
  }

  if (dailyValidation.length > 0) {
    const ok = dailyValidation.filter(v => v.status === "ok").length;
    console.log(`  🔎 Validação diária: ${ok}/${dailyValidation.length} dias sem divergência`);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Fallback Pagamento_FavorecidosFinais
  // ═══════════════════════════════════════════════════════════
  if (pagFavFile && Object.keys(empenhos).length === 0) {
    const { headers, rows } = parseCSVToRows(pagFavFile.text);
    const colFornId = findCol(headers, "Codigo Favorecido", "Código Favorecido");
    const colFornNome = findCol(headers, "Favorecido", "Nome Favorecido");
    const colValor = findCol(headers, "Valor", "Valor Pago");
    const colData = findCol(headers, "Data Emissao", "Data Emissão");

    if (colFornId >= 0) {
      for (const row of rows) {
        const fornId = row[colFornId] || "SEM_CNPJ";
        const valor = colValor >= 0 ? parseBRL(row[colValor]) : 0;
        const dataStr = colData >= 0 ? (row[colData] || "") : "";
        const mes = extractMonth(dataStr) || 1;
        const ano = anoParam ? parseInt(anoParam, 10) : new Date().getFullYear();
        const key = `FAV|${fornId}|${ano}|${mes}`;

        if (!empenhos[key]) {
          empenhos[key] = {
            codigoEmpenho: key, orgaoCodigo: "00000", orgaoNome: "Via Pagamento",
            fornecedorId: fornId, fornecedorNome: colFornNome >= 0 ? (row[colFornNome] || "") : "",
            empenhado: 0, liquidado: 0, pago: 0, dataEmissao: dataStr, mes, ano,
          };
        }
        empenhos[key].pago += valor;
        totalRows++;
      }
      filesUsed.push(pagFavFile.name);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Consolidate by (orgao, fornecedor, ano, mes)
  // ═══════════════════════════════════════════════════════════
  const consolidated: Record<string, {
    orgao_codigo: string; orgao_nome: string;
    fornecedor_id: string; fornecedor_nome: string;
    ano: number; mes: number;
    empenhado: number; liquidado: number; pago: number; count: number;
  }> = {};

  const orgaos = new Set<string>();
  let tEmp = 0, tLiq = 0, tPag = 0;

  for (const emp of Object.values(empenhos)) {
    if (!emp.orgaoCodigo) continue;
    orgaos.add(emp.orgaoCodigo);
    tEmp += emp.empenhado;
    tLiq += emp.liquidado;
    tPag += emp.pago;

    const key = `${emp.orgaoCodigo}|${emp.fornecedorId}|${emp.ano}|${emp.mes}`;
    if (!consolidated[key]) {
      consolidated[key] = {
        orgao_codigo: emp.orgaoCodigo, orgao_nome: emp.orgaoNome,
        fornecedor_id: emp.fornecedorId, fornecedor_nome: emp.fornecedorNome,
        ano: emp.ano, mes: emp.mes,
        empenhado: 0, liquidado: 0, pago: 0, count: 0,
      };
    }
    consolidated[key].empenhado += emp.empenhado;
    consolidated[key].liquidado += emp.liquidado;
    consolidated[key].pago += emp.pago;
    consolidated[key].count++;
  }

  return {
    entries: Object.values(consolidated),
    dailyPayments: dailyPaymentsFinal,
    dailyValidation,
    totalRows,
    orgaos,
    erros,
    filesUsed,
    totals: { empenhado: tEmp, liquidado: tLiq, pago: tPag },
  };
}

// ═══════════════════════════════════════════════════════════
// Also handle SINGLE CSV with flat structure (legacy support)
// ═══════════════════════════════════════════════════════════
function processFlatCSV(
  text: string, anoParam: string | null, fileName: string,
): ReturnType<typeof processGovernmentZip> {
  const { headers, rows } = parseCSVToRows(text);
  const erros: string[] = [];

  if (headers.length === 0) {
    return { entries: [], dailyPayments: [], dailyValidation: [], totalRows: 0, orgaos: new Set(), erros: [`${fileName}: arquivo vazio`], filesUsed: [], totals: { empenhado: 0, liquidado: 0, pago: 0 } };
  }

  console.log(`  📋 Flat CSV headers: ${headers.slice(0, 8).join(" | ")}`);

  const colOrg = findCol(headers, "Codigo Orgao Superior", "Código Órgão Superior", "Codigo Orgao", "Código Órgão");
  const colOrgNome = findCol(headers, "Nome Orgao Superior", "Nome Órgão Superior");
  const colFornId = findCol(headers, "Codigo Favorecido", "Código Favorecido", "CNPJ Favorecido", "CPF/CNPJ Favorecido");
  const colFornNome = findCol(headers, "Nome Favorecido", "Favorecido");
  const colEmp = findCol(headers, "Valor Empenhado");
  const colLiq = findCol(headers, "Valor Liquidado");
  const colPago = findCol(headers, "Valor Pago");
  const colData = findCol(headers, "Data Emissao", "Data Emissão", "Data Pagamento", "Data Empenho");

  if (colOrg < 0) {
    erros.push(`${fileName}: coluna de órgão não encontrada.`);
    return { entries: [], dailyPayments: [], dailyValidation: [], totalRows: 0, orgaos: new Set(), erros, filesUsed: [], totals: { empenhado: 0, liquidado: 0, pago: 0 } };
  }
  if (colEmp < 0 && colLiq < 0 && colPago < 0) {
    erros.push(`${fileName}: nenhuma coluna de valor encontrada.`);
    return { entries: [], dailyPayments: [], dailyValidation: [], totalRows: 0, orgaos: new Set(), erros, filesUsed: [], totals: { empenhado: 0, liquidado: 0, pago: 0 } };
  }

  const consolidated: Record<string, any> = {};
  const orgaos = new Set<string>();
  let totalRows = 0, tEmp = 0, tLiq = 0, tPag = 0;

  // Also build daily payments for flat CSV
  const dailyMap: Record<string, { total: number; orgCod: string; orgNome: string; cnpj: string; nome: string }> = {};
  const rawDailyByDay: Record<string, number> = {};

  for (const row of rows) {
    const orgCodigo = row[colOrg] || "";
    if (!orgCodigo) continue;

    const emp = colEmp >= 0 ? parseBRL(row[colEmp]) : 0;
    const liq = colLiq >= 0 ? parseBRL(row[colLiq]) : 0;
    const pag = colPago >= 0 ? parseBRL(row[colPago]) : 0;

    const dataStr = colData >= 0 ? (row[colData] || "") : "";
    const mes = extractMonth(dataStr) || 1;
    let ano = anoParam ? parseInt(anoParam, 10) : new Date().getFullYear();
    if (!anoParam && dataStr) {
      const parts = dataStr.split("/");
      if (parts.length === 3) ano = parseInt(parts[2], 10) || ano;
    }

    const fornId = colFornId >= 0 ? (row[colFornId] || "SEM_CNPJ") : "SEM_CNPJ";
    const fornNome = colFornNome >= 0 ? (row[colFornNome] || "") : "";
    const orgNome = colOrgNome >= 0 ? (row[colOrgNome] || "") : "";

    orgaos.add(orgCodigo);
    totalRows++;
    tEmp += emp; tLiq += liq; tPag += pag;

    const key = `${orgCodigo}|${fornId}|${ano}|${mes}`;
    if (!consolidated[key]) {
      consolidated[key] = {
        orgao_codigo: orgCodigo, orgao_nome: orgNome,
        fornecedor_id: fornId, fornecedor_nome: fornNome,
        ano, mes, empenhado: 0, liquidado: 0, pago: 0, count: 0,
      };
    }
    consolidated[key].empenhado += emp;
    consolidated[key].liquidado += liq;
    consolidated[key].pago += pag;
    consolidated[key].count++;

    // Daily payment tracking
    if (pag > 0 && dataStr) {
      const parts = dataStr.split("/");
      if (parts.length === 3) {
        const dataPag = `${parts[2]}-${parts[1]}-${parts[0]}`;
        const dKey = `${dataPag}|${orgCodigo}|${fornId}`;
        if (!dailyMap[dKey]) {
          dailyMap[dKey] = { total: 0, orgCod: orgCodigo, orgNome, cnpj: fornId, nome: fornNome };
        }
        dailyMap[dKey].total += pag;
        rawDailyByDay[dataPag] = (rawDailyByDay[dataPag] || 0) + pag;
      }
    }
  }

  const dailyPayments: DailyPayment[] = [];
  for (const [key, d] of Object.entries(dailyMap)) {
    dailyPayments.push({
      data_pagamento: key.split("|")[0],
      orgao_codigo: d.orgCod, orgao_nome: d.orgNome,
      cnpj_favorecido: d.cnpj, nome_favorecido: d.nome,
      total_pago_dia: Number(d.total.toFixed(2)), numero_empenhos: 0,
    });
  }

  const dailyValidation = Object.entries(rawDailyByDay).map(([dia, totalGov]) => {
    const totalEmp = dailyPayments.filter(d => d.data_pagamento === dia).reduce((s, d) => s + d.total_pago_dia, 0);
    const div = Math.abs(totalEmp - totalGov);
    return { data_pagamento: dia, total_governo: Number(totalGov.toFixed(2)), total_empresas: Number(totalEmp.toFixed(2)), divergencia: Number(div.toFixed(2)), status: div < 0.01 ? "ok" : "divergente" };
  });

  return {
    entries: Object.values(consolidated),
    dailyPayments, dailyValidation,
    totalRows, orgaos, erros,
    filesUsed: totalRows > 0 ? [fileName] : [],
    totals: { empenhado: tEmp, liquidado: tLiq, pago: tPag },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SYNC_SECRET = Deno.env.get("SYNC_SECRET");
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const start = Date.now();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const anoParam = formData.get("ano") as string | null;
    const replaceExisting = formData.get("replace") === "true";

    if (!file) {
      return new Response(JSON.stringify({ success: false, error: "Nenhum arquivo enviado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isZip = file.name.toLowerCase().endsWith(".zip");
    console.log(`📂 Arquivo: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) [${isZip ? "ZIP" : "CSV"}]`);

    let result: ReturnType<typeof processGovernmentZip>;

    if (isZip) {
      // Extract all CSVs from ZIP
      const csvTexts: Array<{ name: string; text: string }> = [];
      const blob = new Blob([await file.arrayBuffer()]);
      const reader = new ZipReader(new BlobReader(blob));
      const zipEntries = await reader.getEntries();
      console.log(`📦 ZIP contém ${zipEntries.length} arquivo(s)`);

      for (const entry of zipEntries) {
        const name = entry.filename || "";
        if (entry.directory || !name.toLowerCase().endsWith(".csv")) continue;
        // Extract just the filename without path
        const shortName = name.includes("/") ? name.split("/").pop()! : name;
        console.log(`  📄 Extraindo: ${shortName} (${((entry.uncompressedSize || 0) / 1024 / 1024).toFixed(1)}MB)`);

        if (entry.getData) {
          const writer = new TextWriter("iso-8859-1");
          const text = await entry.getData(writer);
          csvTexts.push({ name: shortName, text });
        }
      }
      await reader.close();

      if (csvTexts.length === 0) {
        return new Response(JSON.stringify({
          success: false, error: "Nenhum CSV encontrado no ZIP",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Use government multi-file strategy
      result = processGovernmentZip(csvTexts, anoParam);
    } else {
      // Single CSV - flat format
      const buffer = await file.arrayBuffer();
      const decoder = new TextDecoder("iso-8859-1");
      const text = decoder.decode(buffer);
      result = processFlatCSV(text, anoParam, file.name);
    }

    const { entries, dailyPayments, dailyValidation, totalRows, orgaos, erros, filesUsed, totals } = result;

    console.log(`\n✅ Total: ${totalRows} registros → ${entries.length} consolidados`);
    console.log(`💰 Emp: R$ ${(totals.empenhado / 1e9).toFixed(2)}B | Liq: R$ ${(totals.liquidado / 1e9).toFixed(2)}B | Pago: R$ ${(totals.pago / 1e9).toFixed(2)}B`);
    console.log(`📁 Arquivos usados: ${filesUsed.join(", ")}`);
    console.log(`📅 Pagamentos diários: ${dailyPayments.length} registros`);

    if (entries.length === 0 && dailyPayments.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "Nenhum registro válido encontrado",
        totalRows, arquivosUsados: filesUsed,
        erros: erros.length > 0 ? erros : undefined,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Delete existing CSV data if requested
    const anosPresentes = [...new Set(entries.map(e => e.ano))];
    if (replaceExisting) {
      for (const ano of anosPresentes) {
        for (const org of orgaos) {
          await supabase.from("execucao_unificada").delete()
            .eq("orgao_codigo", org).eq("ano", ano).eq("fonte_dados", "csv-portal-transparencia");
        }
      }
    }

    // Insert monthly consolidated into execucao_unificada
    let insertedCount = 0;
    const batchSize = 200;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize).map(v => ({
        orgao_codigo: v.orgao_codigo, orgao_nome: v.orgao_nome,
        fornecedor_nome: v.fornecedor_nome, fornecedor_id: v.fornecedor_id,
        ano: v.ano, mes: v.mes,
        data_execucao_padronizada: `${v.ano}-${String(v.mes).padStart(2, "0")}-01`,
        empenhado_total: v.empenhado, liquidado_total: v.liquidado, pago_total: v.pago,
        fonte_dados: "csv-portal-transparencia",
        chave_dedup: `csv|${v.orgao_codigo}|${v.fornecedor_id}|${v.ano}|${v.mes}`,
      }));

      const { error } = await supabase.from("execucao_unificada").insert(batch);
      if (error) {
        console.error(`Insert batch ${i}:`, error.message);
        erros.push(`Batch ${i}: ${error.message}`);
      } else {
        insertedCount += batch.length;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // INSERT DAILY PAYMENTS — execucao_diaria_empresa
    // REGRA: SUM(empresa/dia) == TOTAL(governo/dia) — sem divergência
    // ═══════════════════════════════════════════════════════════
    let dailyInserted = 0;
    if (dailyPayments.length > 0) {
      // Delete existing daily data for affected dates
      const datesAffected = [...new Set(dailyPayments.map(d => d.data_pagamento))];
      for (const dia of datesAffected) {
        await supabase.from("execucao_diaria_empresa").delete().eq("data_pagamento", dia);
        await supabase.from("consolidacao_diaria_validacao").delete().eq("data_pagamento", dia);
      }

      // Insert daily payments
      for (let i = 0; i < dailyPayments.length; i += batchSize) {
        const batch = dailyPayments.slice(i, i + batchSize).map(d => ({
          ...d,
          fonte_dados: "csv-portal-transparencia",
        }));
        const { error } = await supabase.from("execucao_diaria_empresa").upsert(batch, {
          onConflict: "data_pagamento,orgao_codigo,cnpj_favorecido",
        });
        if (error) {
          console.error(`Daily insert batch ${i}:`, error.message);
          erros.push(`Daily batch ${i}: ${error.message}`);
        } else {
          dailyInserted += batch.length;
        }
      }

      // Insert daily validation records
      for (const v of dailyValidation) {
        await supabase.from("consolidacao_diaria_validacao").upsert({
          data_pagamento: v.data_pagamento,
          total_governo: v.total_governo,
          total_empresas: v.total_empresas,
          divergencia: v.divergencia,
          divergencia_pct: v.total_governo > 0 ? Number(((v.divergencia / v.total_governo) * 100).toFixed(4)) : 0,
          status: v.status,
          paginas_processadas: 0,
          registros_brutos: totalRows,
          registros_anulados_removidos: 0,
          registros_duplicados_removidos: 0,
          detalhes: { fonte: "csv-portal-transparencia", arquivo: file.name },
        }, { onConflict: "data_pagamento" });
      }

      const diasOK = dailyValidation.filter(v => v.status === "ok").length;
      const diasDiv = dailyValidation.filter(v => v.status === "divergente").length;
      console.log(`\n🔎 Validação diária: ${diasOK} OK, ${diasDiv} divergentes de ${dailyValidation.length} dias`);
    }

    const durationMs = Date.now() - start;
    await supabase.from("api_logs").insert({
      api_name: "import-csv-transparencia", endpoint: file.name,
      status: erros.length > 0 ? "partial" : "success",
      error_message: erros.length > 0 ? erros.slice(0, 5).join("; ") : null,
      records_imported: insertedCount + dailyInserted, response_time_ms: durationMs,
    });

    for (const orgCode of orgaos) {
      const orgEntries = entries.filter(e => e.orgao_codigo === orgCode);
      const orgTotal = orgEntries.reduce((s, e) => s + e.pago, 0);
      await supabase.from("processing_logs").insert({
        orgao_codigo: orgCode, orgao_nome: orgEntries[0]?.orgao_nome || orgCode,
        ano: anosPresentes[0] || new Date().getFullYear(), etapa: "csv_import",
        registros_importados: orgEntries.reduce((s, e) => s + e.count, 0),
        registros_consolidados: orgEntries.length,
        total_bruto: orgTotal, total_consolidado: orgTotal, diferenca_pct: 0,
        detalhes: { arquivo: file.name, csvs: filesUsed, fonte: "csv-portal-transparencia", dailyRecords: dailyInserted },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      arquivo: file.name,
      tamanho_mb: Number((file.size / 1024 / 1024).toFixed(1)),
      arquivosCSV: filesUsed.length,
      arquivosNomes: filesUsed,
      totalLinhas: totalRows,
      registrosConsolidados: entries.length,
      registrosInseridos: insertedCount,
      pagamentosDiarios: dailyInserted,
      orgaos: orgaos.size,
      anos: anosPresentes,
      totais: {
        empenhado: totals.empenhado, liquidado: totals.liquidado, pago: totals.pago,
        empenhado_formatado: `R$ ${(totals.empenhado / 1e9).toFixed(2)}B`,
        liquidado_formatado: `R$ ${(totals.liquidado / 1e9).toFixed(2)}B`,
        pago_formatado: `R$ ${(totals.pago / 1e9).toFixed(2)}B`,
      },
      validacaoDiaria: {
        totalDias: dailyValidation.length,
        diasOK: dailyValidation.filter(v => v.status === "ok").length,
        diasDivergentes: dailyValidation.filter(v => v.status === "divergente").length,
        integridade: dailyValidation.every(v => v.status === "ok") ? "OK" : "DIVERGENTE",
      },
      durationMs,
      erros: erros.length > 0 ? erros : undefined,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Import error:", msg);
    await supabase.from("api_logs").insert({
      api_name: "import-csv-transparencia", endpoint: "upload",
      status: "error", error_message: msg, response_time_ms: Date.now() - start,
    });
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

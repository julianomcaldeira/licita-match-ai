export type SegmentoDetalhe = {
  nome: string;
  valor_atual: number;
  valor_anterior: number;
  var_pct: number | null;
  share_pct: number;
};

export type IndiceData = {
  mes_referencia: string; // YYYY-MM
  indice_startgi: number | null;
  valor_total_brl: number;
  valor_total_brl_anterior?: number | null;
  volume_contratos: number;
  variacao_mom: number | null;
  variacao_yoy: number | null;
  breakdown_modalidade: Record<string, number>;
  breakdown_esfera: Record<string, number>;
  breakdown_segmento: Record<string, number>;
  segmentos_detalhe?: SegmentoDetalhe[];
  destaque_segmento: string | null;
  destaque_variacao: number | null;
  dados_parciais: boolean;
  ultima_atualizacao: string;
  top_orgao_nome?: string | null;
  top_orgao_valor?: number | null;
  top_fornecedor_nome?: string | null;
  top_fornecedor_valor?: number | null;
  top_modalidade?: string | null;
  top_modalidade_share?: number | null;
  maior_contrato_valor?: number | null;
  maior_contrato_objeto?: string | null;
  ticket_medio?: number | null;
  orgaos_unicos?: number | null;
  fornecedores_unicos?: number | null;
};

function mesAnteriorCurto(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${MESES_ABREV[d.getMonth()].toLowerCase()}/${String(d.getFullYear()).slice(2)}`;
}

export function buildAnaliseHighlights(d: IndiceData): string[] {
  const valor = Number(d.valor_total_brl || 0);
  const valorAnt = Number(d.valor_total_brl_anterior || 0);
  const deltaPct = valorAnt > 0 ? ((valor - valorAnt) / valorAnt) * 100 : null;
  const segs = (d.segmentos_detalhe ?? [])
    .filter((s) => s.valor_atual > 0)
    .sort((a, b) => b.valor_atual - a.valor_atual);
  const outros = segs.find((s) => s.nome === "Outros");
  const nomeados = segs.filter((s) => s.nome !== "Outros");
  const lider = nomeados[0];
  const vice = nomeados[1];

  const linhas: string[] = [];
  linhas.push(
    `${mesLabel(d.mes_referencia)} fechou em ${formatBRL(valor)} e ${d.volume_contratos.toLocaleString("pt-BR")} contratos, com ticket médio de ${formatBRL(d.ticket_medio ?? 0)}.`
  );

  if (deltaPct != null) {
    linhas.push(
      `Vs ${mesAnteriorCurto(d.mes_referencia)}, o volume ${deltaPct >= 0 ? "avançou" : "recuou"} ${formatPct(Math.abs(deltaPct))}.`
    );
  }

  if (lider && vice) {
    if ((outros?.share_pct ?? 0) >= 45) {
      linhas.push(
        `A rubrica Outros concentrou ${formatNum(outros?.share_pct)}% do volume; entre os segmentos nomeados, ${lider.nome} liderou com ${formatBRL(lider.valor_atual)} e ${vice.nome} veio na sequência com ${formatBRL(vice.valor_atual)}.`
      );
    } else {
      linhas.push(
        `${lider.nome} liderou o recorte setorial com ${formatBRL(lider.valor_atual)} (${formatNum(lider.share_pct)}% do total), seguido por ${vice.nome} com ${formatBRL(vice.valor_atual)}.`
      );
    }
  } else if (lider) {
    linhas.push(`${lider.nome} foi o principal segmento do mês, com ${formatBRL(lider.valor_atual)}.`);
  } else if (outros) {
    linhas.push(`A classificação setorial disponível concentrou ${formatBRL(outros.valor_atual)} em Outros (${formatNum(outros.share_pct)}% do total).`);
  }

  return linhas.slice(0, 3);
}

/** Análise textual assertiva do mês selecionado, gerada apenas com dados reais do PNCP. */
export function buildAnaliseMes(d: IndiceData): string {
  return buildAnaliseHighlights(d).join(" ");
}


const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export function mesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MESES_PT[Number(m) - 1]} ${y}`;
}
export function mesAbrev(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MESES_ABREV[Number(m) - 1]}/${y.slice(2)}`;
}

export function formatBRL(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "R$ 0";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `R$ ${(n / 1e12).toFixed(1).replace(".", ",")} tri`;
  if (abs >= 1e9)  return `R$ ${(n / 1e9).toFixed(1).replace(".", ",")} bi`;
  if (abs >= 1e6)  return `R$ ${(n / 1e6).toFixed(1).replace(".", ",")} mi`;
  return `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
}

export function formatNum(v: number | null | undefined, digits = 1): string {
  if (v == null || !isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !isFinite(Number(v))) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function getLastClosedMonth(today = new Date()): string {
  const ref = new Date(today);
  // mês "fechado" só após dia 10 do mês seguinte
  // se hoje < dia 10, o último fechado é (mês anterior - 1); se >= dia 10, é (mês anterior)
  ref.setDate(1);
  if (today.getDate() < 10) ref.setMonth(ref.getMonth() - 2);
  else ref.setMonth(ref.getMonth() - 1);
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function listLast12Months(reference: string): string[] {
  const [yy, mm] = reference.split("-").map(Number);
  const out: string[] = [];
  const d = new Date(yy, mm - 1, 1);
  for (let i = 11; i >= 0; i--) {
    const cur = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function listMonthOptions(rangeYears = 3): { value: string; label: string }[] {
  const today = new Date();
  const start = new Date(2024, 0, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 1);
  const out: { value: string; label: string }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const v = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value: v, label: mesLabel(v) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out.reverse();
}

export function nextMonthName(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m, 1);
  return MESES_PT[d.getMonth()];
}

export function buildPostText(d: IndiceData): string {
  const esfera = d.breakdown_esfera || {};
  const fed = Math.round(esfera.federal || 0);
  const est = Math.round(esfera.estadual || 0);
  const mun = Math.round(esfera.municipal || 0);
  const segs = (d.segmentos_detalhe ?? [])
    .filter((s) => s.valor_atual > 0)
    .sort((a, b) => b.valor_atual - a.valor_atual)
    .slice(0, 5);
  const segLinhas = segs.map((s) => {
    const v = s.var_pct != null ? ` (${formatPct(s.var_pct)} vs mês anterior)` : "";
    return `• ${s.nome}: ${formatBRL(s.valor_atual)} — ${formatNum(s.share_pct)}% do total${v}`;
  }).join("\n");

  const multiploBase = d.indice_startgi != null ? d.indice_startgi / 100 : null;

  return `📊 Índice StartGi de Compras Governamentais — ${mesLabel(d.mes_referencia)}

${buildAnaliseMes(d)}

📈 Índice StartGi: ${formatNum(d.indice_startgi)} pts${multiploBase != null ? `, equivalente a ${formatNum(multiploBase)}x a base jan/24 = 100` : ""} (${formatPct(d.variacao_mom)} vs mês anterior · ${formatPct(d.variacao_yoy)} vs ano anterior)

🏷️ Segmentos do mês:
${segLinhas || "• Sem dados de segmento."}

🏛️ Esferas: ${fed}% Federal · ${est}% Estadual · ${mun}% Municipal

Dados consolidados pelo iPesquisei com base no PNCP.

#ÍndiceStartGi #ComprasGovernamentais #LicitaçõesBrasil #GovTech #StartGi`;
}

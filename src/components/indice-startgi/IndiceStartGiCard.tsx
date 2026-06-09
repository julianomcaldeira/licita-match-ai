import { IndiceData, formatBRL, formatNum, formatPct, mesLabel, nextMonthName, buildAnaliseHighlights, SegmentoDetalhe } from "@/lib/indiceStartGi";
import { TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import logoAsset from "@/assets/startgi-logo.jpg.asset.json";

interface Props {
  data: IndiceData;
  variant?: "feed" | "story";
}

// Paleta StartGi
const GREEN = "#16a34a";
const GREEN_DARK = "#15803d";
const GREEN_SOFT = "#dcfce7";
const INK = "#0b1220";
const INK_SOFT = "#475569";
const MUTED = "#94a3b8";
const LINE = "#e2e8f0";
const BG = "#ffffff";
const BG_SOFT = "#f8fafc";
const SEGMENTOS_FIXOS = ["Saúde", "Obras", "Serviços Gerais", "Educação", "TI e Telecom", "Outros"];

function mesAntLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${meses[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

/** Garante uma lista de segmentos mesmo quando `segmentos_detalhe` vier vazio. */
function resolveSegmentos(data: IndiceData): SegmentoDetalhe[] {
  const det = (data.segmentos_detalhe ?? []).filter((s) => s.valor_atual > 0);
  const breakdown = data.breakdown_segmento || {};
  const total = Number(data.valor_total_brl || 0);
  const base = det.length > 0 ? det : Object.entries(breakdown)
    .map(([nome, share]) => ({
      nome,
      share_pct: Number(share) || 0,
      valor_atual: total * (Number(share) || 0) / 100,
      valor_anterior: 0,
      var_pct: null,
    }))
    .filter((s) => s.share_pct > 0);

  const mapa = new Map(base.map((s) => [s.nome, s]));
  const completos = SEGMENTOS_FIXOS.map((nome) => mapa.get(nome) ?? {
    nome,
    share_pct: 0,
    valor_atual: 0,
    valor_anterior: 0,
    var_pct: null,
  });
  const extras = base.filter((s) => !SEGMENTOS_FIXOS.includes(s.nome));

  return [...completos, ...extras].sort((a, b) => {
    if (a.nome === "Outros" && b.nome !== "Outros") return 1;
    if (b.nome === "Outros" && a.nome !== "Outros") return -1;
    return b.valor_atual - a.valor_atual;
  });
}

export default function IndiceStartGiCard({ data, variant = "feed" }: Props) {
  const isStory = variant === "story";
  const W = 1080;
  const H = isStory ? 1920 : 1080;
  const PAD = isStory ? 68 : 40;

  const esfera = data.breakdown_esfera || {};
  const fed = Number(esfera.federal || 0);
  const est = Number(esfera.estadual || 0);
  const mun = Number(esfera.municipal || 0);
  const out = Math.max(0, 100 - fed - est - mun);

  const varMom = data.variacao_mom;
  const varYoy = data.variacao_yoy;
  const mesAnt = mesAntLabel(data.mes_referencia);

  const segs = resolveSegmentos(data)
    .slice(0, 6);

  const analise = buildAnaliseHighlights(data);
  const indiceMultiplo = data.indice_startgi != null ? data.indice_startgi / 100 : null;
  const esferaItems = [
    { label: "Federal", value: fed, color: GREEN_DARK },
    { label: "Estadual", value: est, color: GREEN },
    { label: "Municipal", value: mun, color: "#86efac" },
    { label: "Outros", value: out, color: "#cbd5e1" },
  ].filter((item) => item.value > 0);
  const esferaLider = [...esferaItems].sort((a, b) => b.value - a.value)[0];

  const TrendPill = ({ v, label }: { v: number | null; label: string }) => {
    if (v == null) {
      return (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "10px 16px", borderRadius: 999,
          background: BG_SOFT, border: `1px solid ${LINE}`,
          fontSize: 15, fontWeight: 600, color: INK_SOFT,
        }}>
          <Minus size={16} color={MUTED} />
          <span style={{ color: MUTED, fontWeight: 700 }}>—</span>
          <span style={{ opacity: 0.7 }}>{label}</span>
        </div>
      );
    }
    const pos = v >= 0;
    const Icon = pos ? TrendingUp : TrendingDown;
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderRadius: 999,
        background: pos ? GREEN_SOFT : "#fee2e2",
        border: `1px solid ${pos ? "#bbf7d0" : "#fecaca"}`,
        fontSize: 15, fontWeight: 700,
        color: pos ? "#166534" : "#991b1b",
      }}>
        <Icon size={16} />
        {formatPct(v)}
        <span style={{ fontWeight: 500, opacity: 0.85 }}>{label}</span>
      </div>
    );
  };

  const VarBadge = ({ v }: { v: number | null }) => {
    if (v == null) return <span style={{ color: MUTED, fontSize: 13, fontWeight: 600 }}>—</span>;
    const pos = v >= 0;
    const Icon = v === 0 ? Minus : pos ? ArrowUpRight : ArrowDownRight;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 700,
        background: pos ? GREEN_SOFT : "#fee2e2",
        color: pos ? "#166534" : "#991b1b",
      }}>
        <Icon size={13} /> {formatPct(v)}
      </span>
    );
  };

  return (
    <div
      style={{
        width: W,
        height: H,
        background: BG,
        color: INK,
        fontFamily: "'Inter', system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{
        height: 8, background: `linear-gradient(90deg, ${GREEN_DARK}, ${GREEN}, #4ade80)`,
      }} />

      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateRows: "auto auto minmax(0, 1fr) auto",
        gap: isStory ? 24 : 14,
        padding: `${PAD - 8}px ${PAD}px ${PAD}px`,
        position: "relative",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1, gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img
              src={logoAsset.url}
              alt="StartGi"
              crossOrigin="anonymous"
              style={{ height: isStory ? 110 : 88, width: "auto", objectFit: "contain", display: "block" }}
            />
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 12, fontWeight: 800, color: GREEN_DARK,
              textTransform: "uppercase", letterSpacing: 4,
            }}>
              Índice StartGi
            </div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: isStory ? 34 : 28, fontWeight: 700, color: INK, marginTop: 2,
            }}>
              {mesLabel(data.mes_referencia)}
            </div>
            <div style={{ fontSize: 13, color: INK_SOFT, marginTop: 4 }}>
              Termômetro das compras públicas · Brasil
            </div>
          </div>
        </div>


        {data.dados_parciais && (
          <div style={{
            display: "inline-flex", alignSelf: "flex-start",
            alignItems: "center", gap: 8,
            background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 999,
            padding: "6px 14px", color: "#92400e", fontSize: 12, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 1.5, zIndex: 1,
          }}>
            <AlertTriangle size={13} />
            Dados parciais · fechamento dia 10 de {nextMonthName(data.mes_referencia)}
          </div>
        )}

        <div style={{
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1.14fr 0.86fr",
          gap: 14,
          alignItems: "stretch",
        }}>
          <div style={{
            minWidth: 0,
            borderRadius: 24,
            background: "linear-gradient(180deg, #f7fcf8 0%, #ffffff 100%)",
            border: `1px solid ${LINE}`,
            padding: isStory ? "28px 30px" : "22px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}>
            <div style={{
              fontSize: 12, fontWeight: 800, color: GREEN_DARK,
              textTransform: "uppercase", letterSpacing: 3, marginBottom: 10,
            }}>
              Valor movimentado no mês
            </div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 800,
              fontSize: isStory ? 100 : 72,
              lineHeight: 0.95,
              color: GREEN,
              whiteSpace: "nowrap",
            }}>
              {formatBRL(data.valor_total_brl)}
            </div>
            <div style={{ marginTop: 10, fontSize: 16, color: INK, fontWeight: 600, lineHeight: 1.3 }}>
              {data.volume_contratos.toLocaleString("pt-BR")} contratos no mês · ticket médio de {formatBRL(data.ticket_medio ?? 0)}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: INK_SOFT, lineHeight: 1.5 }}>
              Leitura de mercado consolidada a partir dos contratos públicos consumidos pelo sistema.
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{
              borderRadius: 24,
              background: BG,
              border: `1px solid ${LINE}`,
              padding: isStory ? "24px 24px" : "20px 20px",
            }}>
              <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 2.4, fontWeight: 800 }}>
                Índice StartGi
              </div>
              <div style={{
                marginTop: 8,
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: isStory ? 78 : 56,
                lineHeight: 0.95,
                fontWeight: 800,
                color: INK,
              }}>
                {formatNum(data.indice_startgi)}
              </div>
              <div style={{ marginTop: 8, fontSize: 15, color: INK_SOFT, lineHeight: 1.45 }}>
                {indiceMultiplo != null
                  ? `Equivale a ${formatNum(indiceMultiplo)}x o patamar de jan/24, que segue como base 100.`
                  : "Base jan/24 = 100."}
              </div>
            </div>
            <div style={{ display: "grid", gap: 10, justifyItems: "stretch" }}>
              <TrendPill v={varMom} label={`vs ${mesAnt}`} />
              <TrendPill v={varYoy} label="vs ano anterior" />
            </div>
          </div>
        </div>

        <div style={{
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1.02fr 0.98fr",
          gap: 14,
          alignItems: "stretch",
        }}>
          <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div style={{
              padding: "18px 20px",
              borderRadius: 18,
              background: BG_SOFT,
              border: `1px solid ${LINE}`,
              borderLeft: `4px solid ${GREEN}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GREEN_DARK, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>
                Análise assertiva do mês
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {analise.map((linha, index) => (
                  <div key={index} style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: GREEN, marginTop: 7 }} />
                    <span style={{ fontSize: 14, lineHeight: 1.42, color: INK, fontWeight: 500 }}>{linha}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[
                {
                  l: "Órgãos compradores",
                  v: data.orgaos_unicos ? data.orgaos_unicos.toLocaleString("pt-BR") : "—",
                  s: data.fornecedores_unicos ? `${data.fornecedores_unicos.toLocaleString("pt-BR")} fornecedores` : undefined,
                },
                {
                  l: "Maior contrato",
                  v: data.maior_contrato_valor ? formatBRL(data.maior_contrato_valor) : "—",
                  s: data.valor_total_brl ? `${formatNum((Number(data.maior_contrato_valor || 0) / data.valor_total_brl) * 100)}% do mês` : undefined,
                },
                {
                  l: "Modalidade líder",
                  v: data.top_modalidade ?? "—",
                  s: data.top_modalidade_share != null ? `${formatNum(data.top_modalidade_share)}% do valor` : undefined,
                },
              ].map((k) => (
                <div key={k.l} style={{ padding: "12px 14px", borderRadius: 16, background: BG, border: `1px solid ${LINE}` }}>
                  <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 2, fontWeight: 800 }}>{k.l}</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, marginTop: 6, color: INK, lineHeight: 1.1 }}>
                    {k.v}
                  </div>
                  {k.s && <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 4, fontWeight: 500, lineHeight: 1.35 }}>{k.s}</div>}
                </div>
              ))}
            </div>

            <div style={{ padding: "16px 18px", borderRadius: 18, background: BG, border: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: GREEN_DARK, textTransform: "uppercase", letterSpacing: 3, fontWeight: 800 }}>
                  Distribuição por esfera de governo
                </div>
                <div style={{ fontSize: 13, color: INK_SOFT, fontWeight: 600 }}>
                  {esferaLider ? `${esferaLider.label} lidera com ${formatNum(esferaLider.value)}%` : ""}
                </div>
              </div>
              <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "#eef2f7" }}>
                <div style={{ width: `${fed}%`, background: GREEN_DARK }} />
                <div style={{ width: `${est}%`, background: GREEN }} />
                <div style={{ width: `${mun}%`, background: "#86efac" }} />
                <div style={{ width: `${out}%`, background: "#cbd5e1" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
                {esferaItems.map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13, color: INK_SOFT, fontWeight: 600 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, display: "inline-block" }} />
                      {item.label}
                    </span>
                    <strong style={{ color: INK }}>{formatNum(item.value)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: GREEN_DARK, textTransform: "uppercase", letterSpacing: 3 }}>
                Segmentos do mês
              </div>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.8 }}>
                Valor · share · variação vs {mesAnt}
              </div>
            </div>

            <div style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden" }}>
              {segs.map((s, i) => {
                const isOutros = s.nome === "Outros";
                const barPct = Math.max(s.share_pct > 0 ? 3 : 0, Math.min(100, s.share_pct));
                return (
                  <div
                    key={s.nome}
                    style={{
                      padding: "12px 16px",
                      borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
                      display: "grid",
                      gridTemplateColumns: "1.2fr 0.95fr auto",
                      gap: 12,
                      alignItems: "center",
                      background: isOutros ? "#fcfcfd" : BG,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{s.nome}</div>
                      <div style={{ marginTop: 7, height: 6, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                        <div style={{ width: `${barPct}%`, height: "100%", background: isOutros ? "#cbd5e1" : `linear-gradient(90deg, ${GREEN_DARK}, ${GREEN})` }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700, color: INK, lineHeight: 1 }}>
                        {formatBRL(s.valor_atual)}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginTop: 4 }}>{formatNum(s.share_pct)}% do total</div>
                      <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 4 }}>
                        {s.valor_anterior > 0 ? `${mesAnt}: ${formatBRL(s.valor_anterior)}` : `sem base em ${mesAnt}`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <VarBadge v={s.var_pct} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{
          zIndex: 1, paddingTop: 14, marginTop: 12, borderTop: `1px solid ${LINE}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 13, color: INK_SOFT, fontWeight: 600,
        }}>
          <span>Fonte: PNCP · processado por <span style={{ color: GREEN_DARK, fontWeight: 800 }}>StartGi</span></span>
          <span style={{ color: GREEN_DARK, fontWeight: 800, letterSpacing: 0.5 }}>#ÍndiceStartGi</span>
        </div>
      </div>
    </div>
  );
}

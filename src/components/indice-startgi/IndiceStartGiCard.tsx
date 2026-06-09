import { IndiceData, formatBRL, formatNum, formatPct, mesLabel, nextMonthName, buildAnaliseMes } from "@/lib/indiceStartGi";
import { TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import logoAsset from "@/assets/startgi-logo.jpg.asset.json";

interface Props {
  data: IndiceData;
  variant?: "feed" | "story";
}

const BRAND_GREEN = "#22c55e";
const BRAND_GREEN_DARK = "#15803d";
const INK = "#0f172a";
const INK_SOFT = "#475569";
const MUTED = "#94a3b8";

function mesAntLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${meses[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

export default function IndiceStartGiCard({ data, variant = "feed" }: Props) {
  const isStory = variant === "story";
  const height = isStory ? 1920 : 1080;

  const esfera = data.breakdown_esfera || {};
  const fed = Number(esfera.federal || 0);
  const est = Number(esfera.estadual || 0);
  const mun = Number(esfera.municipal || 0);
  const out = Math.max(0, 100 - fed - est - mun);

  const varMomPositive = (data.variacao_mom ?? 0) >= 0;
  const varYoyPositive = (data.variacao_yoy ?? 0) >= 0;

  // Top 5 segmentos por valor (sem "Outros" se houver dados)
  const segs = (data.segmentos_detalhe ?? [])
    .filter((s) => s.valor_atual > 0)
    .sort((a, b) => b.valor_atual - a.valor_atual)
    .slice(0, 5);

  const analise = buildAnaliseMes(data);
  const mesAnt = mesAntLabel(data.mes_referencia);

  const VarBadge = ({ v }: { v: number | null }) => {
    if (v == null) return <span style={{ color: MUTED, fontSize: 14, fontWeight: 600 }}>—</span>;
    const pos = v >= 0;
    const Icon = v === 0 ? Minus : pos ? ArrowUpRight : ArrowDownRight;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 999, fontSize: 14, fontWeight: 700,
        background: pos ? "#dcfce7" : "#fee2e2",
        color: pos ? "#166534" : "#991b1b",
      }}>
        <Icon size={14} /> {formatPct(v)}
      </span>
    );
  };

  return (
    <div
      style={{
        width: 1080,
        height,
        background: "#f8fafc",
        color: INK,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: isStory ? "80px 72px" : "56px 60px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 8,
        background: `linear-gradient(90deg, ${BRAND_GREEN_DARK}, ${BRAND_GREEN})`,
      }} />
      <div style={{
        position: "absolute", bottom: -220, right: -220, width: 540, height: 540,
        borderRadius: "50%", background: `${BRAND_GREEN}10`,
      }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
        <img
          src={logoAsset.url}
          alt="StartGi"
          crossOrigin="anonymous"
          style={{ height: isStory ? 100 : 84, width: "auto", objectFit: "contain" }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: BRAND_GREEN_DARK,
            textTransform: "uppercase", letterSpacing: 4,
          }}>
            Índice StartGi · {mesLabel(data.mes_referencia)}
          </div>
          <div style={{ fontSize: 14, color: INK_SOFT, fontWeight: 500 }}>
            Termômetro mensal das compras públicas no Brasil
          </div>
        </div>
      </div>

      {data.dados_parciais && (
        <div style={{
          marginTop: 18, display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 10,
          background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 999, padding: "6px 14px", color: "#92400e", fontSize: 13, fontWeight: 600, zIndex: 1,
        }}>
          <AlertTriangle size={14} />
          Dados parciais — fechamento dia 10 de {nextMonthName(data.mes_referencia)}
        </div>
      )}

      {/* Hero — número + comparações */}
      <div style={{
        marginTop: isStory ? 56 : 28, zIndex: 1,
        display: "flex", alignItems: "flex-end", gap: 36, flexWrap: "wrap",
      }}>
        <div style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontWeight: 800, fontSize: isStory ? 280 : 200, lineHeight: 0.9,
          color: BRAND_GREEN, letterSpacing: -8,
        }}>
          {formatNum(data.indice_startgi)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK_SOFT, letterSpacing: 4, textTransform: "uppercase" }}>
            pontos · base jan/24 = 100
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 999, fontSize: 16, fontWeight: 700,
            background: varMomPositive ? "#dcfce7" : "#fee2e2",
            color: varMomPositive ? "#166534" : "#991b1b",
          }}>
            {varMomPositive ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
            {formatPct(data.variacao_mom)} <span style={{ fontWeight: 500, opacity: 0.85 }}>vs {mesAnt}</span>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 999, fontSize: 16, fontWeight: 700,
            background: varYoyPositive ? "#dcfce7" : "#fee2e2",
            color: varYoyPositive ? "#166534" : "#991b1b",
          }}>
            {varYoyPositive ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
            {formatPct(data.variacao_yoy)} <span style={{ fontWeight: 500, opacity: 0.85 }}>vs ano anterior</span>
          </div>
        </div>
      </div>

      {/* Análise assertiva do mês */}
      <div style={{
        marginTop: isStory ? 40 : 24, zIndex: 1,
        padding: "20px 24px", borderRadius: 16,
        background: "#ffffff", border: `1px solid #e2e8f0`,
        borderLeft: `4px solid ${BRAND_GREEN}`,
      }}>
        <div style={{
          fontSize: 12, fontWeight: 800, color: BRAND_GREEN_DARK,
          textTransform: "uppercase", letterSpacing: 3, marginBottom: 8,
        }}>
          Leitura do mês
        </div>
        <p style={{
          margin: 0, fontSize: 18, lineHeight: 1.5, color: INK, fontWeight: 500,
        }}>
          {analise}
        </p>
      </div>

      {/* KPIs principais — valores absolutos */}
      <div style={{
        marginTop: isStory ? 32 : 18, zIndex: 1,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
      }}>
        {[
          {
            l: "Valor contratado",
            v: formatBRL(data.valor_total_brl),
            s: data.valor_total_brl_anterior
              ? `${mesAnt}: ${formatBRL(data.valor_total_brl_anterior)}`
              : undefined,
          },
          {
            l: "Contratos firmados",
            v: data.volume_contratos.toLocaleString("pt-BR"),
            s: data.ticket_medio ? `Ticket médio ${formatBRL(data.ticket_medio)}` : undefined,
          },
          {
            l: "Maior contrato",
            v: data.maior_contrato_valor ? formatBRL(data.maior_contrato_valor) : "—",
            s: data.top_modalidade
              ? `${data.top_modalidade} concentra ${formatNum(data.top_modalidade_share ?? null)}%`
              : undefined,
          },
        ].map((k) => (
          <div key={k.l} style={{
            padding: "16px 18px", borderRadius: 14,
            background: "#ffffff", border: "1px solid #e2e8f0",
          }}>
            <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>
              {k.l}
            </div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 24, marginTop: 4,
              color: INK, letterSpacing: -0.5,
            }}>
              {k.v}
            </div>
            {k.s && (
              <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 4, fontWeight: 500 }}>{k.s}</div>
            )}
          </div>
        ))}
      </div>

      {/* Segmentos — coração do card */}
      <div style={{ marginTop: isStory ? 36 : 18, zIndex: 1 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12,
        }}>
          <div style={{
            fontSize: 13, fontWeight: 800, color: BRAND_GREEN_DARK,
            textTransform: "uppercase", letterSpacing: 3,
          }}>
            Segmentos — valor contratado e variação vs {mesAnt}
          </div>
        </div>

        <div style={{
          background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden",
        }}>
          {segs.length === 0 && (
            <div style={{ padding: "20px 22px", color: INK_SOFT, fontSize: 15 }}>
              Sem dados de segmento neste mês.
            </div>
          )}
          {segs.map((s, i) => {
            const barPct = Math.max(2, Math.min(100, s.share_pct));
            return (
              <div key={s.nome} style={{
                padding: "14px 20px",
                borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
                display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 0.8fr", gap: 16, alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{s.nome}</div>
                  <div style={{
                    marginTop: 6, height: 6, borderRadius: 999, background: "#e2e8f0", overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${barPct}%`, height: "100%",
                      background: `linear-gradient(90deg, ${BRAND_GREEN_DARK}, ${BRAND_GREEN})`,
                    }} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: INK,
                  }}>
                    {formatBRL(s.valor_atual)}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>
                    {formatNum(s.share_pct)}% do total
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 13, color: INK_SOFT }}>
                  {mesAnt}: <strong style={{ color: INK }}>{formatBRL(s.valor_anterior)}</strong>
                </div>
                <div style={{ textAlign: "right" }}>
                  <VarBadge v={s.var_pct} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Distribuição por esfera */}
      <div style={{ marginTop: isStory ? 28 : 16, zIndex: 1 }}>
        <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 3, fontWeight: 700, marginBottom: 8 }}>
          Distribuição do valor por esfera de governo
        </div>
        <div style={{
          display: "flex", height: 12, borderRadius: 8, overflow: "hidden", background: "#e2e8f0",
        }}>
          <div style={{ width: `${fed}%`, background: BRAND_GREEN_DARK }} />
          <div style={{ width: `${est}%`, background: BRAND_GREEN }} />
          <div style={{ width: `${mun}%`, background: "#86efac" }} />
          <div style={{ width: `${out}%`, background: "#cbd5e1" }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 8,
          fontSize: 14, fontWeight: 600, color: INK_SOFT, flexWrap: "wrap", gap: 10,
        }}>
          <span><span style={{ color: BRAND_GREEN_DARK }}>■</span> Federal {Math.round(fed)}%</span>
          <span><span style={{ color: BRAND_GREEN }}>■</span> Estadual {Math.round(est)}%</span>
          <span><span style={{ color: "#86efac" }}>■</span> Municipal {Math.round(mun)}%</span>
          {out > 0 && <span><span style={{ color: "#cbd5e1" }}>■</span> Outros {Math.round(out)}%</span>}
        </div>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{
        zIndex: 1, paddingTop: 16, marginTop: 14, borderTop: "1px solid #e2e8f0",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 14, color: INK_SOFT, fontWeight: 600,
      }}>
        <span>Fonte: PNCP · processado por <span style={{ color: BRAND_GREEN_DARK, fontWeight: 700 }}>StartGi</span></span>
        <span style={{ color: BRAND_GREEN_DARK, fontWeight: 800 }}>#ÍndiceStartGi</span>
      </div>
    </div>
  );
}

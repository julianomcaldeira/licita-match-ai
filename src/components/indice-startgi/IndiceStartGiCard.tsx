import { IndiceData, formatBRL, formatNum, formatPct, mesLabel, nextMonthName, buildAnaliseMes, SegmentoDetalhe } from "@/lib/indiceStartGi";
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

function mesAntLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${meses[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

/** Garante uma lista de segmentos mesmo quando `segmentos_detalhe` vier vazio. */
function resolveSegmentos(data: IndiceData): SegmentoDetalhe[] {
  const det = (data.segmentos_detalhe ?? []).filter((s) => s.valor_atual > 0);
  if (det.length > 0) return det;
  // Fallback a partir do breakdown_segmento (% × valor_total)
  const breakdown = data.breakdown_segmento || {};
  const total = Number(data.valor_total_brl || 0);
  return Object.entries(breakdown)
    .map(([nome, share]) => ({
      nome,
      share_pct: Number(share) || 0,
      valor_atual: total * (Number(share) || 0) / 100,
      valor_anterior: 0,
      var_pct: null,
    }))
    .filter((s) => s.share_pct > 0);
}

export default function IndiceStartGiCard({ data, variant = "feed" }: Props) {
  const isStory = variant === "story";
  const W = 1080;
  const H = isStory ? 1920 : 1080;
  const PAD = isStory ? 72 : 56;

  const esfera = data.breakdown_esfera || {};
  const fed = Number(esfera.federal || 0);
  const est = Number(esfera.estadual || 0);
  const mun = Number(esfera.municipal || 0);
  const out = Math.max(0, 100 - fed - est - mun);

  const varMom = data.variacao_mom;
  const varYoy = data.variacao_yoy;
  const mesAnt = mesAntLabel(data.mes_referencia);

  const segs = resolveSegmentos(data)
    .sort((a, b) => b.valor_atual - a.valor_atual)
    .slice(0, 6);

  const analise = buildAnaliseMes(data);

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
      {/* Faixa superior */}
      <div style={{
        height: 8, background: `linear-gradient(90deg, ${GREEN_DARK}, ${GREEN}, #4ade80)`,
      }} />

      {/* Conteúdo */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        padding: `${PAD - 8}px ${PAD}px ${PAD}px`,
        position: "relative",
      }}>
        {/* círculo decorativo */}
        <div style={{
          position: "absolute", top: -160, right: -160, width: 480, height: 480,
          borderRadius: "50%", background: `${GREEN}0d`, pointerEvents: "none",
        }} />

        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "10px 18px 10px 10px",
            background: BG, border: `1px solid ${LINE}`, borderRadius: 16,
            boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
          }}>
            <img
              src={logoAsset.url}
              alt="StartGi"
              crossOrigin="anonymous"
              style={{ height: 64, width: "auto", objectFit: "contain", display: "block" }}
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
              fontSize: 28, fontWeight: 700, color: INK, marginTop: 2, letterSpacing: -0.5,
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
            marginTop: 16, display: "inline-flex", alignSelf: "flex-start",
            alignItems: "center", gap: 8,
            background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 999,
            padding: "6px 14px", color: "#92400e", fontSize: 12, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 1.5, zIndex: 1,
          }}>
            <AlertTriangle size={13} />
            Dados parciais · fechamento dia 10 de {nextMonthName(data.mes_referencia)}
          </div>
        )}

        {/* HERO — número + comparações em layout estável (grid) */}
        <div style={{
          marginTop: isStory ? 60 : 36, zIndex: 1,
          display: "grid", gridTemplateColumns: "1fr auto", gap: 28, alignItems: "center",
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 800, color: GREEN_DARK,
              textTransform: "uppercase", letterSpacing: 3, marginBottom: 6,
            }}>
              Pontuação do mês · base jan/24 = 100
            </div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 800,
              fontSize: isStory ? 220 : 168,
              lineHeight: 1,
              color: GREEN,
              letterSpacing: -6,
              whiteSpace: "nowrap",
            }}>
              {formatNum(data.indice_startgi)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            <TrendPill v={varMom} label={`vs ${mesAnt}`} />
            <TrendPill v={varYoy} label="vs ano anterior" />
          </div>
        </div>

        {/* LEITURA — agora SEM margem negativa, com gap proporcional */}
        <div style={{
          marginTop: isStory ? 36 : 24, zIndex: 1,
          padding: "18px 22px", borderRadius: 14,
          background: BG_SOFT, border: `1px solid ${LINE}`,
          borderLeft: `4px solid ${GREEN}`,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: GREEN_DARK,
            textTransform: "uppercase", letterSpacing: 3, marginBottom: 6,
          }}>
            Leitura do mês
          </div>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: INK, fontWeight: 500 }}>
            {analise}
          </p>
        </div>

        {/* KPIs */}
        <div style={{
          marginTop: 14, zIndex: 1,
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
        }}>
          {[
            {
              l: "Valor contratado",
              v: formatBRL(data.valor_total_brl),
              s: data.valor_total_brl_anterior
                ? `${mesAnt}: ${formatBRL(data.valor_total_brl_anterior)}`
                : `${data.volume_contratos.toLocaleString("pt-BR")} contratos`,
            },
            {
              l: "Ticket médio",
              v: data.ticket_medio ? formatBRL(data.ticket_medio) : "—",
              s: data.orgaos_unicos ? `${data.orgaos_unicos.toLocaleString("pt-BR")} órgãos compradores` : undefined,
            },
            {
              l: "Maior contrato",
              v: data.maior_contrato_valor ? formatBRL(data.maior_contrato_valor) : "—",
              s: data.top_modalidade ? `${data.top_modalidade} lidera com ${formatNum(data.top_modalidade_share ?? null)}%` : undefined,
            },
          ].map((k) => (
            <div key={k.l} style={{
              padding: "14px 16px", borderRadius: 12,
              background: BG, border: `1px solid ${LINE}`,
            }}>
              <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 2, fontWeight: 800 }}>
                {k.l}
              </div>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginTop: 4,
                color: INK, letterSpacing: -0.5,
              }}>
                {k.v}
              </div>
              {k.s && (
                <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 4, fontWeight: 500 }}>{k.s}</div>
              )}
            </div>
          ))}
        </div>

        {/* SEGMENTOS — sempre presentes */}
        <div style={{ marginTop: isStory ? 26 : 16, zIndex: 1 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 800, color: GREEN_DARK,
              textTransform: "uppercase", letterSpacing: 3,
            }}>
              Segmentos do mês
            </div>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
              Valor · % do total · variação vs {mesAnt}
            </div>
          </div>

          <div style={{
            background: BG, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden",
          }}>
            {segs.length === 0 ? (
              <div style={{ padding: "18px 20px", color: INK_SOFT, fontSize: 14 }}>
                Sem segmentação disponível neste mês.
              </div>
            ) : segs.map((s, i) => {
              const barPct = Math.max(2, Math.min(100, s.share_pct));
              return (
                <div key={s.nome} style={{
                  padding: "12px 18px",
                  borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
                  display: "grid",
                  gridTemplateColumns: "1.5fr 1.1fr 0.9fr 0.7fr",
                  gap: 14, alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{s.nome}</div>
                    <div style={{
                      marginTop: 6, height: 6, borderRadius: 999, background: "#eef2f7", overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${barPct}%`, height: "100%",
                        background: `linear-gradient(90deg, ${GREEN_DARK}, ${GREEN})`,
                      }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700, color: INK,
                    }}>
                      {formatBRL(s.valor_atual)}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>
                      {formatNum(s.share_pct)}% do total
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, color: INK_SOFT }}>
                    {s.valor_anterior > 0
                      ? <>{mesAnt}: <strong style={{ color: INK }}>{formatBRL(s.valor_anterior)}</strong></>
                      : <span style={{ color: MUTED }}>sem base anterior</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <VarBadge v={s.var_pct} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ESFERA */}
        <div style={{ marginTop: 16, zIndex: 1 }}>
          <div style={{
            fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 3, fontWeight: 800, marginBottom: 8,
          }}>
            Distribuição por esfera de governo
          </div>
          <div style={{
            display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "#eef2f7",
          }}>
            <div style={{ width: `${fed}%`, background: GREEN_DARK }} />
            <div style={{ width: `${est}%`, background: GREEN }} />
            <div style={{ width: `${mun}%`, background: "#86efac" }} />
            <div style={{ width: `${out}%`, background: "#cbd5e1" }} />
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", marginTop: 8,
            fontSize: 13, fontWeight: 600, color: INK_SOFT, flexWrap: "wrap", gap: 10,
          }}>
            <span><span style={{ color: GREEN_DARK }}>■</span> Federal {Math.round(fed)}%</span>
            <span><span style={{ color: GREEN }}>■</span> Estadual {Math.round(est)}%</span>
            <span><span style={{ color: "#86efac" }}>■</span> Municipal {Math.round(mun)}%</span>
            {out > 0 && <span><span style={{ color: "#cbd5e1" }}>■</span> Outros {Math.round(out)}%</span>}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* FOOTER */}
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

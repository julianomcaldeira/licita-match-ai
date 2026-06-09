import { IndiceData, formatBRL, formatNum, formatPct, mesLabel, nextMonthName } from "@/lib/indiceStartGi";
import { TrendingUp, TrendingDown, Trophy, AlertTriangle, Building2, Briefcase, Gavel, Crown } from "lucide-react";
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

function trunc(s: string | null | undefined, n: number) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

/**
 * Card visual do Índice StartGi — 1080px de largura.
 * Estrutura: cabeçalho com logo, explicação do índice, hero number,
 * KPIs do mês e destaques reais (órgão, fornecedor, modalidade, maior contrato).
 */
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

  const Highlight = ({
    icon, label, primary, secondary,
  }: { icon: React.ReactNode; label: string; primary: string; secondary?: string }) => (
    <div style={{
      padding: "20px 22px", borderRadius: 16,
      border: "1px solid #e2e8f0", background: "#ffffff",
      display: "flex", flexDirection: "column", gap: 6, minHeight: 130,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: BRAND_GREEN_DARK }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 700, color: INK_SOFT, textTransform: "uppercase", letterSpacing: 2 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: INK, lineHeight: 1.15 }}>
        {primary}
      </div>
      {secondary && (
        <div style={{ fontSize: 15, color: INK_SOFT, fontWeight: 500 }}>
          {secondary}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        width: 1080,
        height,
        background: "#f8fafc",
        color: INK,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: isStory ? "80px 72px" : "60px 64px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Faixa superior */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 8,
        background: `linear-gradient(90deg, ${BRAND_GREEN_DARK}, ${BRAND_GREEN})`,
      }} />
      <div style={{
        position: "absolute", bottom: -200, right: -200, width: 520, height: 520,
        borderRadius: "50%", background: `${BRAND_GREEN}10`,
      }} />

      {/* Header — logo + período */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
        <img
          src={logoAsset.url}
          alt="StartGi"
          crossOrigin="anonymous"
          style={{ height: isStory ? 100 : 88, width: "auto", objectFit: "contain" }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: BRAND_GREEN_DARK,
            textTransform: "uppercase", letterSpacing: 4,
          }}>
            Índice StartGi · {mesLabel(data.mes_referencia)}
          </div>
          <div style={{ fontSize: 15, color: INK_SOFT, fontWeight: 500 }}>
            Mercado de compras públicas no Brasil
          </div>
        </div>
      </div>

      {/* Título + explicação */}
      <div style={{ marginTop: isStory ? 56 : 36, zIndex: 1 }}>
        <h1 style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontWeight: 700, fontSize: isStory ? 56 : 44, lineHeight: 1.1, margin: 0,
          color: INK, letterSpacing: -1,
        }}>
          O termômetro mensal<br/>do mercado público brasileiro
        </h1>
        <p style={{
          marginTop: 16, fontSize: 18, lineHeight: 1.5, color: INK_SOFT, maxWidth: 880,
        }}>
          O Índice StartGi mede o volume financeiro de contratos públicos firmados no mês,
          tendo <strong style={{ color: INK }}>janeiro/2024 como base 100</strong>. Um valor acima
          de 100 indica mês mais aquecido que a referência; abaixo, retração.
        </p>
      </div>

      {data.dados_parciais && (
        <div style={{
          marginTop: 20, display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 10,
          background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 999, padding: "8px 16px", color: "#92400e", fontSize: 14, fontWeight: 600, zIndex: 1,
        }}>
          <AlertTriangle size={16} />
          Dados parciais — fechamento dia 10 de {nextMonthName(data.mes_referencia)}
        </div>
      )}

      {/* Hero — número */}
      <div style={{
        marginTop: isStory ? 64 : 36, zIndex: 1,
        display: "flex", alignItems: "flex-end", gap: 36, flexWrap: "wrap",
      }}>
        <div style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontWeight: 800, fontSize: isStory ? 280 : 220, lineHeight: 0.9,
          color: BRAND_GREEN, letterSpacing: -8,
        }}>
          {formatNum(data.indice_startgi)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: INK_SOFT, letterSpacing: 4, textTransform: "uppercase" }}>
            pontos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 700,
              background: varMomPositive ? "#dcfce7" : "#fee2e2",
              color: varMomPositive ? "#166534" : "#991b1b",
            }}>
              {varMomPositive ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}
              {formatPct(data.variacao_mom)} <span style={{ fontWeight: 500, opacity: 0.85 }}>vs mês anterior</span>
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 700,
              background: varYoyPositive ? "#dcfce7" : "#fee2e2",
              color: varYoyPositive ? "#166534" : "#991b1b",
            }}>
              {varYoyPositive ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}
              {formatPct(data.variacao_yoy)} <span style={{ fontWeight: 500, opacity: 0.85 }}>vs ano anterior</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs principais */}
      <div style={{
        marginTop: isStory ? 56 : 32, zIndex: 1,
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14,
      }}>
        {[
          { l: "Valor contratado", v: formatBRL(data.valor_total_brl) },
          { l: "Contratos", v: data.volume_contratos.toLocaleString("pt-BR") },
          { l: "Ticket médio", v: formatBRL(data.ticket_medio ?? null) },
          { l: "Órgãos compradores", v: (data.orgaos_unicos ?? 0).toLocaleString("pt-BR") },
        ].map((k) => (
          <div key={k.l} style={{
            padding: "18px 20px", borderRadius: 14,
            background: "#ffffff", border: "1px solid #e2e8f0",
          }}>
            <div style={{ fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>
              {k.l}
            </div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 26, marginTop: 4,
              color: INK, letterSpacing: -0.5,
            }}>
              {k.v}
            </div>
          </div>
        ))}
      </div>

      {/* Destaques do mês */}
      <div style={{ marginTop: isStory ? 48 : 28, zIndex: 1 }}>
        <div style={{
          fontSize: 14, fontWeight: 800, color: BRAND_GREEN_DARK,
          textTransform: "uppercase", letterSpacing: 4, marginBottom: 14,
        }}>
          Destaques do mês
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          <Highlight
            icon={<Building2 size={20} />}
            label="Órgão que mais contratou"
            primary={trunc(data.top_orgao_nome, 60)}
            secondary={data.top_orgao_valor ? formatBRL(data.top_orgao_valor) : undefined}
          />
          <Highlight
            icon={<Briefcase size={20} />}
            label="Empresa mais contratada"
            primary={trunc(data.top_fornecedor_nome, 60)}
            secondary={data.top_fornecedor_valor ? formatBRL(data.top_fornecedor_valor) : undefined}
          />
          <Highlight
            icon={<Gavel size={20} />}
            label="Modalidade dominante"
            primary={data.top_modalidade ?? "—"}
            secondary={
              data.top_modalidade_share != null
                ? `${formatNum(data.top_modalidade_share)}% do valor total contratado`
                : undefined
            }
          />
          <Highlight
            icon={<Crown size={20} />}
            label="Maior contrato do mês"
            primary={data.maior_contrato_valor ? formatBRL(data.maior_contrato_valor) : "—"}
            secondary={trunc(data.maior_contrato_objeto, 80)}
          />
        </div>
      </div>

      {/* Segmento em destaque */}
      {data.destaque_segmento && (
        <div style={{
          marginTop: isStory ? 32 : 20, zIndex: 1,
          display: "flex", alignItems: "center", gap: 14,
          padding: "16px 22px", borderRadius: 14,
          background: `${BRAND_GREEN}14`, border: `1px solid ${BRAND_GREEN}55`,
        }}>
          <Trophy size={22} color={BRAND_GREEN_DARK} />
          <span style={{ fontSize: 13, color: INK_SOFT, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
            Setor que mais cresceu
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, color: INK }}>{data.destaque_segmento}</span>
          <span style={{
            marginLeft: "auto", fontSize: 22, fontWeight: 800,
            color: (data.destaque_variacao ?? 0) >= 0 ? "#166534" : "#991b1b",
          }}>
            {formatPct(data.destaque_variacao)}
          </span>
        </div>
      )}

      {/* Distribuição por esfera */}
      <div style={{ marginTop: isStory ? 32 : 20, zIndex: 1 }}>
        <div style={{ fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 3, fontWeight: 700, marginBottom: 10 }}>
          Distribuição do valor por esfera de governo
        </div>
        <div style={{
          display: "flex", height: 14, borderRadius: 8, overflow: "hidden", background: "#e2e8f0",
        }}>
          <div style={{ width: `${fed}%`, background: BRAND_GREEN_DARK }} />
          <div style={{ width: `${est}%`, background: BRAND_GREEN }} />
          <div style={{ width: `${mun}%`, background: "#86efac" }} />
          <div style={{ width: `${out}%`, background: "#cbd5e1" }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 10,
          fontSize: 15, fontWeight: 600, color: INK_SOFT, flexWrap: "wrap", gap: 10,
        }}>
          <span><span style={{ color: BRAND_GREEN_DARK }}>■</span> Federal {Math.round(fed)}%</span>
          <span><span style={{ color: BRAND_GREEN }}>■</span> Estadual {Math.round(est)}%</span>
          <span><span style={{ color: "#86efac" }}>■</span> Municipal {Math.round(mun)}%</span>
          {out > 0 && <span><span style={{ color: "#cbd5e1" }}>■</span> Outros {Math.round(out)}%</span>}
        </div>
      </div>

      {/* Rodapé */}
      <div style={{ flex: 1 }} />
      <div style={{
        zIndex: 1, paddingTop: 20, marginTop: 18, borderTop: "1px solid #e2e8f0",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 15, color: INK_SOFT, fontWeight: 600,
      }}>
        <span>Fonte: PNCP · processado por <span style={{ color: BRAND_GREEN_DARK, fontWeight: 700 }}>StartGi</span></span>
        <span style={{ color: BRAND_GREEN_DARK, fontWeight: 800 }}>#ÍndiceStartGi</span>
      </div>
    </div>
  );
}

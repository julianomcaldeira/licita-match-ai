import { IndiceData, formatBRL, formatNum, formatPct, mesLabel, nextMonthName } from "@/lib/indiceStartGi";
import { TrendingUp, TrendingDown, Trophy, AlertTriangle } from "lucide-react";
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

/**
 * Card visual para exportação em PNG. Largura fixa de 1080px.
 * Estilo clean, fundo branco, hero number gigante na cor da marca StartGi.
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

  return (
    <div
      style={{
        width: 1080,
        height,
        background: "#ffffff",
        color: INK,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: isStory ? "96px 88px" : "72px 80px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Acento gráfico minimalista */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 8,
        background: `linear-gradient(90deg, ${BRAND_GREEN_DARK}, ${BRAND_GREEN})`,
      }} />
      <div style={{
        position: "absolute", bottom: -180, right: -180, width: 480, height: 480,
        borderRadius: "50%", background: `${BRAND_GREEN}14`,
      }} />

      {/* Header — logo + período */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
        <img
          src={logoAsset.url}
          alt="StartGi"
          crossOrigin="anonymous"
          style={{ height: isStory ? 110 : 96, width: "auto", objectFit: "contain" }}
        />
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
        }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: BRAND_GREEN_DARK,
            textTransform: "uppercase", letterSpacing: 4,
          }}>
            Índice StartGi
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: INK_SOFT }}>
            {mesLabel(data.mes_referencia)}
          </div>
        </div>
      </div>

      {data.dados_parciais && (
        <div style={{
          marginTop: 28, display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 10,
          background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 999, padding: "10px 18px", color: "#92400e", fontSize: 16, fontWeight: 600, zIndex: 1,
        }}>
          <AlertTriangle size={18} />
          Dados parciais — fechamento dia 10 de {nextMonthName(data.mes_referencia)}
        </div>
      )}

      {/* Título */}
      <div style={{ marginTop: isStory ? 96 : 48, zIndex: 1 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 3 }}>
          Compras Governamentais · Brasil
        </div>
        <h1 style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontWeight: 700, fontSize: isStory ? 60 : 48, lineHeight: 1.1, margin: "12px 0 0",
          color: INK, letterSpacing: -0.5,
        }}>
          O termômetro mensal<br/>do gasto público nacional.
        </h1>
      </div>

      {/* Hero — número gigante */}
      <div style={{
        marginTop: isStory ? 110 : 60, zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontWeight: 800, fontSize: isStory ? 380 : 300, lineHeight: 0.9,
          color: BRAND_GREEN, letterSpacing: -8,
        }}>
          {formatNum(data.indice_startgi)}
        </div>
        <div style={{
          marginTop: 12, fontSize: 24, fontWeight: 700, color: INK_SOFT,
          letterSpacing: 6, textTransform: "uppercase",
        }}>
          pontos · base 100 = jan/2024
        </div>

        <div style={{
          display: "flex", gap: 48, marginTop: 40, fontSize: 24, fontWeight: 700,
          flexWrap: "wrap", justifyContent: "center",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 22px", borderRadius: 999,
            background: varMomPositive ? "#dcfce7" : "#fee2e2",
            color: varMomPositive ? "#166534" : "#991b1b",
          }}>
            {varMomPositive ? <TrendingUp size={24}/> : <TrendingDown size={24}/>}
            {formatPct(data.variacao_mom)} <span style={{ fontWeight: 500, opacity: 0.8 }}>mês ant.</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 22px", borderRadius: 999,
            background: varYoyPositive ? "#dcfce7" : "#fee2e2",
            color: varYoyPositive ? "#166534" : "#991b1b",
          }}>
            {varYoyPositive ? <TrendingUp size={24}/> : <TrendingDown size={24}/>}
            {formatPct(data.variacao_yoy)} <span style={{ fontWeight: 500, opacity: 0.8 }}>ano ant.</span>
          </div>
        </div>
      </div>

      {/* Valor + contratos */}
      <div style={{
        marginTop: isStory ? 110 : 56, zIndex: 1,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24,
      }}>
        <div style={{
          padding: "28px 32px", borderRadius: 20,
          border: `1px solid #e2e8f0`, background: "#f8fafc",
        }}>
          <div style={{ fontSize: 16, color: MUTED, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>
            Valor contratado
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 52, marginTop: 6,
            color: INK, letterSpacing: -1,
          }}>
            {formatBRL(data.valor_total_brl)}
          </div>
        </div>
        <div style={{
          padding: "28px 32px", borderRadius: 20,
          border: `1px solid #e2e8f0`, background: "#f8fafc",
        }}>
          <div style={{ fontSize: 16, color: MUTED, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>
            Contratos firmados
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 52, marginTop: 6,
            color: INK, letterSpacing: -1,
          }}>
            {data.volume_contratos.toLocaleString("pt-BR")}
          </div>
        </div>
      </div>

      {/* Destaque */}
      {data.destaque_segmento && (
        <div style={{
          marginTop: isStory ? 56 : 32, zIndex: 1,
          display: "flex", alignItems: "center", gap: 16,
          padding: "20px 28px", borderRadius: 16,
          background: `${BRAND_GREEN}12`, border: `1px solid ${BRAND_GREEN}55`,
        }}>
          <Trophy size={28} color={BRAND_GREEN_DARK} />
          <span style={{ fontSize: 16, color: INK_SOFT, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
            Destaque
          </span>
          <span style={{ fontSize: 26, fontWeight: 700, color: INK }}>{data.destaque_segmento}</span>
          <span style={{
            marginLeft: "auto", fontSize: 26, fontWeight: 800,
            color: (data.destaque_variacao ?? 0) >= 0 ? "#166534" : "#991b1b",
          }}>
            {formatPct(data.destaque_variacao)}
          </span>
        </div>
      )}

      {/* Barra esfera */}
      <div style={{ marginTop: isStory ? 64 : 36, zIndex: 1 }}>
        <div style={{ fontSize: 14, color: MUTED, textTransform: "uppercase", letterSpacing: 3, fontWeight: 700, marginBottom: 12 }}>
          Distribuição por esfera
        </div>
        <div style={{
          display: "flex", height: 16, borderRadius: 10, overflow: "hidden",
          background: "#e2e8f0",
        }}>
          <div style={{ width: `${fed}%`, background: BRAND_GREEN_DARK }} />
          <div style={{ width: `${est}%`, background: BRAND_GREEN }} />
          <div style={{ width: `${mun}%`, background: "#86efac" }} />
          <div style={{ width: `${out}%`, background: "#cbd5e1" }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 14,
          fontSize: 18, fontWeight: 600, color: INK_SOFT, flexWrap: "wrap", gap: 12,
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
        zIndex: 1, paddingTop: 28, marginTop: 24, borderTop: "1px solid #e2e8f0",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 18, color: INK_SOFT, fontWeight: 600,
      }}>
        <span>Fonte: PNCP · consolidado por <span style={{ color: BRAND_GREEN_DARK, fontWeight: 700 }}>StartGi</span></span>
        <span style={{ color: BRAND_GREEN_DARK, fontWeight: 800 }}>#ÍndiceStartGi</span>
      </div>
    </div>
  );
}

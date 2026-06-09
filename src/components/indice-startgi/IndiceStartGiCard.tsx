import { IndiceData, formatBRL, formatNum, formatPct, mesLabel, nextMonthName } from "@/lib/indiceStartGi";
import { TrendingUp, TrendingDown, Trophy, AlertTriangle } from "lucide-react";

interface Props {
  data: IndiceData;
  variant?: "feed" | "story";
}

/**
 * Card visual para exportação em PNG. Largura fixa de 1080px.
 * Fundo escuro independente do tema da aplicação.
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
        background: "linear-gradient(160deg, #0b1230 0%, #1a1147 55%, #2b0f4a 100%)",
        color: "#ffffff",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: isStory ? "96px 80px" : "64px 72px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Brilho decorativo */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at 80% 0%, rgba(125,99,255,0.35), transparent 50%), radial-gradient(circle at 0% 100%, rgba(64,108,255,0.25), transparent 45%)",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "linear-gradient(135deg, #4f46e5, #a855f7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 28,
          }}>S</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 28, letterSpacing: 0.5 }}>
            StartGi
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 2 }}>
          {mesLabel(data.mes_referencia)}
        </div>
      </div>

      {data.dados_parciais && (
        <div style={{
          marginTop: 24, display: "flex", alignItems: "center", gap: 12,
          background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245,158,11,0.4)",
          borderRadius: 12, padding: "14px 20px", color: "#fcd34d", fontSize: 18, fontWeight: 600, zIndex: 1,
        }}>
          <AlertTriangle size={22} />
          Dados parciais — atualização até dia 10 de {nextMonthName(data.mes_referencia)}
        </div>
      )}

      {/* Título */}
      <div style={{ marginTop: isStory ? 80 : 56, zIndex: 1 }}>
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700, fontSize: isStory ? 64 : 56, lineHeight: 1.05, margin: 0,
          textTransform: "uppercase", letterSpacing: 1,
        }}>
          Índice StartGi de<br />Compras Governamentais
        </h1>
      </div>

      {/* Índice */}
      <div style={{
        marginTop: isStory ? 96 : 56,
        display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1,
      }}>
        <div style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 28, padding: isStory ? "56px 96px" : "40px 72px",
          backdropFilter: "blur(6px)", textAlign: "center",
        }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 800, fontSize: isStory ? 260 : 200, lineHeight: 1,
            background: "linear-gradient(135deg, #a5b4fc, #f0abfc)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            {formatNum(data.indice_startgi)}
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginTop: 8, letterSpacing: 4, textTransform: "uppercase" }}>
            pontos
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, marginTop: 36, fontSize: 26, fontWeight: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: varMomPositive ? "#34d399" : "#f87171" }}>
            {varMomPositive ? <TrendingUp size={28}/> : <TrendingDown size={28}/>}
            {formatPct(data.variacao_mom)} vs mês anterior
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: varYoyPositive ? "#34d399" : "#f87171" }}>
            {varYoyPositive ? <TrendingUp size={28}/> : <TrendingDown size={28}/>}
            {formatPct(data.variacao_yoy)} vs mesmo mês ano anterior
          </div>
        </div>
      </div>

      {/* Valor + contratos */}
      <div style={{
        marginTop: isStory ? 96 : 56, display: "flex", justifyContent: "center", gap: 96, zIndex: 1,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 2 }}>Valor contratado</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 60, marginTop: 8 }}>
            {formatBRL(data.valor_total_brl)}
          </div>
        </div>
        <div style={{ width: 2, background: "rgba(255,255,255,0.15)" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 2 }}>Contratos</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 60, marginTop: 8 }}>
            {data.volume_contratos.toLocaleString("pt-BR")}
          </div>
        </div>
      </div>

      {/* Destaque */}
      {data.destaque_segmento && (
        <div style={{
          marginTop: isStory ? 80 : 48, zIndex: 1,
          background: "linear-gradient(90deg, rgba(168,85,247,0.25), rgba(79,70,229,0.25))",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 18, padding: "22px 32px",
          display: "flex", alignItems: "center", gap: 18, justifyContent: "center",
          fontSize: 28, fontWeight: 700,
        }}>
          <Trophy size={32} color="#facc15" />
          <span style={{ color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 3, fontSize: 20 }}>Destaque</span>
          <span>{data.destaque_segmento}</span>
          <span style={{ color: (data.destaque_variacao ?? 0) >= 0 ? "#34d399" : "#f87171" }}>
            {formatPct(data.destaque_variacao)}
          </span>
        </div>
      )}

      {/* Barra esfera */}
      <div style={{ marginTop: isStory ? 80 : 48, zIndex: 1 }}>
        <div style={{
          display: "flex", height: 28, borderRadius: 14, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.15)",
        }}>
          <div style={{ width: `${fed}%`, background: "#3b82f6" }} />
          <div style={{ width: `${est}%`, background: "#a855f7" }} />
          <div style={{ width: `${mun}%`, background: "#06b6d4" }} />
          <div style={{ width: `${out}%`, background: "#4b5563" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 22, fontWeight: 600 }}>
          <span><span style={{ color: "#3b82f6" }}>■</span> Federal {Math.round(fed)}%</span>
          <span><span style={{ color: "#a855f7" }}>■</span> Estadual {Math.round(est)}%</span>
          <span><span style={{ color: "#06b6d4" }}>■</span> Municipal {Math.round(mun)}%</span>
          {out > 0 && <span><span style={{ color: "#4b5563" }}>■</span> Outros {Math.round(out)}%</span>}
        </div>
      </div>

      {/* CTA story */}
      {isStory && (
        <div style={{
          marginTop: 80, textAlign: "center", zIndex: 1,
          fontSize: 32, fontWeight: 700, color: "rgba(255,255,255,0.9)",
        }}>
          Acesse <span style={{ color: "#a5b4fc" }}>startgi.com.br</span><br />
          <span style={{ fontSize: 22, fontWeight: 500, color: "rgba(255,255,255,0.65)" }}>
            para monitorar licitações
          </span>
        </div>
      )}

      {/* Rodapé */}
      <div style={{ flex: 1 }} />
      <div style={{
        zIndex: 1, paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.12)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 22, color: "rgba(255,255,255,0.7)", fontWeight: 500,
      }}>
        <span>startgi.com.br</span>
        <span style={{ color: "#a5b4fc", fontWeight: 700 }}>#ÍndiceStartGi</span>
      </div>
    </div>
  );
}

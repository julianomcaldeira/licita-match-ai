import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function fmt(n: number) {
  return Math.round(n).toLocaleString("pt-BR");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Somente o cron / service role pode disparar
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: snapRows, error: snapError } = await supabase.rpc("ingestao_health_snapshot");
    if (snapError) throw snapError;

    const s: any = Array.isArray(snapRows) ? snapRows[0] : snapRows;
    if (!s) throw new Error("snapshot vazio");

    const dia = new Date().toISOString().slice(0, 10);
    const problemas: string[] = Array.isArray(s.problemas) ? s.problemas : [];
    const severidade: string = s.severidade ?? "ok";

    const { error: upsertError } = await supabase
      .from("ingestao_health_daily")
      .upsert(
        {
          dia,
          pct_cobertura: s.pct_cobertura ?? 0,
          total_no_sistema: s.total_no_sistema ?? 0,
          faltando_total: s.faltando_total ?? 0,
          ingeridas_24h: s.ingeridas_24h ?? 0,
          velocidade_dia: s.velocidade_dia ?? 0,
          eta_dias: s.eta_dias,
          erros_24h: s.erros_24h ?? 0,
          fila_parada: s.fila_parada ?? false,
          severidade,
          problemas,
        },
        { onConflict: "dia" },
      );
    if (upsertError) throw upsertError;

    // Destinatário fixo + admins centrais com e-mail cadastrado
    const DESTINATARIO_PRINCIPAL = "juliano@startgi.com.br";

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin_central");

    const ids = (roles ?? []).map((r: any) => r.user_id);
    let destinatarios: string[] = [DESTINATARIO_PRINCIPAL];
    if (ids.length) {
      const { data: perfis } = await supabase
        .from("profiles")
        .select("email")
        .in("user_id", ids);
      destinatarios = Array.from(
        new Set([
          DESTINATARIO_PRINCIPAL,
          ...(perfis ?? []).map((p: any) => p.email).filter((e: string | null) => !!e),
        ]),
      );
    }

    const etaTexto =
      s.eta_dias == null
        ? "sem previsão (fila parada)"
        : Number(s.eta_dias) > 730
          ? `${(Number(s.eta_dias) / 365).toFixed(1)} anos no ritmo atual`
          : `${fmt(Number(s.eta_dias))} dias no ritmo atual`;

    const templateData = {
      dia,
      severidade,
      pctCobertura: Number(s.pct_cobertura ?? 0).toFixed(1),
      totalNoSistema: fmt(Number(s.total_no_sistema ?? 0)),
      faltandoTotal: fmt(Number(s.faltando_total ?? 0)),
      ingeridas24h: fmt(Number(s.ingeridas_24h ?? 0)),
      velocidadeDia: fmt(Number(s.velocidade_dia ?? 0)),
      etaTexto,
      erros24h: Number(s.erros_24h ?? 0),
      problemas,
      monitorUrl: "https://ipesquisei.com.br/monitor-ingestao",
    };

    const enviados: string[] = [];
    const falhas: Array<{ email: string; erro: string }> = [];

    for (const email of destinatarios) {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "ingestao-diaria",
          recipientEmail: email,
          idempotencyKey: `ingestao-diaria-${dia}-${email}`,
          templateData,
        },
      });
      if (error) falhas.push({ email, erro: String(error.message ?? error) });
      else enviados.push(email);
    }

    if (enviados.length) {
      await supabase
        .from("ingestao_health_daily")
        .update({ email_enviado: true })
        .eq("dia", dia);
    }

    return new Response(
      JSON.stringify({ ok: true, dia, severidade, problemas, enviados, falhas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("daily-ingestion-report falhou", error);
    return new Response(JSON.stringify({ error: String(error?.message ?? error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

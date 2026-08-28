import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

const EVENTOS_PAGO = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (expectedToken && req.headers.get("asaas-access-token") !== expectedToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const evento = await req.json();
    const eventId: string | undefined = evento.id;
    const tipo: string | undefined = evento.event;
    if (!eventId || !tipo) {
      return new Response(JSON.stringify({ error: "Payload sem id ou event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotencia: insercao e a fonte da verdade. Conflito de PK = ja processado.
    const { error: insertErr } = await sb
      .from("asaas_webhook_eventos")
      .insert({ asaas_event_id: eventId, tipo, payload: evento });

    if (insertErr) {
      if (insertErr.code === "23505") {
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertErr;
    }

    const paymentId: string | undefined = evento.payment?.id;
    if (paymentId) {
      const { data: cobranca } = await sb
        .from("asaas_cobrancas")
        .update({ status: evento.payment.status, updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", paymentId)
        .select("empresa_cliente_id, assinatura_id")
        .single();

      if (cobranca && EVENTOS_PAGO.has(tipo)) {
        if (cobranca.assinatura_id) {
          await sb
            .from("assinaturas")
            .update({ status: "ativa", updated_at: new Date().toISOString() })
            .eq("id", cobranca.assinatura_id);
        }
        await sb.from("creditos_movimentos").insert({
          empresa_cliente_id: cobranca.empresa_cliente_id,
          tipo: "pagamento_confirmado",
          creditos: 0,
          referencia: paymentId,
          metadados: { event: tipo },
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

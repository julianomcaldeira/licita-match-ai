import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DEFAULT_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "i-pesquisei <licitacoesalb@iganheicrm.com.br>";

function buildTemplateHtml(templateName: string, data: any): { subject: string; html: string } {
  switch (templateName) {
    case "ingestao-diaria": {
      const severidadeCor =
        data.severidade === "erro"
          ? "#ef4444"
          : data.severidade === "alerta"
          ? "#f59e0b"
          : "#10b981";

      const problemasHtml = (data.problemas || [])
        .map((p: string) => `<li style="color: #ef4444; margin-bottom: 4px;">${p}</li>`)
        .join("");

      return {
        subject: `[i-pesquisei] Relatório de Ingestão Diária — ${data.dia} (${data.severidade.toUpperCase()})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #4f46e5; margin: 0; font-size: 22px;">i-pesquisei</h1>
              <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">Monitor de Saúde da Ingestão de Dados</p>
            </div>

            <div style="background: ${severidadeCor}15; border-left: 4px solid ${severidadeCor}; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
              <strong style="color: ${severidadeCor}; font-size: 15px;">Status do Sistema: ${data.severidade.toUpperCase()}</strong>
              <p style="margin: 4px 0 0 0; color: #334155; font-size: 13px;">Relatório do dia <strong>${data.dia}</strong></p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b;">Cobertura da base:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #0f172a;">${data.pctCobertura}%</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b;">Total indexado no sistema:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #0f172a;">${data.totalNoSistema} editais</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b;">Ingeridas nas últimas 24h:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #10b981;">+${data.ingeridas24h}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b;">Erros nas últimas 24h:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: ${Number(data.erros24h) > 0 ? '#ef4444' : '#64748b'};">${data.erros24h}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Previsão de conclusão total:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #4f46e5;">${data.etaTexto}</td>
              </tr>
            </table>

            ${
              problemasHtml
                ? `
                <div style="margin-bottom: 20px;">
                  <strong style="color: #0f172a; font-size: 13px;">Inconsistências detectadas:</strong>
                  <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 12px;">
                    ${problemasHtml}
                  </ul>
                </div>
              `
                : ""
            }

            <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
              <a href="${data.monitorUrl || 'https://ipesquisei.com.br/monitor-ingestao'}" style="background: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: bold; display: inline-block;">
                Acessar Monitor de Ingestão
              </a>
            </div>
          </div>
        `,
      };
    }

    case "boas-vindas": {
      const nome = data.nome || "Cliente";
      return {
        subject: `Bem-vindo ao i-pesquisei — Comece a encontrar licitações hoje`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
            <h1 style="color: #4f46e5; font-size: 24px; margin-top: 0;">Olá, ${nome}!</h1>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              Seu acesso ao <strong>i-pesquisei</strong> foi criado com sucesso! Você já pode monitorar editais do Brasil inteiro, descobrir concorrentes e analisar a saúde de pagamento dos órgãos públicos.
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; margin: 20px 0;">
              <h3 style="color: #0f172a; font-size: 14px; margin: 0 0 8px 0;">Primeiros passos recomendados:</h3>
              <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.7;">
                <li>Cadastre as <strong>palavras-chave</strong> do seu segmento na página de empresas.</li>
                <li>Consulte o <strong>Score de Bom Pagador</strong> dos órgãos que você quer disputar.</li>
                <li>Acesse o <strong>Radar de Licitações</strong> para ver oportunidades abertas no PNCP.</li>
              </ol>
            </div>
            <div style="text-align: center; margin-top: 24px;">
              <a href="https://ipesquisei.com.br/dashboard" style="background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">
                Acessar Plataforma
              </a>
            </div>
          </div>
        `,
      };
    }

    case "fim-trial": {
      const nome = data.nome || "Cliente";
      const diasRestantes = data.diasRestantes || 2;
      return {
        subject: `[Aviso] Seu teste grátis no i-pesquisei termina em ${diasRestantes} dias`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
            <h1 style="color: #0f172a; font-size: 22px; margin-top: 0;">Olá, ${nome},</h1>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Seu período de teste gratuito de 7 dias do <strong>i-pesquisei</strong> encerra em <strong>${diasRestantes} dias</strong>.
            </p>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Para continuar tendo acesso diário a editais em tempo real, inteligência de concorrentes e scores fiscais de órgãos públicos, ative seu plano agora.
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://ipesquisei.com.br/landing#planos" style="background: #10b981; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">
                Escolher e Ativar Plano
              </a>
            </div>
          </div>
        `,
      };
    }

    default: {
      return {
        subject: data.subject || "Notificação i-pesquisei",
        html: data.html || `<p>${data.message || "Notificação do sistema."}</p>`,
      };
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      recipientEmail,
      subject: customSubject,
      html: customHtml,
      templateName,
      templateData,
      fromEmail,
    } = body;

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: "recipientEmail é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let subject = customSubject;
    let html = customHtml;

    if (templateName) {
      const generated = buildTemplateHtml(templateName, templateData || {});
      subject = customSubject || generated.subject;
      html = customHtml || generated.html;
    }

    if (!subject || !html) {
      return new Response(
        JSON.stringify({ error: "subject e html (ou templateName) são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY não configurada nas variáveis de ambiente do Supabase.");
      return new Response(
        JSON.stringify({
          ok: false,
          error: "RESEND_API_KEY não configurada no Supabase. Configure a chave no painel do Supabase -> Edge Functions -> Secrets.",
          simulated: true,
          recipient: recipientEmail,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const from = fromEmail || DEFAULT_FROM;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: [recipientEmail],
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Erro do Resend:", resendData);
      return new Response(
        JSON.stringify({ error: "Falha no envio pelo Resend", details: resendData }),
        { status: resendRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: resendData.id, recipient: recipientEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Erro interno ao enviar e-mail:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

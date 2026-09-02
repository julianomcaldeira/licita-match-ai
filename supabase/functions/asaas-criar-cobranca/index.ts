import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE_URL = Deno.env.get("ASAAS_BASE_URL") ?? "https://sandbox.asaas.com/api/v3";

class AsaasError extends Error {}

async function asaasFetch(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) throw new Error("ASAAS_API_KEY not configured");
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new AsaasError(`Asaas ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: roleData } = await callerClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .eq("role", "admin_central")
    .single();
  if (!roleData) {
    return new Response(JSON.stringify({ error: "Permissão negada" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { empresaClienteId, planoId } = await req.json();
    if (!empresaClienteId || !planoId) {
      return new Response(JSON.stringify({ error: "empresaClienteId e planoId sao obrigatorios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: empresa, error: empresaErr } = await sb
      .from("empresas_clientes")
      .select("id, nome, cnpj, asaas_customer_id")
      .eq("id", empresaClienteId)
      .single();
    if (empresaErr || !empresa) throw new Error("Empresa nao encontrada");

    const { data: plano, error: planoErr } = await sb
      .from("planos")
      .select("id, nome, preco_centavos, ciclo")
      .eq("id", planoId)
      .single();
    if (planoErr || !plano) throw new Error("Plano nao encontrado");

    const cpfCnpj = (empresa.cnpj || "").replace(/\D/g, "");
    if (!cpfCnpj) {
      return new Response(JSON.stringify({ error: "Empresa sem CNPJ cadastrado — obrigatorio para gerar cobranca" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let asaasCustomerId = empresa.asaas_customer_id as string | null;
    if (asaasCustomerId) {
      // Cliente ja existia no Asaas: mantem CNPJ/nome em dia (podem ter mudado desde a ultima cobranca)
      await asaasFetch(`/customers/${asaasCustomerId}`, {
        method: "POST",
        body: JSON.stringify({ name: empresa.nome, cpfCnpj }),
      });
    } else {
      const customer = await asaasFetch("/customers", {
        method: "POST",
        body: JSON.stringify({ name: empresa.nome, cpfCnpj, externalReference: empresa.id }),
      });
      asaasCustomerId = customer.id;
      await sb.from("empresas_clientes").update({ asaas_customer_id: asaasCustomerId }).eq("id", empresa.id);
    }

    const valor = plano.preco_centavos / 100;
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 3);

    const payment = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: "PIX",
        value: valor,
        dueDate: vencimento.toISOString().slice(0, 10),
        description: `Plano ${plano.nome} (${plano.ciclo})`,
        externalReference: `${empresa.id}:${plano.id}`,
      }),
    });

    const { error: insertErr } = await sb.from("asaas_cobrancas").insert({
      empresa_cliente_id: empresa.id,
      asaas_payment_id: payment.id,
      status: payment.status,
      valor_centavos: plano.preco_centavos,
      vencimento: payment.dueDate,
    });
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        success: true,
        paymentId: payment.id,
        status: payment.status,
        invoiceUrl: payment.invoiceUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const status = err instanceof AsaasError ? 400 : 500;
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

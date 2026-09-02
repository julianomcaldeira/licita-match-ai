
-- ============ empresas_clientes: mapeamento pro cliente no Asaas ============
ALTER TABLE public.empresas_clientes ADD COLUMN asaas_customer_id text;

-- ============ asaas_cobrancas ============
CREATE TABLE public.asaas_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_cliente_id uuid NOT NULL REFERENCES public.empresas_clientes(id) ON DELETE CASCADE,
  assinatura_id uuid REFERENCES public.assinaturas(id) ON DELETE SET NULL,
  asaas_payment_id text UNIQUE NOT NULL,
  status text NOT NULL,
  valor_centavos int NOT NULL,
  vencimento date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX asaas_cobrancas_empresa_idx ON public.asaas_cobrancas(empresa_cliente_id, created_at DESC);
GRANT SELECT ON public.asaas_cobrancas TO authenticated;
GRANT ALL ON public.asaas_cobrancas TO service_role;
ALTER TABLE public.asaas_cobrancas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asaas_cobrancas admin" ON public.asaas_cobrancas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

-- ============ asaas_webhook_eventos: ledger de idempotencia ============
CREATE TABLE public.asaas_webhook_eventos (
  asaas_event_id text PRIMARY KEY,
  tipo text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.asaas_webhook_eventos TO service_role;
ALTER TABLE public.asaas_webhook_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asaas_webhook_eventos admin" ON public.asaas_webhook_eventos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));


-- Raw payload landing zone for PNCP Dados Abertos
CREATE TABLE IF NOT EXISTS public.pncp_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,                    -- 'contrato' | 'item' | 'resultado'
  chave_origem TEXT NOT NULL,            -- numeroControlePNCP, controle_compra/numeroItem, etc
  payload JSONB NOT NULL,
  coletado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT pncp_raw_unique UNIQUE (tipo, chave_origem)
);

CREATE INDEX IF NOT EXISTS idx_pncp_raw_tipo_processado
  ON public.pncp_raw (tipo, processado);
CREATE INDEX IF NOT EXISTS idx_pncp_raw_coletado_em
  ON public.pncp_raw (coletado_em DESC);

ALTER TABLE public.pncp_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin central can read pncp_raw"
  ON public.pncp_raw FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin_central'::app_role));

CREATE POLICY "Service role manages pncp_raw"
  ON public.pncp_raw FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Cursor row used by the new dadosabertos ingestion (date-based)
INSERT INTO public.sync_status (api_source, modalidade, last_date_processed, total_synced)
VALUES ('pncp-dadosabertos-contratos', 0, '', 0)
ON CONFLICT DO NOTHING;

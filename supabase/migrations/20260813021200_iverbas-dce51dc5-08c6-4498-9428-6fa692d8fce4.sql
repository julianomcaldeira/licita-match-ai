
CREATE TABLE public.emendas_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ano INTEGER NOT NULL,
  codigo_emenda TEXT NOT NULL,
  documento_id TEXT NOT NULL,
  orgao_codigo TEXT,
  orgao_nome TEXT,
  orgao_superior_codigo TEXT,
  orgao_superior_nome TEXT,
  unidade_gestora_codigo TEXT,
  unidade_gestora_nome TEXT,
  fase TEXT,
  valor_empenhado NUMERIC NOT NULL DEFAULT 0,
  valor_liquidado NUMERIC NOT NULL DEFAULT 0,
  valor_pago NUMERIC NOT NULL DEFAULT 0,
  valor_documento NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ano, codigo_emenda, documento_id)
);

CREATE INDEX idx_emendas_documentos_ano_codigo ON public.emendas_documentos(ano, codigo_emenda);
CREATE INDEX idx_emendas_documentos_orgao ON public.emendas_documentos(ano, orgao_codigo);

GRANT SELECT ON public.emendas_documentos TO authenticated;
GRANT ALL ON public.emendas_documentos TO service_role;

ALTER TABLE public.emendas_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read emendas_documentos"
  ON public.emendas_documentos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access emendas_documentos"
  ON public.emendas_documentos FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_emendas_documentos_updated_at
  BEFORE UPDATE ON public.emendas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add enrichment status to parent table
ALTER TABLE public.emendas_parlamentares
  ADD COLUMN IF NOT EXISTS docs_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS docs_count INTEGER NOT NULL DEFAULT 0;

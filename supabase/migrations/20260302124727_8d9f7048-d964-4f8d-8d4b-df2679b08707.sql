
-- Tabela de contratos do Portal da Transparência
CREATE TABLE public.contratos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cnpj_orgao TEXT NOT NULL,
  numero_contrato TEXT NOT NULL,
  orgao_nome TEXT,
  orgao_codigo TEXT,
  fornecedor_nome TEXT,
  fornecedor_cnpj TEXT,
  objeto TEXT,
  valor_inicial NUMERIC,
  valor_final NUMERIC,
  data_assinatura DATE,
  data_vigencia_inicio DATE,
  data_vigencia_fim DATE,
  data_publicacao DATE,
  situacao TEXT,
  categoria TEXT,
  modalidade_compra TEXT,
  numero_licitacao TEXT,
  licitacao_id UUID REFERENCES public.licitacoes(id) ON DELETE SET NULL,
  raw_json JSONB,
  fonte TEXT NOT NULL DEFAULT 'PORTAL_TRANSPARENCIA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cnpj_orgao, numero_contrato)
);

-- Enable RLS
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

-- Leitura pública para autenticados
CREATE POLICY "Authenticated users can read contratos"
  ON public.contratos FOR SELECT TO authenticated USING (true);

-- Escrita apenas via service_role (ingestão)
CREATE POLICY "Service role can manage contratos"
  ON public.contratos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Índices para performance
CREATE INDEX idx_contratos_cnpj_orgao ON public.contratos(cnpj_orgao);
CREATE INDEX idx_contratos_fornecedor_cnpj ON public.contratos(fornecedor_cnpj);
CREATE INDEX idx_contratos_data_assinatura ON public.contratos(data_assinatura);
CREATE INDEX idx_contratos_licitacao_id ON public.contratos(licitacao_id);
CREATE INDEX idx_contratos_objeto_trgm ON public.contratos USING gin(objeto gin_trgm_ops);

-- Trigger para updated_at
CREATE TRIGGER update_contratos_updated_at
  BEFORE UPDATE ON public.contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

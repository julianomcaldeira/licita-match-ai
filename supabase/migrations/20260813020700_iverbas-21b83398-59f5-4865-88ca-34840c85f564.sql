
-- Table: execucao_diaria_empresa
-- Consolidação diária de pagamentos por empresa, dirigida exclusivamente por pagamento real
CREATE TABLE public.execucao_diaria_empresa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_pagamento DATE NOT NULL,
  orgao_codigo TEXT NOT NULL,
  orgao_nome TEXT NOT NULL,
  cnpj_favorecido TEXT NOT NULL,
  nome_favorecido TEXT NOT NULL,
  total_pago_dia NUMERIC NOT NULL DEFAULT 0,
  total_empenhado_relacionado NUMERIC NOT NULL DEFAULT 0,
  numero_empenhos INTEGER NOT NULL DEFAULT 0,
  fonte_dados TEXT NOT NULL DEFAULT 'api-pagamentos',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(data_pagamento, orgao_codigo, cnpj_favorecido)
);

-- Table: consolidacao_diaria_validacao
-- Registro de validação de integridade por dia (total governo vs total empresas)
CREATE TABLE public.consolidacao_diaria_validacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_pagamento DATE NOT NULL UNIQUE,
  total_governo NUMERIC NOT NULL DEFAULT 0,
  total_empresas NUMERIC NOT NULL DEFAULT 0,
  divergencia NUMERIC NOT NULL DEFAULT 0,
  divergencia_pct NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'ok', 'divergente', 'pendente'
  paginas_processadas INTEGER NOT NULL DEFAULT 0,
  registros_brutos INTEGER NOT NULL DEFAULT 0,
  registros_anulados_removidos INTEGER NOT NULL DEFAULT 0,
  registros_duplicados_removidos INTEGER NOT NULL DEFAULT 0,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_exec_diaria_data ON public.execucao_diaria_empresa(data_pagamento);
CREATE INDEX idx_exec_diaria_cnpj ON public.execucao_diaria_empresa(cnpj_favorecido);
CREATE INDEX idx_exec_diaria_orgao ON public.execucao_diaria_empresa(orgao_codigo);
CREATE INDEX idx_valid_diaria_status ON public.consolidacao_diaria_validacao(status);

-- RLS
ALTER TABLE public.execucao_diaria_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidacao_diaria_validacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read daily execution"
  ON public.execucao_diaria_empresa FOR SELECT USING (true);

CREATE POLICY "Authenticated can read daily validation"
  ON public.consolidacao_diaria_validacao FOR SELECT USING (true);

-- Updated_at trigger
CREATE TRIGGER update_exec_diaria_updated_at
  BEFORE UPDATE ON public.execucao_diaria_empresa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

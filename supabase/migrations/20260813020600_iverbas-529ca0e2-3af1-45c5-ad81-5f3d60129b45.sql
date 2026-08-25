
-- ETAPA 1: Tabela de mapeamento de campos da API
CREATE TABLE public.api_field_mapping (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_nome text NOT NULL,
  campo_original text NOT NULL,
  conceito_padronizado text NOT NULL CHECK (conceito_padronizado IN (
    'orcamento_autorizado', 'orcamento_atualizado', 'empenhado', 'liquidado', 'pago'
  )),
  granularidade text NOT NULL CHECK (granularidade IN ('evento', 'acumulado', 'item')),
  data_referencia_tipo text NOT NULL CHECK (data_referencia_tipo IN ('emissao', 'pagamento', 'competencia')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(api_nome, campo_original)
);
ALTER TABLE public.api_field_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read mappings" ON public.api_field_mapping FOR SELECT USING (true);

-- ETAPA 5: Tabela de log de integridade
CREATE TABLE public.data_integrity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_erro text NOT NULL,
  entidade text NOT NULL,
  valor_detectado numeric NOT NULL DEFAULT 0,
  valor_referencia numeric NOT NULL DEFAULT 0,
  divergencia_pct numeric,
  data timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'aberto',
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.data_integrity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read integrity logs" ON public.data_integrity_logs FOR SELECT USING (true);

-- ETAPA 6: Modelo canônico — Orçamento Unificado
CREATE TABLE public.orcamento_unificado (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orgao_codigo text NOT NULL,
  orgao_nome text NOT NULL,
  ano integer NOT NULL,
  orcamento_autorizado numeric NOT NULL DEFAULT 0,
  orcamento_atualizado numeric NOT NULL DEFAULT 0,
  empenhado_total numeric NOT NULL DEFAULT 0,
  liquidado_total numeric NOT NULL DEFAULT 0,
  pago_total numeric NOT NULL DEFAULT 0,
  fonte_dados text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(orgao_codigo, ano)
);
ALTER TABLE public.orcamento_unificado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read unified budget" ON public.orcamento_unificado FOR SELECT USING (true);

CREATE TRIGGER update_orcamento_unificado_updated_at
  BEFORE UPDATE ON public.orcamento_unificado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ETAPA 6: Modelo canônico — Execução Unificada
CREATE TABLE public.execucao_unificada (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orgao_codigo text NOT NULL,
  orgao_nome text NOT NULL,
  fornecedor_nome text,
  fornecedor_id text,
  ano integer NOT NULL,
  mes integer,
  numero_empenho text,
  data_execucao_padronizada date,
  empenhado_total numeric NOT NULL DEFAULT 0,
  liquidado_total numeric NOT NULL DEFAULT 0,
  pago_total numeric NOT NULL DEFAULT 0,
  fonte_dados text,
  chave_dedup text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(orgao_codigo, fornecedor_id, ano, mes, numero_empenho)
);
ALTER TABLE public.execucao_unificada ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read unified execution" ON public.execucao_unificada FOR SELECT USING (true);

CREATE INDEX idx_execucao_unificada_orgao_ano ON public.execucao_unificada(orgao_codigo, ano);
CREATE INDEX idx_execucao_unificada_fornecedor ON public.execucao_unificada(fornecedor_id);
CREATE INDEX idx_execucao_unificada_chave ON public.execucao_unificada(chave_dedup);

CREATE TRIGGER update_execucao_unificada_updated_at
  BEFORE UPDATE ON public.execucao_unificada
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ETAPA 8: Tabela de log detalhado de processamento
CREATE TABLE public.processing_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orgao_codigo text NOT NULL,
  orgao_nome text NOT NULL,
  ano integer NOT NULL,
  etapa text NOT NULL,
  registros_importados integer NOT NULL DEFAULT 0,
  registros_consolidados integer NOT NULL DEFAULT 0,
  total_bruto numeric NOT NULL DEFAULT 0,
  total_consolidado numeric NOT NULL DEFAULT 0,
  diferenca_pct numeric NOT NULL DEFAULT 0,
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.processing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read processing logs" ON public.processing_logs FOR SELECT USING (true);

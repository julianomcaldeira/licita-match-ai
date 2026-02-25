
-- Tabela de licitações (dados normalizados do PNCP)
CREATE TABLE public.licitacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_origem TEXT NOT NULL,
  fonte TEXT NOT NULL DEFAULT 'PNCP',
  orgao TEXT NOT NULL,
  modalidade TEXT,
  objeto TEXT NOT NULL,
  data_publicacao DATE,
  data_resultado DATE,
  valor_estimado NUMERIC,
  valor_homologado NUMERIC,
  situacao TEXT,
  numero_controle_pncp TEXT,
  uf TEXT,
  municipio TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id_origem, fonte)
);

ALTER TABLE public.licitacoes ENABLE ROW LEVEL SECURITY;

-- Licitações são dados públicos, leitura aberta para autenticados
CREATE POLICY "Authenticated users can read licitacoes"
  ON public.licitacoes FOR SELECT TO authenticated USING (true);

-- Apenas service_role (edge functions) pode inserir/atualizar
CREATE POLICY "Service role can manage licitacoes"
  ON public.licitacoes FOR ALL USING (true) WITH CHECK (true);

-- Tabela de itens de licitação
CREATE TABLE public.licitacao_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  numero_item INTEGER,
  descricao TEXT NOT NULL,
  quantidade NUMERIC,
  unidade TEXT,
  valor_unitario_estimado NUMERIC,
  valor_unitario_final NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.licitacao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read licitacao_itens"
  ON public.licitacao_itens FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage licitacao_itens"
  ON public.licitacao_itens FOR ALL USING (true) WITH CHECK (true);

-- Tabela de vencedores
CREATE TABLE public.licitacao_vencedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.licitacao_itens(id) ON DELETE CASCADE,
  cnpj TEXT,
  razao_social TEXT,
  valor_final NUMERIC,
  percentual_desconto NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.licitacao_vencedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read licitacao_vencedores"
  ON public.licitacao_vencedores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage licitacao_vencedores"
  ON public.licitacao_vencedores FOR ALL USING (true) WITH CHECK (true);

-- Log de ingestão para controle incremental
CREATE TABLE public.ingestao_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fonte TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  data_inicio TIMESTAMPTZ,
  data_fim TIMESTAMPTZ,
  registros_processados INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ingestao_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ingestao_logs"
  ON public.ingestao_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage ingestao_logs"
  ON public.ingestao_logs FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_licitacoes_data_publicacao ON public.licitacoes(data_publicacao DESC);
CREATE INDEX idx_licitacoes_orgao ON public.licitacoes(orgao);
CREATE INDEX idx_licitacoes_situacao ON public.licitacoes(situacao);
CREATE INDEX idx_licitacoes_fonte ON public.licitacoes(fonte);
CREATE INDEX idx_licitacao_itens_licitacao ON public.licitacao_itens(licitacao_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_licitacoes_updated_at
  BEFORE UPDATE ON public.licitacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ingestao_logs_updated_at
  BEFORE UPDATE ON public.ingestao_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Empenhos: valores comprometidos/liquidados/pagos ligados a contratos
CREATE TABLE public.empenhos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cnpj_orgao TEXT NOT NULL,
  codigo_siafi_orgao TEXT,
  numero_empenho TEXT NOT NULL,
  numero_documento TEXT,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  licitacao_id UUID REFERENCES public.licitacoes(id) ON DELETE SET NULL,
  fornecedor_cnpj TEXT,
  fornecedor_nome TEXT,
  orgao_nome TEXT,
  data_emissao DATE,
  valor_empenhado NUMERIC,
  valor_liquidado NUMERIC,
  valor_pago NUMERIC,
  observacao TEXT,
  fonte TEXT NOT NULL DEFAULT 'PORTAL_TRANSPARENCIA',
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT empenhos_unique_key UNIQUE (fonte, cnpj_orgao, numero_empenho)
);

CREATE INDEX idx_empenhos_contrato_id ON public.empenhos(contrato_id);
CREATE INDEX idx_empenhos_licitacao_id ON public.empenhos(licitacao_id);
CREATE INDEX idx_empenhos_cnpj_orgao ON public.empenhos(cnpj_orgao);
CREATE INDEX idx_empenhos_numero_documento ON public.empenhos(numero_documento);
CREATE INDEX idx_empenhos_data_emissao ON public.empenhos(data_emissao DESC);
CREATE INDEX idx_empenhos_fornecedor_cnpj ON public.empenhos(fornecedor_cnpj);

GRANT SELECT ON public.empenhos TO authenticated;
GRANT ALL ON public.empenhos TO service_role;

ALTER TABLE public.empenhos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read empenhos"
  ON public.empenhos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages empenhos"
  ON public.empenhos FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_empenhos_updated_at
  BEFORE UPDATE ON public.empenhos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: agrega empenhos por conjunto de licitação (usado pela coluna "Empenhado" na tabela)
CREATE OR REPLACE FUNCTION public.empenhos_por_licitacoes(p_licitacao_ids UUID[])
RETURNS TABLE (
  licitacao_id UUID,
  total_empenhado NUMERIC,
  total_liquidado NUMERIC,
  total_pago NUMERIC,
  qtd_empenhos INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.licitacao_id,
    COALESCE(SUM(e.valor_empenhado), 0)::numeric AS total_empenhado,
    COALESCE(SUM(e.valor_liquidado), 0)::numeric AS total_liquidado,
    COALESCE(SUM(e.valor_pago), 0)::numeric AS total_pago,
    COUNT(*)::integer AS qtd_empenhos
  FROM public.empenhos e
  WHERE e.licitacao_id = ANY(p_licitacao_ids)
  GROUP BY e.licitacao_id;
$$;

GRANT EXECUTE ON FUNCTION public.empenhos_por_licitacoes(UUID[]) TO authenticated, service_role;

-- RPC: retorna candidatos (contratos) para ingestão de empenhos, priorizando os vinculados a clientes
CREATE OR REPLACE FUNCTION public.contratos_para_ingestao_empenhos(
  p_limit INTEGER DEFAULT 200,
  p_only_clientes BOOLEAN DEFAULT true
)
RETURNS TABLE (
  contrato_id UUID,
  cnpj_orgao TEXT,
  numero_contrato TEXT,
  codigo_siafi TEXT,
  licitacao_id UUID,
  fornecedor_cnpj TEXT,
  data_assinatura DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS contrato_id,
    c.cnpj_orgao,
    c.numero_contrato,
    s.codigo_siafi,
    c.licitacao_id,
    c.fornecedor_cnpj,
    COALESCE(c.data_assinatura, c.data_publicacao) AS data_assinatura
  FROM public.contratos c
  JOIN public.orgao_siafi_cache s
    ON s.cnpj = c.cnpj_orgao AND s.found = true AND s.codigo_siafi IS NOT NULL
  WHERE c.fonte = 'PORTAL_TRANSPARENCIA'
    AND (
      NOT p_only_clientes
      OR EXISTS (
        SELECT 1 FROM public.cliente_cnpjs cc
        WHERE regexp_replace(COALESCE(c.fornecedor_cnpj, ''), '\D', '', 'g')
              = regexp_replace(cc.cnpj, '\D', '', 'g')
      )
    )
  ORDER BY COALESCE(c.data_assinatura, c.data_publicacao) DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.contratos_para_ingestao_empenhos(INTEGER, BOOLEAN) TO authenticated, service_role;

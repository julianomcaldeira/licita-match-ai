
-- Filtros ILIKE '%x%' em modalidade / situacao / municipio (trigram)
CREATE INDEX IF NOT EXISTS idx_licitacoes_modalidade_trgm
  ON public.licitacoes USING gin (lower(modalidade) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_licitacoes_situacao_trgm
  ON public.licitacoes USING gin (lower(situacao) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_licitacoes_municipio_trgm
  ON public.licitacoes USING gin (lower(municipio) gin_trgm_ops);

-- Órgão em lower() (o índice atual é sobre a coluna crua)
CREATE INDEX IF NOT EXISTS idx_licitacoes_orgao_lower_trgm
  ON public.licitacoes USING gin (lower(orgao) gin_trgm_ops);

-- Combinação UF + data (filtro mais comum na tela)
CREATE INDEX IF NOT EXISTS idx_licitacoes_uf_data
  ON public.licitacoes (uf, data_publicacao DESC NULLS LAST);

-- Ordenação por valor estimado
CREATE INDEX IF NOT EXISTS idx_licitacoes_valor_estimado_desc
  ON public.licitacoes (valor_estimado DESC NULLS LAST);

-- Recorte "com vencedor" (valor_homologado > 0) ordenado por data
CREATE INDEX IF NOT EXISTS idx_licitacoes_homologadas_data
  ON public.licitacoes (data_publicacao DESC NULLS LAST)
  WHERE valor_homologado > 0;

-- Vencedores: busca textual em lower(razao_social) e ordenação por valor
CREATE INDEX IF NOT EXISTS idx_lv_razao_lower_trgm
  ON public.licitacao_vencedores USING gin (lower(razao_social) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lv_item_valor
  ON public.licitacao_vencedores (item_id, valor_final DESC NULLS LAST);

-- Contratos: filtros por fornecedor/órgão em texto
CREATE INDEX IF NOT EXISTS idx_contratos_fornecedor_nome_trgm
  ON public.contratos USING gin (lower(fornecedor_nome) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contratos_orgao_nome_trgm
  ON public.contratos USING gin (lower(orgao_nome) gin_trgm_ops);

ANALYZE public.licitacoes;
ANALYZE public.licitacao_vencedores;
ANALYZE public.contratos;

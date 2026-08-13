CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_licitacao_vencedores_razao_trgm
  ON public.licitacao_vencedores USING gin (razao_social gin_trgm_ops);
ANALYZE public.licitacao_vencedores;
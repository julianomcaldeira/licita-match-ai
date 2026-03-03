CREATE INDEX IF NOT EXISTS idx_licitacoes_valor_homologado_desc 
ON licitacoes(valor_homologado DESC NULLS LAST, valor_estimado DESC NULLS LAST);

-- Also add index for orgao ILIKE (replacing expensive trigram similarity %)
CREATE INDEX IF NOT EXISTS idx_licitacoes_orgao_lower ON licitacoes(lower(orgao));
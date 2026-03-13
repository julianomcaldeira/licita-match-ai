
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_descricao_trgm 
ON licitacao_itens USING gin (descricao gin_trgm_ops);

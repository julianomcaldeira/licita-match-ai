-- Create index to speed up the EXISTS subquery for winner check
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_licitacao_id ON licitacao_itens(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_vencedores_item_id ON licitacao_vencedores(item_id);
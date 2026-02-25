
-- Index to speed up the LEFT JOIN in licitacoes_sem_itens
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_licitacao_id ON public.licitacao_itens(licitacao_id);

-- Index on licitacoes for the WHERE + ORDER BY
CREATE INDEX IF NOT EXISTS idx_licitacoes_numero_controle_created ON public.licitacoes(created_at ASC) WHERE numero_controle_pncp IS NOT NULL;

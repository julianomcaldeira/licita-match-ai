CREATE INDEX IF NOT EXISTS idx_licitacoes_modalidade ON public.licitacoes(modalidade);
CREATE INDEX IF NOT EXISTS idx_licitacoes_uf ON public.licitacoes(uf);
CREATE INDEX IF NOT EXISTS idx_licitacoes_data_publicacao ON public.licitacoes(data_publicacao DESC);
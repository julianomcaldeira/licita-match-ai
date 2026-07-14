
DROP INDEX IF EXISTS public.idx_licitacao_itens_descricao_trgm;
REINDEX TABLE public.licitacao_itens;

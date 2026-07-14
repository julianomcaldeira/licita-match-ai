
-- Etapa 1: limpar fila pncp_raw (TRUNCATE é instantâneo e reclama disco na hora)
TRUNCATE TABLE public.pncp_raw;

-- Etapa 2: remover índices sem uso ou duplicados
DROP INDEX IF EXISTS public.idx_licitacoes_objeto_funaccent_trgm;
DROP INDEX IF EXISTS public.idx_licitacoes_orgao_lower;
DROP INDEX IF EXISTS public.idx_licitacoes_numero_controle_created;
DROP INDEX IF EXISTS public.idx_lic_venc_cnpj_digits;
DROP INDEX IF EXISTS public.idx_licitacoes_modalidade;
DROP INDEX IF EXISTS public.idx_contratos_fornecedor_cnpj_digits;
DROP INDEX IF EXISTS public.idx_contratos_data_efetiva;
DROP INDEX IF EXISTS public.idx_licitacoes_objeto_trgm;

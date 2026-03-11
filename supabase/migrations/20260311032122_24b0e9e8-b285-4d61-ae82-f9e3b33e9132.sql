-- Change unique constraint from (item_id) to (item_id, cnpj) to support multiple winners per item
ALTER TABLE public.licitacao_vencedores DROP CONSTRAINT IF EXISTS uq_licitacao_vencedores_item;
ALTER TABLE public.licitacao_vencedores ADD CONSTRAINT uq_licitacao_vencedores_item_fornecedor UNIQUE (item_id, cnpj);
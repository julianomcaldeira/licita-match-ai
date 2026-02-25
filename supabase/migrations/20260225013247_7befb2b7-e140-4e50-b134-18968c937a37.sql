-- Add unique constraints for upsert operations on licitacao_itens and licitacao_vencedores
ALTER TABLE public.licitacao_itens ADD CONSTRAINT uq_licitacao_itens_licitacao_numero UNIQUE (licitacao_id, numero_item);
ALTER TABLE public.licitacao_vencedores ADD CONSTRAINT uq_licitacao_vencedores_item UNIQUE (item_id);
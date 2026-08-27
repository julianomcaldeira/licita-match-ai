
-- pg_cron e pg_net ja instalados pela migration 20260225031423 do iPesquisei

-- Add unique constraint for orcamento upsert
ALTER TABLE public.orcamento_anual ADD CONSTRAINT uq_orcamento_anual
  UNIQUE (ano, orgao, programa, acao, natureza_despesa);

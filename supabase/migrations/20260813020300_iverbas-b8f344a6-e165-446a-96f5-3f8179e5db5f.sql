
-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add unique constraint for orcamento upsert
ALTER TABLE public.orcamento_anual ADD CONSTRAINT uq_orcamento_anual
  UNIQUE (ano, orgao, programa, acao, natureza_despesa);

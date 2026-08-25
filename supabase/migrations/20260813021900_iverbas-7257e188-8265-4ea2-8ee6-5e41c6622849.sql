
ALTER TABLE public.consolidacao_diaria_validacao
  ADD COLUMN IF NOT EXISTS orgao_codigo text,
  ADD COLUMN IF NOT EXISTS orgao_nome text,
  ADD COLUMN IF NOT EXISTS ano integer,
  ADD COLUMN IF NOT EXISTS total_amostra numeric,
  ADD COLUMN IF NOT EXISTS total_oficial numeric,
  ADD COLUMN IF NOT EXISTS cobertura_pct numeric;

ALTER TABLE public.consolidacao_diaria_validacao ALTER COLUMN total_governo DROP NOT NULL;
ALTER TABLE public.consolidacao_diaria_validacao ALTER COLUMN total_empresas DROP NOT NULL;
ALTER TABLE public.consolidacao_diaria_validacao ALTER COLUMN divergencia DROP NOT NULL;
ALTER TABLE public.consolidacao_diaria_validacao ALTER COLUMN divergencia_pct DROP NOT NULL;

ALTER TABLE public.consolidacao_diaria_validacao DROP CONSTRAINT IF EXISTS consolidacao_diaria_validacao_data_pagamento_key;

CREATE UNIQUE INDEX IF NOT EXISTS consolidacao_diaria_validacao_orgao_ano_uk
  ON public.consolidacao_diaria_validacao (orgao_codigo, ano)
  WHERE orgao_codigo IS NOT NULL AND ano IS NOT NULL;

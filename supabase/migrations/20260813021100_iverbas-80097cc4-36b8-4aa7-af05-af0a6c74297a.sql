
ALTER TABLE public.emendas_parlamentares
  ALTER COLUMN orgao_codigo DROP NOT NULL,
  ALTER COLUMN orgao_nome DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS tipo_emenda_oficial text,
  ADD COLUMN IF NOT EXISTS numero_emenda text,
  ADD COLUMN IF NOT EXISTS valor_resto_pago numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_resto_cancelado numeric NOT NULL DEFAULT 0;

ALTER TABLE public.emendas_parlamentares DROP CONSTRAINT IF EXISTS emendas_parlamentares_unique;
ALTER TABLE public.emendas_parlamentares ADD CONSTRAINT emendas_parlamentares_unique UNIQUE (ano, codigo_emenda);

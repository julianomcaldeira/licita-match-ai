
-- 1) Ensure chave_dedup is UNIQUE on execucao_unificada (dedup keeping most recent by id)
DELETE FROM public.execucao_unificada a
USING public.execucao_unificada b
WHERE a.chave_dedup IS NOT NULL
  AND a.chave_dedup = b.chave_dedup
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_execucao_unificada_chave_dedup
  ON public.execucao_unificada (chave_dedup)
  WHERE chave_dedup IS NOT NULL;

-- 2) Add sync_batch to legacy tables for safe swap strategy
ALTER TABLE public.orcamento_anual
  ADD COLUMN IF NOT EXISTS sync_batch timestamptz;

ALTER TABLE public.execucao_despesa
  ADD COLUMN IF NOT EXISTS sync_batch timestamptz;

CREATE INDEX IF NOT EXISTS idx_orcamento_anual_sync_batch
  ON public.orcamento_anual (ano, sync_batch);
CREATE INDEX IF NOT EXISTS idx_execucao_despesa_sync_batch
  ON public.execucao_despesa (ano, sync_batch);

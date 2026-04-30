-- 1) Drop both signatures explicitly to avoid PostgREST cache mismatch
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'licitacoes_sem_itens'
  LOOP
    EXECUTE format('DROP FUNCTION %I.%I(%s)', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Helper indexes for the pending queue (idempotent)
CREATE INDEX IF NOT EXISTS idx_licitacoes_pending_winners_created
  ON public.licitacoes (created_at)
  WHERE numero_controle_pncp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_licitacao_itens_with_winner
  ON public.licitacao_vencedores (item_id);

-- 3) Cursor-based version. No global ORDER BY, no expensive CASE.
--    Caller passes the last created_at it has already processed and we
--    walk forward with a simple index range scan.
CREATE OR REPLACE FUNCTION public.licitacoes_sem_itens(
  lim integer DEFAULT 200,
  after_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, numero_controle_pncp text, raw_json jsonb, created_at timestamptz)
LANGUAGE sql
STABLE
SET statement_timeout TO '60s'
AS $function$
  SELECT l.id, l.numero_controle_pncp, l.raw_json, l.created_at
  FROM public.licitacoes l
  WHERE l.numero_controle_pncp IS NOT NULL
    AND (after_created_at IS NULL OR l.created_at > after_created_at)
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.licitacao_itens li
        WHERE li.licitacao_id = l.id
      )
      OR (
        COALESCE(l.valor_homologado, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM public.licitacao_itens li
          JOIN public.licitacao_vencedores lv ON lv.item_id = li.id
          WHERE li.licitacao_id = l.id
        )
      )
    )
  ORDER BY l.created_at ASC
  LIMIT lim;
$function$;

-- 4) Lightweight count helper (estimate via reltuples is not reliable here,
--    but we cap it to avoid expensive scans).
CREATE OR REPLACE FUNCTION public.licitacoes_pendentes_winners_count(p_max integer DEFAULT 500000)
RETURNS bigint
LANGUAGE sql
STABLE
SET statement_timeout TO '20s'
AS $function$
  SELECT COUNT(*)::bigint FROM (
    SELECT 1
    FROM public.licitacoes l
    WHERE l.numero_controle_pncp IS NOT NULL
      AND (
        COALESCE(l.valor_homologado, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.licitacao_itens li
          JOIN public.licitacao_vencedores lv ON lv.item_id = li.id
          WHERE li.licitacao_id = l.id
        )
      )
    LIMIT p_max
  ) s;
$function$;
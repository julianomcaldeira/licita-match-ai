-- Tabela de estado para refresh incremental das MVs de resumo
CREATE TABLE IF NOT EXISTS public.mv_refresh_state (
  mv_name text PRIMARY KEY,
  last_refresh_at timestamptz NOT NULL DEFAULT now(),
  last_seen_max timestamptz,
  refresh_count integer NOT NULL DEFAULT 0,
  last_duration_ms integer
);

ALTER TABLE public.mv_refresh_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read mv_refresh_state" ON public.mv_refresh_state;
CREATE POLICY "Authenticated can read mv_refresh_state"
  ON public.mv_refresh_state FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role manages mv_refresh_state" ON public.mv_refresh_state;
CREATE POLICY "Service role manages mv_refresh_state"
  ON public.mv_refresh_state FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.mv_refresh_state (mv_name) VALUES ('mv_empresas_vencedoras'), ('mv_orgaos')
ON CONFLICT (mv_name) DO NOTHING;

-- Refresh inteligente: só refaz a MV se houve novos dados desde o último refresh
CREATE OR REPLACE FUNCTION public.refresh_summary_mvs_if_dirty()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '180s'
AS $$
DECLARE
  v_last_venc timestamptz;
  v_last_lic  timestamptz;
  v_state_venc timestamptz;
  v_state_lic  timestamptz;
  v_t0 timestamptz;
  v_dur int;
  v_did jsonb := '[]'::jsonb;
BEGIN
  -- Lock leve para evitar dois workers refreshando em paralelo
  IF NOT pg_try_advisory_xact_lock(72513) THEN
    RETURN jsonb_build_object('skipped','locked');
  END IF;

  SELECT MAX(created_at) INTO v_last_venc FROM public.licitacao_vencedores;
  SELECT MAX(updated_at) INTO v_last_lic  FROM public.licitacoes;

  SELECT last_seen_max INTO v_state_venc FROM public.mv_refresh_state WHERE mv_name='mv_empresas_vencedoras';
  SELECT last_seen_max INTO v_state_lic  FROM public.mv_refresh_state WHERE mv_name='mv_orgaos';

  -- mv_empresas_vencedoras: depende de novos vencedores
  IF v_last_venc IS NOT NULL AND (v_state_venc IS NULL OR v_last_venc > v_state_venc) THEN
    v_t0 := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_empresas_vencedoras;
    v_dur := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_t0)::int;
    UPDATE public.mv_refresh_state
       SET last_refresh_at = now(),
           last_seen_max   = v_last_venc,
           refresh_count   = refresh_count + 1,
           last_duration_ms = v_dur
     WHERE mv_name = 'mv_empresas_vencedoras';
    v_did := v_did || jsonb_build_object('mv','mv_empresas_vencedoras','duration_ms',v_dur);
  END IF;

  -- mv_orgaos: depende de novas/alteradas licitações
  IF v_last_lic IS NOT NULL AND (v_state_lic IS NULL OR v_last_lic > v_state_lic) THEN
    v_t0 := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_orgaos;
    v_dur := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_t0)::int;
    UPDATE public.mv_refresh_state
       SET last_refresh_at = now(),
           last_seen_max   = v_last_lic,
           refresh_count   = refresh_count + 1,
           last_duration_ms = v_dur
     WHERE mv_name = 'mv_orgaos';
    v_did := v_did || jsonb_build_object('mv','mv_orgaos','duration_ms',v_dur);
  END IF;

  RETURN jsonb_build_object('refreshed', v_did, 'checked_at', now());
END;
$$;
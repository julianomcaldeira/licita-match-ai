CREATE TABLE IF NOT EXISTS public.ingestao_health_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia date NOT NULL UNIQUE,
  pct_cobertura numeric NOT NULL DEFAULT 0,
  total_no_sistema bigint NOT NULL DEFAULT 0,
  faltando_total bigint NOT NULL DEFAULT 0,
  ingeridas_24h bigint NOT NULL DEFAULT 0,
  velocidade_dia numeric NOT NULL DEFAULT 0,
  eta_dias numeric,
  erros_24h integer NOT NULL DEFAULT 0,
  fila_parada boolean NOT NULL DEFAULT false,
  severidade text NOT NULL DEFAULT 'ok',
  problemas jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_enviado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ingestao_health_daily TO authenticated;
GRANT ALL ON public.ingestao_health_daily TO service_role;

ALTER TABLE public.ingestao_health_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem saude da ingestao"
  ON public.ingestao_health_daily FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_ingestao_health_daily_updated ON public.ingestao_health_daily;
CREATE TRIGGER trg_ingestao_health_daily_updated
  BEFORE UPDATE ON public.ingestao_health_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.ingestao_health_snapshot()
RETURNS TABLE (
  pct_cobertura numeric,
  total_no_sistema bigint,
  faltando_total bigint,
  ingeridas_24h bigint,
  velocidade_dia numeric,
  eta_dias numeric,
  erros_24h integer,
  fila_parada boolean,
  severidade text,
  problemas jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_erros integer := 0;
  v_problemas jsonb := '[]'::jsonb;
  v_sev text := 'ok';
  v_fila_parada boolean := false;
BEGIN
  SELECT * INTO r FROM public.cobertura_resumo() LIMIT 1;

  SELECT count(*)::int INTO v_erros
  FROM public.ingestao_logs
  WHERE created_at > now() - interval '24 hours'
    AND lower(coalesce(status, '')) IN ('error', 'erro', 'failed', 'falha');

  v_fila_parada := coalesce(r.velocidade_dia, 0) < 100 AND coalesce(r.faltando_total, 0) > 0;

  IF v_fila_parada THEN
    v_problemas := v_problemas || jsonb_build_array(
      'Fila praticamente parada: menos de 100 registros ingeridos por dia com backlog pendente.'
    );
    v_sev := 'critico';
  END IF;

  IF v_erros > 0 THEN
    v_problemas := v_problemas || jsonb_build_array(
      format('%s execucoes com erro nas ultimas 24h (ver Monitor de Ingestao).', v_erros)
    );
    IF v_erros >= 10 THEN v_sev := 'critico';
    ELSIF v_sev <> 'critico' THEN v_sev := 'atencao';
    END IF;
  END IF;

  IF coalesce(r.ingeridas_24h, 0) = 0 AND coalesce(r.faltando_total, 0) > 0 THEN
    v_problemas := v_problemas || jsonb_build_array(
      'Nenhuma licitacao nova foi gravada nas ultimas 24 horas.'
    );
    v_sev := 'critico';
  END IF;

  IF r.fila_atualizada_em IS NULL THEN
    v_problemas := v_problemas || jsonb_build_array(
      'Mapeamento da fila de lacunas ainda nao concluiu.'
    );
    IF v_sev = 'ok' THEN v_sev := 'atencao'; END IF;
  END IF;

  IF coalesce(r.eta_dias, 0) > 60 THEN
    v_problemas := v_problemas || jsonb_build_array(
      format('Previsao de conclusao acima de 60 dias (%s dias no ritmo atual).', round(coalesce(r.eta_dias,0)))
    );
    IF v_sev = 'ok' THEN v_sev := 'atencao'; END IF;
  END IF;

  RETURN QUERY SELECT
    coalesce(r.pct_cobertura, 0)::numeric,
    coalesce(r.total_no_sistema, 0)::bigint,
    coalesce(r.faltando_total, 0)::bigint,
    coalesce(r.ingeridas_24h, 0)::bigint,
    coalesce(r.velocidade_dia, 0)::numeric,
    r.eta_dias::numeric,
    v_erros,
    v_fila_parada,
    v_sev,
    v_problemas;
END;
$$;

REVOKE ALL ON FUNCTION public.ingestao_health_snapshot() FROM public;
GRANT EXECUTE ON FUNCTION public.ingestao_health_snapshot() TO authenticated, service_role;
-- 1) Tabela de runs
CREATE TABLE IF NOT EXISTS public.dashboard_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  periodo text NOT NULL,
  date_from date,
  date_to date,
  metric text NOT NULL,
  expected numeric,
  actual numeric,
  diff numeric,
  status text NOT NULL,
  detail text
);

CREATE INDEX IF NOT EXISTS idx_dvr_run ON public.dashboard_validation_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_dvr_executed ON public.dashboard_validation_runs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dvr_status ON public.dashboard_validation_runs(status) WHERE status <> 'ok';

ALTER TABLE public.dashboard_validation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin central reads validation runs" ON public.dashboard_validation_runs;
CREATE POLICY "Admin central reads validation runs"
  ON public.dashboard_validation_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin_central'::app_role));

DROP POLICY IF EXISTS "Service role manages validation runs" ON public.dashboard_validation_runs;
CREATE POLICY "Service role manages validation runs"
  ON public.dashboard_validation_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2) Função principal
CREATE OR REPLACE FUNCTION public.validate_dashboard_metrics()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '180s'
AS $fn$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_today date := current_date;
  v_periodo text;
  v_df date;
  v_dt date;
  v_exp_sales numeric; v_act_sales numeric;
  v_exp_ctr  bigint;   v_act_ctr  bigint;
  v_exp_org  bigint;   v_act_org  bigint;
  v_exp_emp  bigint;   v_act_emp  bigint;
  v_exp_top_buyer text; v_act_top_buyer text;
  v_exp_top_winner text; v_act_top_winner text;
  v_act_monthly numeric;
  v_tol numeric := 0.01;
BEGIN
  FOR v_periodo, v_df, v_dt IN
    SELECT * FROM (VALUES
      ('mes_atual',    date_trunc('month', now())::date,                                v_today),
      ('trimestre',    date_trunc('quarter', now())::date,                              v_today),
      ('ano_atual',    date_trunc('year', now())::date,                                 v_today),
      ('ano_anterior', (date_trunc('year', now()) - interval '1 year')::date,
                       (date_trunc('year', now()) - interval '1 day')::date),
      ('todos',        '2020-01-01'::date,                                              v_today)
    ) AS t(p, df, dt)
  LOOP
    -- Volume + contratos
    SELECT COALESCE(SUM(valor_homologado),0),
           COUNT(*) FILTER (WHERE COALESCE(valor_homologado,0) > 0)
      INTO v_exp_sales, v_exp_ctr
      FROM licitacoes
     WHERE data_publicacao BETWEEN v_df AND v_dt;

    SELECT total_sales, total_contracts INTO v_act_sales, v_act_ctr
      FROM analytics_sales_totals(v_df, v_dt);

    INSERT INTO dashboard_validation_runs(run_id, periodo, date_from, date_to, metric, expected, actual, diff, status)
    VALUES
      (v_run_id, v_periodo, v_df, v_dt, 'total_sales', v_exp_sales, v_act_sales,
       COALESCE(v_act_sales,0)-COALESCE(v_exp_sales,0),
       CASE WHEN abs(COALESCE(v_act_sales,0)-COALESCE(v_exp_sales,0)) <= v_tol THEN 'ok' ELSE 'divergent' END),
      (v_run_id, v_periodo, v_df, v_dt, 'total_contracts', v_exp_ctr, v_act_ctr,
       COALESCE(v_act_ctr,0)-COALESCE(v_exp_ctr,0),
       CASE WHEN COALESCE(v_act_ctr,0) = COALESCE(v_exp_ctr,0) THEN 'ok' ELSE 'divergent' END);

    -- Órgãos / Empresas
    SELECT COUNT(DISTINCT orgao) INTO v_exp_org
      FROM licitacoes WHERE data_publicacao BETWEEN v_df AND v_dt AND orgao IS NOT NULL;

    SELECT COUNT(DISTINCT v.cnpj) INTO v_exp_emp
      FROM licitacao_vencedores v
      JOIN licitacao_itens i ON i.id = v.item_id
      JOIN licitacoes l ON l.id = i.licitacao_id
     WHERE l.data_publicacao BETWEEN v_df AND v_dt AND v.cnpj IS NOT NULL;

    SELECT total_orgaos, total_empresas INTO v_act_org, v_act_emp
      FROM analytics_totals(v_df, v_dt);

    INSERT INTO dashboard_validation_runs(run_id, periodo, date_from, date_to, metric, expected, actual, diff, status)
    VALUES
      (v_run_id, v_periodo, v_df, v_dt, 'total_orgaos',   v_exp_org, v_act_org,
       COALESCE(v_act_org,0)-COALESCE(v_exp_org,0),
       CASE WHEN COALESCE(v_act_org,0)=COALESCE(v_exp_org,0) THEN 'ok' ELSE 'divergent' END),
      (v_run_id, v_periodo, v_df, v_dt, 'total_empresas', v_exp_emp, v_act_emp,
       COALESCE(v_act_emp,0)-COALESCE(v_exp_emp,0),
       CASE WHEN COALESCE(v_act_emp,0)=COALESCE(v_exp_emp,0) THEN 'ok' ELSE 'divergent' END);

    -- Top buyer #1
    SELECT orgao INTO v_exp_top_buyer FROM licitacoes
     WHERE data_publicacao BETWEEN v_df AND v_dt AND orgao IS NOT NULL
     GROUP BY orgao ORDER BY COALESCE(SUM(valor_homologado),0) DESC NULLS LAST, COUNT(*) DESC
     LIMIT 1;
    SELECT orgao INTO v_act_top_buyer FROM analytics_top_buyers(v_df, v_dt, 1);

    INSERT INTO dashboard_validation_runs(run_id, periodo, date_from, date_to, metric, status, detail)
    VALUES (v_run_id, v_periodo, v_df, v_dt, 'top_buyer_1',
       CASE WHEN COALESCE(v_exp_top_buyer,'')=COALESCE(v_act_top_buyer,'') THEN 'ok' ELSE 'divergent' END,
       format('expected=%s | actual=%s', COALESCE(v_exp_top_buyer,'∅'), COALESCE(v_act_top_buyer,'∅')));

    -- Top winner #1
    WITH per_lic AS (
      SELECT v.razao_social, i.licitacao_id, SUM(v.valor_final) val
      FROM licitacao_vencedores v
      JOIN licitacao_itens i ON i.id = v.item_id
      JOIN licitacoes l ON l.id = i.licitacao_id
      WHERE l.data_publicacao BETWEEN v_df AND v_dt AND v.razao_social IS NOT NULL
      GROUP BY v.razao_social, i.licitacao_id
    )
    SELECT razao_social INTO v_exp_top_winner
      FROM per_lic GROUP BY razao_social
      ORDER BY COUNT(*) DESC, COALESCE(SUM(val),0) DESC NULLS LAST
      LIMIT 1;
    SELECT razao_social INTO v_act_top_winner FROM analytics_top_winners(v_df, v_dt, 1);

    INSERT INTO dashboard_validation_runs(run_id, periodo, date_from, date_to, metric, status, detail)
    VALUES (v_run_id, v_periodo, v_df, v_dt, 'top_winner_1',
       CASE WHEN COALESCE(v_exp_top_winner,'')=COALESCE(v_act_top_winner,'') THEN 'ok' ELSE 'divergent' END,
       format('expected=%s | actual=%s', COALESCE(v_exp_top_winner,'∅'), COALESCE(v_act_top_winner,'∅')));

    -- Soma do gráfico mensal == total_sales
    SELECT COALESCE(SUM(total_valor),0) INTO v_act_monthly
      FROM analytics_monthly_sales(v_df, v_dt);

    INSERT INTO dashboard_validation_runs(run_id, periodo, date_from, date_to, metric, expected, actual, diff, status)
    VALUES (v_run_id, v_periodo, v_df, v_dt, 'monthly_sum_eq_totalsales', v_exp_sales, v_act_monthly,
       COALESCE(v_act_monthly,0)-COALESCE(v_exp_sales,0),
       CASE WHEN abs(COALESCE(v_act_monthly,0)-COALESCE(v_exp_sales,0)) <= v_tol THEN 'ok' ELSE 'divergent' END);
  END LOOP;

  RETURN v_run_id;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO dashboard_validation_runs(run_id, periodo, metric, status, detail)
  VALUES (v_run_id, COALESCE(v_periodo,'?'), 'execution_error', 'error', SQLERRM);
  RETURN v_run_id;
END;
$fn$;

-- 3) Resumo da última run (para a UI)
CREATE OR REPLACE FUNCTION public.get_dashboard_validation_summary()
RETURNS TABLE(
  run_id uuid, executed_at timestamptz,
  total int, ok_count int, divergent_count int, error_count int,
  divergences jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH last_run AS (
    SELECT run_id, MAX(executed_at) AS executed_at
    FROM dashboard_validation_runs
    GROUP BY run_id
    ORDER BY MAX(executed_at) DESC
    LIMIT 1
  )
  SELECT
    lr.run_id, lr.executed_at,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE r.status='ok')::int AS ok_count,
    COUNT(*) FILTER (WHERE r.status='divergent')::int AS divergent_count,
    COUNT(*) FILTER (WHERE r.status='error')::int AS error_count,
    COALESCE(jsonb_agg(jsonb_build_object(
      'periodo', r.periodo, 'metric', r.metric,
      'expected', r.expected, 'actual', r.actual,
      'diff', r.diff, 'detail', r.detail
    )) FILTER (WHERE r.status<>'ok'), '[]'::jsonb) AS divergences
  FROM last_run lr
  JOIN dashboard_validation_runs r ON r.run_id = lr.run_id
  GROUP BY lr.run_id, lr.executed_at;
$$;
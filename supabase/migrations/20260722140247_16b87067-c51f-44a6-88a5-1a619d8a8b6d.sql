
-- Summary of PNCP sequence gaps
CREATE OR REPLACE FUNCTION public.pncp_gaps_summary(p_min_ano integer DEFAULT 2023)
RETURNS TABLE(total_gaps bigint, orgaos_com_gap bigint, top_orgaos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '90s'
AS $$
  WITH parsed AS (
    SELECT
      substring(l.numero_controle_pncp FROM '^(\d{14})') AS cnpj,
      substring(l.numero_controle_pncp FROM '/(\d{4})$')::int AS ano,
      substring(l.numero_controle_pncp FROM '-(\d+)/\d{4}$')::int AS seq
    FROM public.licitacoes l
    WHERE l.numero_controle_pncp ~ '^\d{14}-\d+-\d+/\d{4}$'
      AND l.fonte = 'PNCP'
  ),
  filtered AS (
    SELECT * FROM parsed WHERE ano >= p_min_ano AND ano <= EXTRACT(YEAR FROM now())::int
  ),
  bounds AS (
    SELECT cnpj, ano, MAX(seq) AS max_seq, COUNT(*) AS presentes
    FROM filtered
    GROUP BY cnpj, ano
    HAVING MAX(seq) <= 3000 AND COUNT(*) >= 3
  ),
  per_orgao AS (
    SELECT cnpj, ano, max_seq, presentes, (max_seq - presentes) AS gaps
    FROM bounds
    WHERE (max_seq - presentes) > 0
  ),
  top AS (
    SELECT jsonb_agg(row_to_json(t)) AS j FROM (
      SELECT cnpj, ano, gaps, max_seq
      FROM per_orgao
      ORDER BY gaps DESC
      LIMIT 15
    ) t
  )
  SELECT
    COALESCE(SUM(gaps), 0)::bigint AS total_gaps,
    COUNT(*)::bigint AS orgaos_com_gap,
    COALESCE((SELECT j FROM top), '[]'::jsonb) AS top_orgaos
  FROM per_orgao;
$$;

GRANT EXECUTE ON FUNCTION public.pncp_gaps_summary(integer) TO authenticated, service_role;

-- Summary of licitações pendentes de reprocessamento de vencedores
CREATE OR REPLACE FUNCTION public.pncp_reprocess_summary()
RETURNS TABLE(total bigint, por_ano jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '90s'
AS $$
  WITH base AS (
    SELECT
      substring(l.numero_controle_pncp FROM '/(\d{4})$')::int AS ano
    FROM public.licitacoes l
    WHERE l.numero_controle_pncp ~ '^\d{14}-\d+-\d+/\d{4}$'
      AND l.fonte = 'PNCP'
      AND (
        (l.raw_json->>'existeResultado')::boolean = true
        OR COALESCE(l.valor_homologado, 0) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.licitacao_itens li
        JOIN public.licitacao_vencedores lv ON lv.item_id = li.id
        WHERE li.licitacao_id = l.id
      )
  ),
  agg AS (
    SELECT ano, COUNT(*)::bigint AS qtd FROM base GROUP BY ano ORDER BY ano DESC
  )
  SELECT
    COALESCE(SUM(qtd), 0)::bigint,
    COALESCE(jsonb_agg(row_to_json(agg)), '[]'::jsonb)
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.pncp_reprocess_summary() TO authenticated, service_role;

-- Cobertura por cliente (empresa cadastrada)
CREATE OR REPLACE FUNCTION public.cobertura_por_cliente()
RETURNS TABLE(
  empresa_id uuid,
  nome text,
  total_licitacoes bigint,
  sem_vencedores bigint,
  homologadas bigint,
  homologadas_sem_vencedores bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '60s'
AS $$
  SELECT
    ec.id AS empresa_id,
    ec.nome,
    COUNT(cv.licitacao_id)::bigint AS total_licitacoes,
    COUNT(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM public.licitacao_itens li
        JOIN public.licitacao_vencedores lv ON lv.item_id = li.id
        WHERE li.licitacao_id = cv.licitacao_id
      )
    )::bigint AS sem_vencedores,
    COUNT(*) FILTER (WHERE COALESCE(l.valor_homologado,0) > 0)::bigint AS homologadas,
    COUNT(*) FILTER (
      WHERE COALESCE(l.valor_homologado,0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.licitacao_itens li
        JOIN public.licitacao_vencedores lv ON lv.item_id = li.id
        WHERE li.licitacao_id = cv.licitacao_id
      )
    )::bigint AS homologadas_sem_vencedores
  FROM public.empresas_clientes ec
  LEFT JOIN public.cliente_vinculos cv ON cv.empresa_id = ec.id
  LEFT JOIN public.licitacoes l ON l.id = cv.licitacao_id
  GROUP BY ec.id, ec.nome
  ORDER BY ec.nome;
$$;

GRANT EXECUTE ON FUNCTION public.cobertura_por_cliente() TO authenticated, service_role;

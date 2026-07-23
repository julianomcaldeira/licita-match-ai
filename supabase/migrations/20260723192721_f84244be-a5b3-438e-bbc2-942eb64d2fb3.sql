
CREATE OR REPLACE FUNCTION public.admin_clientes_overview()
RETURNS TABLE (
  empresa_id uuid,
  nome text,
  cnpj text,
  criada_em timestamptz,
  plano_codigo text,
  plano_nome text,
  assinatura_status text,
  assinatura_inicio timestamptz,
  usuarios_total bigint,
  cnpjs_monitorados bigint,
  ultimo_acesso timestamptz,
  acessos_7d bigint,
  acessos_7d_anteriores bigint,
  ia_consultas_30d bigint,
  usuarios_ativos_30d bigint,
  top_paginas_30d jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin_central'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT ec.id, ec.nome, ec.cnpj, ec.created_at
    FROM empresas_clientes ec
  ),
  users_por_emp AS (
    SELECT ur.empresa_id, COUNT(DISTINCT ur.user_id)::bigint AS total
    FROM user_roles ur
    WHERE ur.empresa_id IS NOT NULL
    GROUP BY ur.empresa_id
  ),
  cnpjs_por_emp AS (
    SELECT cc.empresa_id, COUNT(*)::bigint AS total
    FROM cliente_cnpjs cc
    GROUP BY cc.empresa_id
  ),
  assin AS (
    SELECT DISTINCT ON (a.empresa_cliente_id)
      a.empresa_cliente_id, a.status, a.inicio, p.codigo, p.nome
    FROM assinaturas a
    JOIN planos p ON p.id = a.plano_id
    ORDER BY a.empresa_cliente_id,
      CASE WHEN a.status IN ('trial','ativa','inadimplente') THEN 0 ELSE 1 END,
      a.inicio DESC
  ),
  uso_agg AS (
    SELECT
      ue.empresa_cliente_id,
      MAX(ue.created_at) AS ultimo,
      COUNT(*) FILTER (WHERE ue.created_at >= now() - interval '7 days')::bigint AS a7,
      COUNT(*) FILTER (WHERE ue.created_at >= now() - interval '14 days'
                         AND ue.created_at <  now() - interval '7 days')::bigint AS a7_prev,
      COUNT(*) FILTER (WHERE ue.evento = 'ia_consulta'
                         AND ue.created_at >= now() - interval '30 days')::bigint AS ia30,
      COUNT(DISTINCT ue.user_id) FILTER (WHERE ue.created_at >= now() - interval '30 days')::bigint AS u30
    FROM uso_eventos ue
    WHERE ue.empresa_cliente_id IS NOT NULL
    GROUP BY ue.empresa_cliente_id
  ),
  paginas AS (
    SELECT empresa_cliente_id, page, cnt
    FROM (
      SELECT
        ue.empresa_cliente_id,
        COALESCE(ue.contexto->>'page', '(desconhecida)') AS page,
        COUNT(*)::bigint AS cnt,
        ROW_NUMBER() OVER (
          PARTITION BY ue.empresa_cliente_id
          ORDER BY COUNT(*) DESC
        ) AS rn
      FROM uso_eventos ue
      WHERE ue.evento = 'page_view'
        AND ue.empresa_cliente_id IS NOT NULL
        AND ue.created_at >= now() - interval '30 days'
      GROUP BY ue.empresa_cliente_id, COALESCE(ue.contexto->>'page', '(desconhecida)')
    ) s
    WHERE rn <= 3
  ),
  paginas_agg AS (
    SELECT empresa_cliente_id,
           jsonb_agg(jsonb_build_object('page', page, 'count', cnt) ORDER BY cnt DESC) AS top3
    FROM paginas
    GROUP BY empresa_cliente_id
  )
  SELECT
    e.id,
    e.nome,
    e.cnpj,
    e.created_at,
    a.codigo,
    a.nome,
    a.status,
    a.inicio,
    COALESCE(u.total, 0),
    COALESCE(c.total, 0),
    us.ultimo,
    COALESCE(us.a7, 0),
    COALESCE(us.a7_prev, 0),
    COALESCE(us.ia30, 0),
    COALESCE(us.u30, 0),
    COALESCE(pa.top3, '[]'::jsonb)
  FROM emp e
  LEFT JOIN users_por_emp u ON u.empresa_id = e.id
  LEFT JOIN cnpjs_por_emp c ON c.empresa_id = e.id
  LEFT JOIN assin a ON a.empresa_cliente_id = e.id
  LEFT JOIN uso_agg us ON us.empresa_cliente_id = e.id
  LEFT JOIN paginas_agg pa ON pa.empresa_cliente_id = e.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clientes_overview() TO authenticated;

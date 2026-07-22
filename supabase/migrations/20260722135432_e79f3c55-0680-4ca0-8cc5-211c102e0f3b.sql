-- RPC 1: detect missing sequential compras per (cnpj, ano) based on what's already ingested
CREATE OR REPLACE FUNCTION public.pncp_gaps_por_orgao_ano(p_limit int DEFAULT 200, p_min_ano int DEFAULT 2023)
RETURNS TABLE(cnpj text, ano int, seq int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
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
    SELECT cnpj, ano, MAX(seq) AS max_seq
    FROM filtered
    GROUP BY cnpj, ano
    HAVING MAX(seq) <= 3000  -- guardrail: skip absurdly huge orgaos to avoid runaway series
       AND COUNT(*) >= 3      -- need at least a few points to trust the max
  ),
  expected AS (
    SELECT b.cnpj, b.ano, gs.seq
    FROM bounds b
    JOIN LATERAL generate_series(1, b.max_seq) AS gs(seq) ON true
  ),
  gaps AS (
    SELECT e.cnpj, e.ano, e.seq
    FROM expected e
    LEFT JOIN filtered p
      ON p.cnpj = e.cnpj AND p.ano = e.ano AND p.seq = e.seq
    WHERE p.seq IS NULL
  )
  SELECT cnpj, ano, seq
  FROM gaps
  ORDER BY ano DESC, cnpj, seq
  LIMIT GREATEST(1, LEAST(p_limit, 2000));
$$;

-- RPC 2: licitacoes that should have winners but don't
CREATE OR REPLACE FUNCTION public.pncp_licitacoes_para_reprocessar(p_limit int DEFAULT 300)
RETURNS TABLE(id uuid, numero_controle_pncp text, cnpj text, ano int, seq int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $$
  SELECT
    l.id,
    l.numero_controle_pncp,
    substring(l.numero_controle_pncp FROM '^(\d{14})') AS cnpj,
    substring(l.numero_controle_pncp FROM '/(\d{4})$')::int AS ano,
    substring(l.numero_controle_pncp FROM '-(\d+)/\d{4}$')::int AS seq
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
  ORDER BY l.data_publicacao DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 2000));
$$;

GRANT EXECUTE ON FUNCTION public.pncp_gaps_por_orgao_ano(int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pncp_licitacoes_para_reprocessar(int) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_top_orgaos_score(text, integer, integer);

CREATE OR REPLACE FUNCTION public.list_top_orgaos_score(
  p_uf text DEFAULT NULL,
  p_nome text DEFAULT NULL,
  p_trust text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  cnpj_orgao text, nome_orgao text, uf text,
  score_numerico integer, score_classificacao text,
  qtd_contratos_analisados integer, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH base AS (
    SELECT * FROM public.orgaos_score
    WHERE (p_uf IS NULL OR uf = p_uf)
      AND score_classificacao <> 'SD'
      AND (p_nome IS NULL OR p_nome = '' OR nome_orgao ILIKE '%' || p_nome || '%')
      AND (
        p_trust IS NULL OR p_trust = '' OR
        (p_trust = 'confiavel' AND score_numerico >= 700) OR
        (p_trust = 'atencao' AND score_numerico >= 500 AND score_numerico < 700) OR
        (p_trust = 'nao_confiavel' AND score_numerico < 500)
      )
  )
  SELECT cnpj_orgao, nome_orgao, uf, score_numerico, score_classificacao,
         qtd_contratos_analisados, (SELECT COUNT(*) FROM base) AS total_count
  FROM base
  ORDER BY score_numerico DESC
  LIMIT p_limit OFFSET p_offset;
$$;

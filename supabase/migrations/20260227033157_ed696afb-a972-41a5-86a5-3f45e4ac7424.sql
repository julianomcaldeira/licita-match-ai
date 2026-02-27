
-- Drop all overloads
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'search_licitacoes'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.func_sig || ' CASCADE';
  END LOOP;
END $$;

-- Recreate with explicit date casts
CREATE OR REPLACE FUNCTION public.search_licitacoes(
  p_search text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_situacao text DEFAULT NULL,
  p_orgao text DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_com_vencedor boolean DEFAULT false,
  p_vencedor text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  orgao text,
  objeto text,
  modalidade text,
  valor_estimado numeric,
  valor_homologado numeric,
  data_publicacao text,
  uf text,
  situacao text,
  municipio text,
  numero_controle_pncp text,
  vencedor_nome text,
  total_count bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT count(*) INTO v_total
  FROM (
    SELECT DISTINCT l2.id
    FROM licitacoes l2
    LEFT JOIN licitacao_itens li2 ON li2.licitacao_id = l2.id
    LEFT JOIN licitacao_vencedores lv2 ON lv2.item_id = li2.id
    WHERE
      (p_search IS NULL OR l2.objeto ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l2.modalidade ILIKE '%' || p_modalidade || '%')
      AND (p_uf IS NULL OR l2.uf = p_uf)
      AND (p_situacao IS NULL OR l2.situacao ILIKE '%' || p_situacao || '%')
      AND (p_orgao IS NULL OR l2.orgao ILIKE '%' || p_orgao || '%')
      AND (p_date_from IS NULL OR l2.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l2.data_publicacao <= p_date_to::date)
      AND (NOT p_com_vencedor OR lv2.id IS NOT NULL)
      AND (p_vencedor IS NULL OR lv2.razao_social ILIKE '%' || p_vencedor || '%')
  ) sub;

  RETURN QUERY
  SELECT
    sub.id,
    sub.orgao,
    sub.objeto,
    sub.modalidade,
    sub.valor_estimado,
    sub.valor_homologado,
    sub.data_publicacao,
    sub.uf,
    sub.situacao,
    sub.municipio,
    sub.numero_controle_pncp,
    sub.vencedor_nome,
    v_total AS total_count
  FROM (
    SELECT DISTINCT ON (l.id)
      l.id,
      l.orgao,
      l.objeto,
      l.modalidade,
      l.valor_estimado,
      l.valor_homologado,
      l.data_publicacao::text AS data_publicacao,
      l.uf,
      l.situacao,
      l.municipio,
      l.numero_controle_pncp,
      lv.razao_social AS vencedor_nome
    FROM licitacoes l
    LEFT JOIN licitacao_itens li ON li.licitacao_id = l.id
    LEFT JOIN licitacao_vencedores lv ON lv.item_id = li.id
    WHERE
      (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
      AND (NOT p_com_vencedor OR lv.id IS NOT NULL)
      AND (p_vencedor IS NULL OR lv.razao_social ILIKE '%' || p_vencedor || '%')
    ORDER BY l.id, lv.razao_social
  ) sub
  ORDER BY sub.valor_homologado DESC NULLS LAST, sub.valor_estimado DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.diagnostico_orfaos_homologadas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH orfas AS (
    SELECT l.id, l.fonte, l.situacao
    FROM licitacoes l
    WHERE (l.valor_homologado)::numeric > 0
      AND NOT EXISTS (
        SELECT 1 FROM licitacao_itens i
        JOIN licitacao_vencedores v ON v.item_id = i.id
        WHERE i.licitacao_id = l.id
      )
  ),
  por_fonte AS (SELECT COALESCE(fonte,'(sem_fonte)') fonte, count(*)::int c FROM orfas GROUP BY fonte),
  por_sit   AS (SELECT COALESCE(situacao,'(sem_situacao)') situacao, count(*)::int c FROM orfas GROUP BY situacao),
  itens AS (
    SELECT
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM licitacao_itens i WHERE i.licitacao_id = o.id))::int sem_itens,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM licitacao_itens i WHERE i.licitacao_id = o.id))::int com_itens_sem_venc,
      count(*)::int total
    FROM orfas o
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM itens),
    'sem_itens', (SELECT sem_itens FROM itens),
    'com_itens_sem_venc', (SELECT com_itens_sem_venc FROM itens),
    'por_fonte', COALESCE((SELECT jsonb_agg(jsonb_build_object('fonte', fonte, 'count', c) ORDER BY c DESC) FROM por_fonte), '[]'::jsonb),
    'por_situacao', COALESCE((SELECT jsonb_agg(jsonb_build_object('situacao', situacao, 'count', c) ORDER BY c DESC) FROM por_sit), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.diagnostico_orfaos_homologadas() TO authenticated, service_role;
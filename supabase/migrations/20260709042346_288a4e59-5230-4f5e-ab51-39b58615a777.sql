CREATE OR REPLACE FUNCTION public.diagnostico_orfaos_homologadas()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $function$
  WITH lic AS (
    SELECT id, fonte, situacao
    FROM licitacoes
    WHERE (valor_homologado)::numeric > 0
  ),
  com_venc AS (
    SELECT DISTINCT i.licitacao_id
    FROM licitacao_vencedores v
    JOIN licitacao_itens i ON i.id = v.item_id
  ),
  orfas AS (
    SELECT l.id, l.fonte, l.situacao,
           EXISTS (SELECT 1 FROM licitacao_itens i WHERE i.licitacao_id = l.id) AS has_itens
    FROM lic l
    WHERE NOT EXISTS (SELECT 1 FROM com_venc cv WHERE cv.licitacao_id = l.id)
  ),
  por_fonte AS (SELECT COALESCE(fonte,'(sem_fonte)') fonte, count(*)::int c FROM orfas GROUP BY fonte),
  por_sit   AS (SELECT COALESCE(situacao,'(sem_situacao)') situacao, count(*)::int c FROM orfas GROUP BY situacao),
  itens AS (
    SELECT
      count(*) FILTER (WHERE NOT has_itens)::int sem_itens,
      count(*) FILTER (WHERE has_itens)::int com_itens_sem_venc,
      count(*)::int total
    FROM orfas
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM itens),
    'sem_itens', (SELECT sem_itens FROM itens),
    'com_itens_sem_venc', (SELECT com_itens_sem_venc FROM itens),
    'por_fonte', COALESCE((SELECT jsonb_agg(jsonb_build_object('fonte', fonte, 'count', c) ORDER BY c DESC) FROM por_fonte), '[]'::jsonb),
    'por_situacao', COALESCE((SELECT jsonb_agg(jsonb_build_object('situacao', situacao, 'count', c) ORDER BY c DESC) FROM por_sit), '[]'::jsonb)
  );
$function$;
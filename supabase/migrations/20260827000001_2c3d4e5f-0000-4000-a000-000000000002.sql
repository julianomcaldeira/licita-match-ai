-- Fix diagnostico_orfaos_homologadas timeout (orfaosBreak: canceling statement due to statement timeout)
-- Causa: scan em licitacoes WHERE valor_homologado>0 + DISTINCT em vencedores sem índice parcial
-- Solução: índice parcial + reescrita sem DISTINCT + timeout 120s + SECURITY DEFINER estável

-- Índice parcial para WHERE (valor_homologado::numeric > 0) - acelera CTE lic
CREATE INDEX IF NOT EXISTS idx_licitacoes_valor_homologado_pos ON public.licitacoes (( (valor_homologado)::numeric )) WHERE ((valor_homologado)::numeric > 0);

-- Garantir índices em joins (já existem mas reforça IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_licitacao_id ON public.licitacao_itens(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_vencedores_item_id ON public.licitacao_vencedores(item_id);

CREATE OR REPLACE FUNCTION public.diagnostico_orfaos_homologadas()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
  WITH orfas AS (
    SELECT l.id, l.fonte, l.situacao,
           EXISTS (SELECT 1 FROM licitacao_itens i WHERE i.licitacao_id = l.id) AS has_itens
    FROM licitacoes l
    WHERE ((l.valor_homologado)::numeric > 0)
      AND NOT EXISTS (
        SELECT 1
        FROM licitacao_itens i
        JOIN licitacao_vencedores v ON v.item_id = i.id
        WHERE i.licitacao_id = l.id
      )
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

GRANT EXECUTE ON FUNCTION public.diagnostico_orfaos_homologadas() TO authenticated, service_role;

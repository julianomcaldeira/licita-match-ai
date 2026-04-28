CREATE OR REPLACE FUNCTION public.licitacoes_sem_itens(lim integer DEFAULT 200)
RETURNS TABLE(id uuid, numero_controle_pncp text, raw_json jsonb)
LANGUAGE sql
STABLE
SET statement_timeout TO '25s'
AS $function$
  SELECT l.id, l.numero_controle_pncp, l.raw_json
  FROM public.licitacoes l
  WHERE l.numero_controle_pncp IS NOT NULL
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.licitacao_itens li
        WHERE li.licitacao_id = l.id
      )
      OR (
        COALESCE(l.valor_homologado, 0) > 0
        AND EXISTS (
          SELECT 1
          FROM public.licitacao_itens li
          WHERE li.licitacao_id = l.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.licitacao_itens li
          JOIN public.licitacao_vencedores lv ON lv.item_id = li.id
          WHERE li.licitacao_id = l.id
        )
      )
    )
  ORDER BY
    CASE WHEN COALESCE(l.valor_homologado, 0) > 0 THEN 0 ELSE 1 END,
    l.data_publicacao DESC NULLS LAST,
    l.created_at DESC
  LIMIT lim;
$function$;
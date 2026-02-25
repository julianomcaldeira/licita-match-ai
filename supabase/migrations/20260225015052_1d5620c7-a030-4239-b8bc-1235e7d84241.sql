CREATE OR REPLACE FUNCTION public.licitacoes_sem_itens(lim integer DEFAULT 30)
RETURNS TABLE(id uuid, numero_controle_pncp text, raw_json jsonb) 
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT l.id, l.numero_controle_pncp, l.raw_json
  FROM licitacoes l
  LEFT JOIN licitacao_itens li ON li.licitacao_id = l.id
  WHERE li.id IS NULL
    AND l.numero_controle_pncp IS NOT NULL
  ORDER BY l.created_at ASC
  LIMIT lim;
$$;
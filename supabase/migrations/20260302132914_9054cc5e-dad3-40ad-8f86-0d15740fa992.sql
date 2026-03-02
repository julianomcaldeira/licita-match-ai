-- Drop and recreate licitacoes_sem_itens with optimized approach
-- Use a LEFT JOIN instead of NOT EXISTS for better performance on large tables
CREATE OR REPLACE FUNCTION public.licitacoes_sem_itens(lim integer DEFAULT 200)
RETURNS TABLE(id uuid, numero_controle_pncp text, raw_json jsonb)
LANGUAGE sql
STABLE
SET statement_timeout = '25s'
AS $$
  SELECT l.id, l.numero_controle_pncp, l.raw_json
  FROM licitacoes l
  LEFT JOIN licitacao_itens li ON li.licitacao_id = l.id
  WHERE li.id IS NULL
    AND l.numero_controle_pncp IS NOT NULL
  LIMIT lim;
$$;
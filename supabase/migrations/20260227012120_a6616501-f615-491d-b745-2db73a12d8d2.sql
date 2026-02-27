
-- Optimize the licitacoes_sem_itens function using NOT EXISTS instead of LEFT JOIN
CREATE OR REPLACE FUNCTION public.licitacoes_sem_itens(lim integer DEFAULT 50)
RETURNS TABLE(id uuid, numero_controle_pncp text, raw_json jsonb)
LANGUAGE sql STABLE
AS $$
  SELECT l.id, l.numero_controle_pncp, l.raw_json
  FROM licitacoes l
  WHERE l.numero_controle_pncp IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM licitacao_itens li WHERE li.licitacao_id = l.id)
  LIMIT lim;
$$;

-- Add index to speed up the NOT EXISTS subquery
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_licitacao_id ON licitacao_itens(licitacao_id);

-- Add index on numero_controle_pncp for filtering
CREATE INDEX IF NOT EXISTS idx_licitacoes_numero_controle ON licitacoes(numero_controle_pncp) WHERE numero_controle_pncp IS NOT NULL;

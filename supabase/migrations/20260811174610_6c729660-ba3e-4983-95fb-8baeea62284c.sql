CREATE OR REPLACE FUNCTION public.pncp_licitacoes_sem_itens_para_ingestao(p_limit integer DEFAULT 300)
RETURNS TABLE(id uuid, numero_controle_pncp text, cnpj text, ano integer, seq integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    AND NOT EXISTS (
      SELECT 1 FROM public.licitacao_itens li WHERE li.licitacao_id = l.id
    )
  ORDER BY l.data_publicacao DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 2000));
$$;

REVOKE ALL ON FUNCTION public.pncp_licitacoes_sem_itens_para_ingestao(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pncp_licitacoes_sem_itens_para_ingestao(integer) TO service_role;
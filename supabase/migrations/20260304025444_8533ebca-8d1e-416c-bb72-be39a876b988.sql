
-- Revoke direct API access to materialized views
REVOKE ALL ON public.mv_empresas_vencedoras FROM anon, authenticated;
REVOKE ALL ON public.mv_orgaos FROM anon, authenticated;

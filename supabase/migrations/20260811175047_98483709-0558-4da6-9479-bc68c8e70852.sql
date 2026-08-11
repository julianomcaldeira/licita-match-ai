REVOKE ALL ON FUNCTION public.fontes_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fontes_health() TO authenticated;
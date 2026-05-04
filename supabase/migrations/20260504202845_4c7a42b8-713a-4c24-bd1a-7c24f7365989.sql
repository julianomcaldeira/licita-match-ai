CREATE OR REPLACE FUNCTION public.increment_siafi_cache_hit(p_cnpj text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.orgao_siafi_cache
     SET lookup_count = lookup_count + 1
   WHERE cnpj = p_cnpj;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_siafi_cache_hit(text) FROM anon;
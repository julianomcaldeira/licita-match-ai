DO $$
DECLARE m text;
BEGIN
  FOR m IN
    SELECT mes_referencia FROM public.indice_startgi_mensal
    WHERE mes_referencia NOT IN ('2026-06','2026-07')
    ORDER BY mes_referencia
  LOOP
    PERFORM public.compute_indice_startgi(m, true);
  END LOOP;
END $$;
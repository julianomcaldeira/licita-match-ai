CREATE INDEX IF NOT EXISTS idx_pncp_raw_pend_contrato
  ON public.pncp_raw (id)
  WHERE tipo = 'contrato' AND processado = false;

CREATE OR REPLACE FUNCTION public.get_orfaos_dadosabertos(p_limit integer DEFAULT 100)
 RETURNS TABLE(compra_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_scan int := LEAST(GREATEST(p_limit * 10, 500), 3000);
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT pr.id, pr.payload->>'numeroControlePncpCompra' AS k
    FROM public.pncp_raw pr
    WHERE pr.tipo = 'contrato'
      AND pr.processado = false
    LIMIT v_scan
    FOR UPDATE SKIP LOCKED
  ),
  marked AS (
    UPDATE public.pncp_raw pr
       SET processado = true
      FROM claimed c
     WHERE pr.id = c.id
    RETURNING c.k
  )
  SELECT DISTINCT m.k
  FROM marked m
  WHERE m.k IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.licitacoes l
      WHERE l.numero_controle_pncp = m.k
    )
  LIMIT p_limit;
END;
$function$;
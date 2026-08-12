CREATE OR REPLACE FUNCTION public.mark_contratos_dia(
  p_dia date,
  p_status text,
  p_contratos integer DEFAULT 0,
  p_error text DEFAULT NULL::text,
  p_pagina integer DEFAULT 1,
  p_acumula boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.contratos_dia_queue
     SET status = p_status,
         contratos = CASE WHEN p_acumula THEN contratos + COALESCE(p_contratos,0)
                          ELSE GREATEST(contratos, COALESCE(p_contratos,0)) END,
         -- o progresso de pagina nunca retrocede (execucoes concorrentes/fora de ordem)
         pagina = CASE WHEN p_status = 'done' THEN 1
                       ELSE GREATEST(pagina, GREATEST(1, COALESCE(p_pagina,1))) END,
         last_error = p_error,
         attempts = CASE
                      WHEN p_status = 'done' THEN attempts
                      WHEN COALESCE(p_pagina,1) > pagina THEN 0
                      WHEN p_error IS NULL THEN 0
                      ELSE attempts
                    END,
         next_attempt_at = CASE
                             WHEN p_status = 'done' THEN now()
                             WHEN p_error IS NULL OR COALESCE(p_pagina,1) > pagina THEN now()
                             ELSE now() + (LEAST(GREATEST(attempts,1), 10) * interval '90 seconds')
                           END,
         claimed_at = NULL,
         updated_at = now()
   WHERE dia = p_dia;
$function$;
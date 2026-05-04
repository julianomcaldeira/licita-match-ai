-- Recalcula scores existentes com a nova fórmula normalizada por peso de fontes disponíveis.
-- Isso evita esperar o cron + chamadas externas para os 173 órgãos já analisados.
UPDATE orgaos_score
SET
  score_numerico = CASE
    WHEN array_length(fontes_utilizadas, 1) IS NULL THEN 0
    ELSE ROUND(
      ((COALESCE(score_pagamento,0) + COALESCE(score_fiscal,0) + COALESCE(score_execucao,0))::numeric
       / NULLIF(
           (CASE WHEN 'portal_transparencia' = ANY(fontes_utilizadas) THEN 500 ELSE 0 END)
         + (CASE WHEN 'siconfi' = ANY(fontes_utilizadas) THEN 300 ELSE 0 END)
         + (CASE WHEN 'contratos_internos' = ANY(fontes_utilizadas) THEN 200 ELSE 0 END), 0)
      ) * 1000
    )::int
  END,
  score_classificacao = CASE
    WHEN array_length(fontes_utilizadas, 1) IS NULL THEN 'SD'
    ELSE (
      WITH s AS (
        SELECT ROUND(
          ((COALESCE(score_pagamento,0) + COALESCE(score_fiscal,0) + COALESCE(score_execucao,0))::numeric
           / NULLIF(
               (CASE WHEN 'portal_transparencia' = ANY(fontes_utilizadas) THEN 500 ELSE 0 END)
             + (CASE WHEN 'siconfi' = ANY(fontes_utilizadas) THEN 300 ELSE 0 END)
             + (CASE WHEN 'contratos_internos' = ANY(fontes_utilizadas) THEN 200 ELSE 0 END), 0)
          ) * 1000
        )::int AS sc
      )
      SELECT CASE
        WHEN sc >= 950 THEN 'AAA' WHEN sc >= 900 THEN 'AA' WHEN sc >= 850 THEN 'A'
        WHEN sc >= 800 THEN 'BBB' WHEN sc >= 700 THEN 'BB' WHEN sc >= 600 THEN 'B'
        WHEN sc >= 500 THEN 'CCC' WHEN sc >= 400 THEN 'CC' WHEN sc >= 300 THEN 'C'
        ELSE 'D' END FROM s
    )
  END,
  updated_at = now()
WHERE TRUE;
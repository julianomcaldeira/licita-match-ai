-- A PK da tabela é a coluna cnpj (texto). Vamos normalizar in-place.
-- Estratégia: para cada cnpj_norm, escolher um "vencedor" (maior last_checked_at),
-- somar lookup_count, atualizar a linha vencedora com cnpj canônico e remover as demais.

WITH src AS (
  SELECT
    cnpj AS cnpj_original,
    LPAD(REGEXP_REPLACE(REGEXP_REPLACE(cnpj, '\D', '', 'g'), '^0+', ''), 14, '0') AS cnpj_norm,
    codigo_siafi,
    found,
    lookup_count,
    last_checked_at,
    created_at
  FROM public.orgao_siafi_cache
  WHERE cnpj IS NOT NULL AND length(REGEXP_REPLACE(cnpj, '\D', '', 'g')) > 0
),
agg AS (
  SELECT cnpj_norm,
         SUM(lookup_count) AS total_lookups,
         MAX(last_checked_at) AS max_checked_at
  FROM src
  GROUP BY cnpj_norm
),
winners AS (
  SELECT DISTINCT ON (cnpj_norm)
    cnpj_original AS winner_cnpj,
    cnpj_norm
  FROM src
  ORDER BY cnpj_norm, last_checked_at DESC NULLS LAST, created_at DESC
)
-- 1) Apaga as linhas perdedoras (mesmo cnpj_norm, mas não é o winner)
DELETE FROM public.orgao_siafi_cache c
USING src s, winners w
WHERE c.cnpj = s.cnpj_original
  AND s.cnpj_norm = w.cnpj_norm
  AND s.cnpj_original <> w.winner_cnpj;

-- 2) Atualiza os vencedores: cnpj canônico + soma dos contadores
WITH src AS (
  SELECT
    cnpj AS cnpj_original,
    LPAD(REGEXP_REPLACE(REGEXP_REPLACE(cnpj, '\D', '', 'g'), '^0+', ''), 14, '0') AS cnpj_norm
  FROM public.orgao_siafi_cache
  WHERE cnpj IS NOT NULL AND length(REGEXP_REPLACE(cnpj, '\D', '', 'g')) > 0
),
agg AS (
  SELECT cnpj_norm,
         SUM(lookup_count) AS total_lookups,
         MAX(last_checked_at) AS max_checked_at
  FROM public.orgao_siafi_cache c
  JOIN src s ON s.cnpj_original = c.cnpj
  GROUP BY cnpj_norm
)
UPDATE public.orgao_siafi_cache c
SET cnpj = s.cnpj_norm,
    lookup_count = a.total_lookups,
    last_checked_at = a.max_checked_at
FROM src s
JOIN agg a ON a.cnpj_norm = s.cnpj_norm
WHERE c.cnpj = s.cnpj_original
  AND c.cnpj <> s.cnpj_norm;
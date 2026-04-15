
CREATE OR REPLACE FUNCTION public.check_vencedores_sancionados(p_limit integer DEFAULT 20)
RETURNS TABLE(
  razao_social text,
  cnpj text,
  tipo_cadastro text,
  tipo_sancao text,
  orgao_sancionador text,
  data_inicio date,
  data_fim date,
  total_vitorias bigint,
  total_valor numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    lv.razao_social,
    lv.cnpj,
    es.tipo_cadastro,
    es.tipo_sancao,
    es.orgao_sancionador,
    es.data_inicio,
    es.data_fim,
    COUNT(DISTINCT lv.id)::bigint AS total_vitorias,
    COALESCE(SUM(lv.valor_final), 0) AS total_valor
  FROM licitacao_vencedores lv
  JOIN empresas_sancionadas es
    ON replace(replace(replace(lv.cnpj, '.', ''), '-', ''), '/', '')
     = replace(replace(replace(es.cnpj_cpf, '.', ''), '-', ''), '/', '')
  WHERE lv.cnpj IS NOT NULL
    AND es.cnpj_cpf IS NOT NULL
    AND (es.data_fim IS NULL OR es.data_fim >= CURRENT_DATE)
  GROUP BY lv.razao_social, lv.cnpj, es.tipo_cadastro, es.tipo_sancao, es.orgao_sancionador, es.data_inicio, es.data_fim
  ORDER BY total_valor DESC
  LIMIT p_limit;
$$;

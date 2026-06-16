
-- Idempotent retry: tables already exist from a prior partial apply.

CREATE TABLE IF NOT EXISTS public.cliente_cnpjs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_clientes(id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  rotulo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, cnpj)
);
GRANT SELECT ON public.cliente_cnpjs TO authenticated;
GRANT ALL ON public.cliente_cnpjs TO service_role;
ALTER TABLE public.cliente_cnpjs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cliente_cnpjs_admin_central_all ON public.cliente_cnpjs;
CREATE POLICY cliente_cnpjs_admin_central_all ON public.cliente_cnpjs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'::app_role));
DROP POLICY IF EXISTS cliente_cnpjs_empresa_read ON public.cliente_cnpjs;
CREATE POLICY cliente_cnpjs_empresa_read ON public.cliente_cnpjs
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.user_roles WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_cliente_cnpjs_empresa ON public.cliente_cnpjs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cliente_cnpjs_cnpj    ON public.cliente_cnpjs(cnpj);

INSERT INTO public.cliente_cnpjs (empresa_id, cnpj, rotulo)
SELECT ec.id, regexp_replace(ec.cnpj, '\D', '', 'g'), 'Principal'
FROM public.empresas_clientes ec
WHERE ec.cnpj IS NOT NULL AND regexp_replace(ec.cnpj, '\D', '', 'g') <> ''
ON CONFLICT (empresa_id, cnpj) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cliente_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('licitacao_vencedor','contrato')),
  referencia_id uuid NOT NULL,
  licitacao_id uuid,
  cnpj_match text NOT NULL,
  data_evento date,
  valor numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo, referencia_id)
);
GRANT SELECT ON public.cliente_vinculos TO authenticated;
GRANT ALL ON public.cliente_vinculos TO service_role;
ALTER TABLE public.cliente_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cliente_vinculos_admin_central_all ON public.cliente_vinculos;
CREATE POLICY cliente_vinculos_admin_central_all ON public.cliente_vinculos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'::app_role));
DROP POLICY IF EXISTS cliente_vinculos_empresa_read ON public.cliente_vinculos;
CREATE POLICY cliente_vinculos_empresa_read ON public.cliente_vinculos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.user_roles WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_cliente_vinculos_empresa_data ON public.cliente_vinculos(empresa_id, data_evento DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_cliente_vinculos_ref         ON public.cliente_vinculos(referencia_id);
CREATE INDEX IF NOT EXISTS idx_cliente_vinculos_lic         ON public.cliente_vinculos(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_cliente_vinculos_tipo        ON public.cliente_vinculos(empresa_id, tipo);

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS empresa_cliente_id uuid REFERENCES public.empresas_clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_empresa_cliente ON public.api_keys(empresa_cliente_id);

CREATE OR REPLACE FUNCTION public.refresh_cliente_vinculos(p_empresa_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' SET statement_timeout TO '300s'
AS $function$
DECLARE v_vit bigint:=0; v_ctr bigint:=0;
BEGIN
  WITH ins AS (
    INSERT INTO public.cliente_vinculos (empresa_id, tipo, referencia_id, licitacao_id, cnpj_match, data_evento, valor)
    SELECT cc.empresa_id, 'licitacao_vencedor', lv.id, li.licitacao_id, cc.cnpj, l.data_publicacao, lv.valor_final
    FROM public.cliente_cnpjs cc
    JOIN public.licitacao_vencedores lv ON regexp_replace(COALESCE(lv.cnpj,''), '\D','','g') = cc.cnpj
    JOIN public.licitacao_itens li ON li.id = lv.item_id
    JOIN public.licitacoes l ON l.id = li.licitacao_id
    WHERE (p_empresa_id IS NULL OR cc.empresa_id = p_empresa_id)
    ON CONFLICT (empresa_id, tipo, referencia_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_vit FROM ins;

  WITH ins AS (
    INSERT INTO public.cliente_vinculos (empresa_id, tipo, referencia_id, licitacao_id, cnpj_match, data_evento, valor)
    SELECT cc.empresa_id, 'contrato', c.id, c.licitacao_id, cc.cnpj,
           COALESCE(c.data_assinatura, c.data_publicacao),
           COALESCE(c.valor_inicial, c.valor_final)
    FROM public.cliente_cnpjs cc
    JOIN public.contratos c ON regexp_replace(COALESCE(c.fornecedor_cnpj,''), '\D','','g') = cc.cnpj
    WHERE (p_empresa_id IS NULL OR cc.empresa_id = p_empresa_id)
    ON CONFLICT (empresa_id, tipo, referencia_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_ctr FROM ins;

  RETURN jsonb_build_object('vitorias_inseridas', v_vit, 'contratos_inseridos', v_ctr, 'empresa_id', p_empresa_id, 'executed_at', now());
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.refresh_cliente_vinculos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_cliente_vinculos(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_cliente_licitacoes(
  p_empresa_id uuid, p_search text DEFAULT NULL, p_uf text DEFAULT NULL, p_modalidade text DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL, p_only_vencidas boolean DEFAULT false,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, objeto text, orgao text, modalidade text, uf text, municipio text,
  valor_estimado numeric, valor_homologado numeric, situacao text, data_publicacao date,
  match_source text, valor_vencido numeric, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' SET statement_timeout TO '20s'
AS $function$
DECLARE v_kw text[];
BEGIN
  SELECT COALESCE(ec.palavras_chave, ARRAY[]::text[]) || COALESCE(ec.segmentos, ARRAY[]::text[])
    INTO v_kw FROM public.empresas_clientes ec WHERE ec.id = p_empresa_id;

  RETURN QUERY
  WITH vit AS (
    SELECT cv.licitacao_id AS lic_id, SUM(cv.valor) AS valor_vencido
    FROM public.cliente_vinculos cv
    WHERE cv.empresa_id = p_empresa_id AND cv.tipo = 'licitacao_vencedor' AND cv.licitacao_id IS NOT NULL
    GROUP BY cv.licitacao_id
  ),
  kw AS (
    SELECT l.id AS lic_id FROM public.licitacoes l
    WHERE NOT p_only_vencidas AND v_kw IS NOT NULL AND array_length(v_kw,1) > 0
      AND EXISTS (SELECT 1 FROM unnest(v_kw) term WHERE term <> '' AND l.objeto ILIKE '%'||term||'%')
  ),
  base AS (
    SELECT lic_id, valor_vencido, 'cnpj'::text src FROM vit
    UNION SELECT lic_id, NULL::numeric, 'keyword' FROM kw
  ),
  merged AS (
    SELECT lic_id, MAX(valor_vencido) AS valor_vencido,
           CASE WHEN COUNT(*) > 1 THEN 'both' ELSE MAX(src) END AS src
    FROM base GROUP BY lic_id
  ),
  enriched AS (
    SELECT l.id, l.objeto, l.orgao, l.modalidade, l.uf, l.municipio,
           l.valor_estimado, l.valor_homologado, l.situacao, l.data_publicacao,
           m.src AS match_source, m.valor_vencido
    FROM merged m JOIN public.licitacoes l ON l.id = m.lic_id
    WHERE (p_search IS NULL OR l.objeto ILIKE '%'||p_search||'%' OR l.orgao ILIKE '%'||p_search||'%')
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to)
  ),
  counted AS (SELECT count(*)::bigint c FROM enriched)
  SELECT e.id, e.objeto, e.orgao, e.modalidade, e.uf, e.municipio,
         e.valor_estimado, e.valor_homologado, e.situacao, e.data_publicacao,
         e.match_source, e.valor_vencido, (SELECT c FROM counted)
  FROM enriched e
  ORDER BY e.data_publicacao DESC NULLS LAST
  LIMIT GREATEST(LEAST(p_limit, 500), 1) OFFSET GREATEST(p_offset, 0);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.list_cliente_licitacoes(uuid,text,text,text,date,date,boolean,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_cliente_licitacoes(uuid,text,text,text,date,date,boolean,integer,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_cliente_contratos(
  p_empresa_id uuid, p_search text DEFAULT NULL, p_uf text DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_only_proprios boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, cnpj_orgao text, orgao_nome text, numero_contrato text, objeto text,
  fornecedor_nome text, fornecedor_cnpj text, valor_inicial numeric, valor_final numeric,
  data_assinatura date, data_vigencia_inicio date, data_vigencia_fim date,
  situacao text, modalidade_compra text, match_source text, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' SET statement_timeout TO '20s'
AS $function$
DECLARE v_kw text[];
BEGIN
  SELECT COALESCE(ec.palavras_chave, ARRAY[]::text[]) || COALESCE(ec.segmentos, ARRAY[]::text[])
    INTO v_kw FROM public.empresas_clientes ec WHERE ec.id = p_empresa_id;

  RETURN QUERY
  WITH proprios AS (
    SELECT cv.referencia_id AS ctr_id FROM public.cliente_vinculos cv
    WHERE cv.empresa_id = p_empresa_id AND cv.tipo = 'contrato'
  ),
  kw AS (
    SELECT c.id AS ctr_id FROM public.contratos c
    WHERE NOT p_only_proprios AND v_kw IS NOT NULL AND array_length(v_kw,1) > 0
      AND EXISTS (SELECT 1 FROM unnest(v_kw) term WHERE term <> '' AND c.objeto ILIKE '%'||term||'%')
  ),
  base AS (
    SELECT ctr_id, 'cnpj'::text src FROM proprios
    UNION SELECT ctr_id, 'keyword' FROM kw
  ),
  merged AS (
    SELECT ctr_id, CASE WHEN COUNT(*)>1 THEN 'both' ELSE MAX(src) END src FROM base GROUP BY ctr_id
  ),
  enriched AS (
    SELECT c.id, c.cnpj_orgao, c.orgao_nome, c.numero_contrato, c.objeto,
           c.fornecedor_nome, c.fornecedor_cnpj, c.valor_inicial, c.valor_final,
           c.data_assinatura, c.data_vigencia_inicio, c.data_vigencia_fim,
           c.situacao, c.modalidade_compra, m.src match_source
    FROM merged m JOIN public.contratos c ON c.id = m.ctr_id
    WHERE (p_search IS NULL OR c.objeto ILIKE '%'||p_search||'%' OR c.orgao_nome ILIKE '%'||p_search||'%')
      AND (p_date_from IS NULL OR COALESCE(c.data_assinatura, c.data_publicacao) >= p_date_from)
      AND (p_date_to   IS NULL OR COALESCE(c.data_assinatura, c.data_publicacao) <= p_date_to)
  ),
  counted AS (SELECT count(*)::bigint c FROM enriched)
  SELECT e.id, e.cnpj_orgao, e.orgao_nome, e.numero_contrato, e.objeto,
         e.fornecedor_nome, e.fornecedor_cnpj, e.valor_inicial, e.valor_final,
         e.data_assinatura, e.data_vigencia_inicio, e.data_vigencia_fim,
         e.situacao, e.modalidade_compra, e.match_source, (SELECT c FROM counted)
  FROM enriched e
  ORDER BY COALESCE(e.data_assinatura, e.data_vigencia_inicio) DESC NULLS LAST
  LIMIT GREATEST(LEAST(p_limit, 500), 1) OFFSET GREATEST(p_offset, 0);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.list_cliente_contratos(uuid,text,text,date,date,boolean,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_cliente_contratos(uuid,text,text,date,date,boolean,integer,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cliente_resumo(p_empresa_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' SET statement_timeout TO '20s'
AS $function$
DECLARE v_emp public.empresas_clientes; v_total_vit bigint; v_valor_vit numeric;
        v_total_ctr bigint; v_valor_ctr numeric; v_ctr_vigentes bigint;
        v_ticket numeric; v_top_orgaos jsonb; v_cnpjs jsonb;
BEGIN
  SELECT * INTO v_emp FROM public.empresas_clientes WHERE id = p_empresa_id;
  IF v_emp.id IS NULL THEN RETURN jsonb_build_object('error','empresa_not_found'); END IF;

  SELECT count(*), COALESCE(sum(valor),0) INTO v_total_vit, v_valor_vit
  FROM public.cliente_vinculos WHERE empresa_id = p_empresa_id AND tipo='licitacao_vencedor';

  SELECT count(*), COALESCE(sum(valor),0) INTO v_total_ctr, v_valor_ctr
  FROM public.cliente_vinculos WHERE empresa_id = p_empresa_id AND tipo='contrato';

  SELECT count(*) INTO v_ctr_vigentes
  FROM public.cliente_vinculos cv JOIN public.contratos c ON c.id = cv.referencia_id
  WHERE cv.empresa_id = p_empresa_id AND cv.tipo='contrato'
    AND (c.data_vigencia_fim IS NULL OR c.data_vigencia_fim >= CURRENT_DATE);

  v_ticket := CASE WHEN v_total_vit > 0 THEN ROUND(v_valor_vit / v_total_vit, 2) END;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_orgaos FROM (
    SELECT c.orgao_nome orgao, count(*)::bigint contratos, SUM(COALESCE(c.valor_inicial, c.valor_final)) valor
    FROM public.cliente_vinculos cv JOIN public.contratos c ON c.id = cv.referencia_id
    WHERE cv.empresa_id = p_empresa_id AND cv.tipo='contrato' AND c.orgao_nome IS NOT NULL
    GROUP BY c.orgao_nome ORDER BY valor DESC NULLS LAST LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('cnpj', cnpj, 'rotulo', rotulo)), '[]'::jsonb)
    INTO v_cnpjs FROM public.cliente_cnpjs WHERE empresa_id = p_empresa_id;

  RETURN jsonb_build_object(
    'empresa', jsonb_build_object('id', v_emp.id, 'nome', v_emp.nome, 'cnpj', v_emp.cnpj),
    'cnpjs', v_cnpjs,
    'segmentos', COALESCE(v_emp.segmentos, ARRAY[]::text[]),
    'palavras_chave', COALESCE(v_emp.palavras_chave, ARRAY[]::text[]),
    'kpis', jsonb_build_object(
      'total_vitorias', v_total_vit, 'valor_total_vencido', v_valor_vit,
      'ticket_medio_vencido', v_ticket,
      'total_contratos', v_total_ctr, 'valor_total_contratos', v_valor_ctr,
      'contratos_vigentes', v_ctr_vigentes
    ),
    'top_orgaos', v_top_orgaos,
    'generated_at', now()
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cliente_resumo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cliente_resumo(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.api_key_resolve_cliente(p_hash text)
RETURNS TABLE (api_key_id uuid, client_name text, is_active boolean, empresa_cliente_id uuid, empresa_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT k.id, k.client_name, k.is_active, k.empresa_cliente_id, ec.nome
  FROM public.api_keys k LEFT JOIN public.empresas_clientes ec ON ec.id = k.empresa_cliente_id
  WHERE k.api_key_hash = p_hash LIMIT 1;
$function$;
REVOKE EXECUTE ON FUNCTION public.api_key_resolve_cliente(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_key_resolve_cliente(text) TO service_role;

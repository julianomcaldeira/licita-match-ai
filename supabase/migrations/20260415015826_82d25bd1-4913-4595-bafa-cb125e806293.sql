
-- Refresh MVs now
REFRESH MATERIALIZED VIEW mv_orgaos;
REFRESH MATERIALIZED VIEW mv_empresas_vencedoras;

-- Function to refresh all MVs
CREATE OR REPLACE FUNCTION public.refresh_all_mvs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_orgaos;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_empresas_vencedoras;
END;
$$;

-- ============ EMPRESAS SANCIONADAS (CEIS/CNEP) ============
CREATE TABLE public.empresas_sancionadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_origem text NOT NULL,
  cnpj_cpf text,
  nome text NOT NULL,
  tipo_cadastro text NOT NULL, -- CEIS or CNEP
  tipo_sancao text,
  orgao_sancionador text,
  uf_orgao text,
  data_inicio date,
  data_fim date,
  fundamentacao_legal text,
  fonte text NOT NULL DEFAULT 'PORTAL_TRANSPARENCIA',
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id_origem, tipo_cadastro)
);

CREATE INDEX idx_sancionadas_cnpj ON public.empresas_sancionadas(cnpj_cpf);
CREATE INDEX idx_sancionadas_nome_trgm ON public.empresas_sancionadas USING gin(nome gin_trgm_ops);
CREATE INDEX idx_sancionadas_tipo ON public.empresas_sancionadas(tipo_cadastro);

ALTER TABLE public.empresas_sancionadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sancionadas"
ON public.empresas_sancionadas FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Service role can manage sancionadas"
ON public.empresas_sancionadas FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_sancionadas_updated_at
BEFORE UPDATE ON public.empresas_sancionadas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ DIÁRIOS OFICIAIS (QUERIDO DIÁRIO) ============
CREATE TABLE public.diarios_oficiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id text NOT NULL,
  territory_name text,
  state_code text,
  publication_date date NOT NULL,
  url text,
  excerpt text,
  query_matched text,
  is_extra_edition boolean DEFAULT false,
  txt_url text,
  fonte text NOT NULL DEFAULT 'QUERIDO_DIARIO',
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(territory_id, publication_date, url)
);

CREATE INDEX idx_diarios_territory ON public.diarios_oficiais(territory_id);
CREATE INDEX idx_diarios_date ON public.diarios_oficiais(publication_date);
CREATE INDEX idx_diarios_state ON public.diarios_oficiais(state_code);
CREATE INDEX idx_diarios_excerpt_trgm ON public.diarios_oficiais USING gin(excerpt gin_trgm_ops);

ALTER TABLE public.diarios_oficiais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read diarios"
ON public.diarios_oficiais FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Service role can manage diarios"
ON public.diarios_oficiais FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- TransfereGov.br: Transferências Especiais, Convênios/Parcerias e Fundo a Fundo
-- API: http://api-publica.transferegov.gestao.gov.br (Gestão de Parcerias, Especiais, Fundo a Fundo)
-- D-1 diário, sem chave, paginado. Tabelas públicas leitura authenticated, escrita service_role.

-- Transferências Especiais (emendas PIX) - módulo já estável
CREATE TABLE IF NOT EXISTS public.transferegov_especiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_origem text NOT NULL UNIQUE, -- ex: especiais:id ou numeroTransferenciaEspecial
  fonte text NOT NULL DEFAULT 'TRANSFEREGOV_ESPECIAIS',
  ente_nome text,
  ente_uf text,
  ente_municipio text,
  ente_cnpj text,
  valor numeric,
  ano integer,
  situacao text,
  objeto text,
  parlamentar_nome text,
  data_transferencia date,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Convênios / Instrumentos - Gestão de Parcerias (Atos Preparatórios + Instrumentos)
CREATE TABLE IF NOT EXISTS public.transferegov_convenios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_origem text NOT NULL UNIQUE, -- idInstrumento ou numeroConvenio
  fonte text NOT NULL DEFAULT 'TRANSFEREGOV_CONVENIOS',
  numero_convenio text,
  concedente_nome text,
  convenente_nome text,
  convenente_uf text,
  convenente_municipio text,
  convenente_cnpj text,
  objeto text,
  valor_global numeric,
  valor_repasse numeric,
  valor_contrapartida numeric,
  situacao text,
  data_assinatura date,
  data_fim_vigencia date,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fundo a Fundo (quando API liberar, já provisionado)
CREATE TABLE IF NOT EXISTS public.transferegov_fundoafundo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_origem text NOT NULL UNIQUE,
  fonte text NOT NULL DEFAULT 'TRANSFEREGOV_FUNDOAFUNDO',
  ente_nome text,
  ente_uf text,
  ente_municipio text,
  ente_cnpj text,
  valor numeric,
  ano integer,
  situacao text,
  objeto text,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transferegov_especiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferegov_convenios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferegov_fundoafundo ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated read especiais') THEN
    CREATE POLICY "Authenticated read especiais" ON public.transferegov_especiais FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service manage especiais') THEN
    CREATE POLICY "Service manage especiais" ON public.transferegov_especiais FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated read convenios') THEN
    CREATE POLICY "Authenticated read convenios" ON public.transferegov_convenios FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service manage convenios') THEN
    CREATE POLICY "Service manage convenios" ON public.transferegov_convenios FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated read fundoafundo') THEN
    CREATE POLICY "Authenticated read fundoafundo" ON public.transferegov_fundoafundo FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service manage fundoafundo') THEN
    CREATE POLICY "Service manage fundoafundo" ON public.transferegov_fundoafundo FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tgov_especiais_uf_mun ON public.transferegov_especiais(ente_uf, ente_municipio);
CREATE INDEX IF NOT EXISTS idx_tgov_especiais_ano ON public.transferegov_especiais(ano DESC);
CREATE INDEX IF NOT EXISTS idx_tgov_especiais_valor ON public.transferegov_especiais(valor DESC) WHERE valor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tgov_convenios_uf_mun ON public.transferegov_convenios(convenente_uf, convenente_municipio);
CREATE INDEX IF NOT EXISTS idx_tgov_convenios_cnpj ON public.transferegov_convenios(convenente_cnpj);
CREATE INDEX IF NOT EXISTS idx_tgov_convenios_situacao ON public.transferegov_convenios(situacao);
CREATE INDEX IF NOT EXISTS idx_tgov_convenios_valor ON public.transferegov_convenios(valor_global DESC) WHERE valor_global IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tgov_especiais_upd') THEN
    CREATE TRIGGER trg_tgov_especiais_upd BEFORE UPDATE ON public.transferegov_especiais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tgov_convenios_upd') THEN
    CREATE TRIGGER trg_tgov_convenios_upd BEFORE UPDATE ON public.transferegov_convenios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tgov_fundo_upd') THEN
    CREATE TRIGGER trg_tgov_fundo_upd BEFORE UPDATE ON public.transferegov_fundoafundo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Para pipeline-orchestrator e sync incremental (reuso de sync_status)
INSERT INTO public.sync_status (api_source, modalidade, last_date_processed, total_synced)
VALUES ('transferegov-especiais', 0, '20240101', 0),
       ('transferegov-convenios', 0, '20240101', 0)
ON CONFLICT (api_source, modalidade) DO NOTHING;

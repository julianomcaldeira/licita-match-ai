
-- Roles enum
CREATE TYPE public.iverbas_app_role AS ENUM ('admin_central', 'client');

-- Profiles table
CREATE TABLE public.iverbas_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.iverbas_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role iverbas_app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Tenants (clients by CNPJ)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj TEXT NOT NULL UNIQUE,
  razao_social TEXT,
  cnae_principal TEXT,
  natureza_juridica TEXT,
  situacao_cadastral TEXT,
  segmento TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK to iverbas_profiles
ALTER TABLE public.iverbas_profiles ADD CONSTRAINT profiles_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

-- Budget table
CREATE TABLE public.orcamento_anual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL,
  orgao TEXT,
  unidade_gestora TEXT,
  programa TEXT,
  acao TEXT,
  natureza_despesa TEXT,
  funcao TEXT,
  subfuncao TEXT,
  dotacao_inicial NUMERIC(18,2) DEFAULT 0,
  dotacao_atualizada NUMERIC(18,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Execution table
CREATE TABLE public.execucao_despesa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL,
  orgao TEXT,
  programa TEXT,
  acao TEXT,
  natureza_despesa TEXT,
  valor_empenhado NUMERIC(18,2) DEFAULT 0,
  valor_liquidado NUMERIC(18,2) DEFAULT 0,
  valor_pago NUMERIC(18,2) DEFAULT 0,
  data_pagamento DATE,
  numero_empenho TEXT,
  cnpj_favorecido TEXT,
  nome_favorecido TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bids table
CREATE TABLE public.iverbas_licitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_processo TEXT,
  modalidade TEXT,
  objeto TEXT,
  orgao_contratante TEXT,
  data_abertura DATE,
  valor_estimado NUMERIC(18,2) DEFAULT 0,
  valor_homologado NUMERIC(18,2) DEFAULT 0,
  situacao TEXT,
  cnpj_vencedor TEXT,
  nome_vencedor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API logs
CREATE TABLE public.api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name TEXT NOT NULL,
  endpoint TEXT,
  request_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  http_status INTEGER,
  records_imported INTEGER DEFAULT 0,
  error_message TEXT
);

-- Login logs
CREATE TABLE public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- Enable RLS on all tables
ALTER TABLE public.iverbas_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iverbas_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_anual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execucao_despesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iverbas_licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function for role check
CREATE OR REPLACE FUNCTION public.iverbas_has_role(_user_id UUID, _role iverbas_app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.iverbas_user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.iverbas_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.iverbas_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all iverbas_profiles" ON public.iverbas_profiles FOR SELECT USING (public.iverbas_has_role(auth.uid(), 'admin_central'));

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.iverbas_user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.iverbas_user_roles FOR ALL USING (public.iverbas_has_role(auth.uid(), 'admin_central'));

-- Tenants policies
CREATE POLICY "Admins can manage tenants" ON public.tenants FOR ALL USING (public.iverbas_has_role(auth.uid(), 'admin_central'));
CREATE POLICY "Users can view own tenant" ON public.tenants FOR SELECT USING (
  id IN (SELECT tenant_id FROM public.iverbas_profiles WHERE user_id = auth.uid())
);

-- Public data tables: authenticated users can read
CREATE POLICY "Authenticated can read budget" ON public.orcamento_anual FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read execution" ON public.execucao_despesa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read bids" ON public.iverbas_licitacoes FOR SELECT TO authenticated USING (true);

-- Only service role / edge functions insert data (no user insert policies needed)

-- API logs: admin only
CREATE POLICY "Admins can view api logs" ON public.api_logs FOR SELECT USING (public.iverbas_has_role(auth.uid(), 'admin_central'));
CREATE POLICY "Service can insert api logs" ON public.api_logs FOR INSERT WITH CHECK (true);

-- Login logs: admin can view all, users can view own
CREATE POLICY "Admins can view all login logs" ON public.login_logs FOR SELECT USING (public.iverbas_has_role(auth.uid(), 'admin_central'));
CREATE POLICY "Users can view own login logs" ON public.login_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can insert login logs" ON public.login_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.iverbas_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.iverbas_profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER iverbas_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.iverbas_handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.iverbas_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_execucao_cnpj ON public.execucao_despesa(cnpj_favorecido);
CREATE INDEX idx_execucao_ano ON public.execucao_despesa(ano);
CREATE INDEX idx_execucao_orgao ON public.execucao_despesa(orgao);
CREATE INDEX idx_orcamento_ano ON public.orcamento_anual(ano);
CREATE INDEX idx_licitacoes_cnpj ON public.iverbas_licitacoes(cnpj_vencedor);
CREATE INDEX idx_licitacoes_situacao ON public.iverbas_licitacoes(situacao);

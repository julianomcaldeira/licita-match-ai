
-- Empresas clientes (tenants)
CREATE TABLE public.empresas_clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  descricao_atividade TEXT,
  segmentos TEXT[],
  palavras_chave TEXT[],
  prompt_personalizado TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas_clientes ENABLE ROW LEVEL SECURITY;

-- Admin central can do everything
CREATE POLICY "Admin central full access empresas"
  ON public.empresas_clientes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

-- Admin empresa can read/update their own empresa
CREATE POLICY "Admin empresa can read own empresa"
  ON public.empresas_clientes FOR SELECT TO authenticated
  USING (
    id IN (SELECT empresa_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin_empresa')
  );

CREATE POLICY "Admin empresa can update own empresa"
  ON public.empresas_clientes FOR UPDATE TO authenticated
  USING (
    id IN (SELECT empresa_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin_empresa')
  );

-- Usuarios can read their empresa
CREATE POLICY "Usuarios can read own empresa"
  ON public.empresas_clientes FOR SELECT TO authenticated
  USING (
    id IN (SELECT empresa_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- Add FK from user_roles to empresas
ALTER TABLE public.user_roles
  ADD CONSTRAINT fk_user_roles_empresa
  FOREIGN KEY (empresa_id) REFERENCES public.empresas_clientes(id) ON DELETE SET NULL;

-- Trigger updated_at
CREATE TRIGGER update_empresas_clientes_updated_at
  BEFORE UPDATE ON public.empresas_clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index
CREATE INDEX idx_empresas_clientes_cnpj ON public.empresas_clientes(cnpj);

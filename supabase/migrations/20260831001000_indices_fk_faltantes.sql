-- Foreign keys sem indice de suporte (causam seq scan em joins, deletes em
-- cascata e listagens administrativas — ex: "usuarios desta empresa",
-- "assinaturas deste plano", "perfis deste tenant").
CREATE INDEX IF NOT EXISTS idx_user_roles_empresa_id ON public.user_roles (empresa_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_plano_id ON public.assinaturas (plano_id);
CREATE INDEX IF NOT EXISTS idx_iverbas_profiles_tenant_id ON public.iverbas_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_assinatura_id ON public.asaas_cobrancas (assinatura_id);

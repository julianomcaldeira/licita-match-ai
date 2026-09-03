-- Cadastro self-service (AuthPage) hoje nao cria empresa nem assinatura —
-- a landing page promete "7 dias gratis" mas isso nunca foi implementado.
-- Esta migracao fecha esse fluxo, com trava anti-abuso por CPF + CNPJ
-- (qualquer um dos dois ja usado antes bloqueia um trial novo).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text;

-- Ledger de documentos que ja consumiram um trial. Independente do ciclo
-- de vida de empresas_clientes/assinaturas (sobrevive a cancelamento,
-- exclusao de empresa etc.) — e a fonte da verdade pra bloquear reuso.
CREATE TABLE public.trial_documentos_usados (
  documento text PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('cpf', 'cnpj')),
  empresa_cliente_id uuid REFERENCES public.empresas_clientes(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.trial_documentos_usados TO service_role;
ALTER TABLE public.trial_documentos_usados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trial_documentos_usados admin" ON public.trial_documentos_usados FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

CREATE OR REPLACE FUNCTION public.iniciar_trial_self_service(p_cnpj text, p_cpf text, p_nome_empresa text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_empresa_id uuid;
  v_plano_id uuid;
  v_assinatura_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;

  IF length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'cnpj_invalido';
  END IF;
  IF length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'cpf_invalido';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND empresa_id IS NOT NULL) THEN
    RAISE EXCEPTION 'usuario_ja_possui_empresa';
  END IF;

  IF EXISTS (SELECT 1 FROM public.trial_documentos_usados WHERE documento IN (v_cnpj, v_cpf)) THEN
    RAISE EXCEPTION 'trial_ja_utilizado';
  END IF;

  SELECT id INTO v_empresa_id FROM public.empresas_clientes WHERE cnpj = v_cnpj;
  IF v_empresa_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.assinaturas WHERE empresa_cliente_id = v_empresa_id) THEN
      RAISE EXCEPTION 'empresa_ja_possui_assinatura';
    END IF;
  ELSE
    INSERT INTO public.empresas_clientes (nome, cnpj) VALUES (p_nome_empresa, v_cnpj)
    RETURNING id INTO v_empresa_id;
  END IF;

  SELECT id INTO v_plano_id FROM public.planos WHERE codigo = 'inteligencia' AND self_service = true;
  IF v_plano_id IS NULL THEN
    RAISE EXCEPTION 'plano_self_service_nao_encontrado';
  END IF;

  UPDATE public.user_roles
  SET role = 'admin_empresa', empresa_id = v_empresa_id
  WHERE user_id = v_user_id AND role = 'usuario_empresa';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_usuario_nao_encontrada';
  END IF;

  INSERT INTO public.assinaturas (empresa_cliente_id, plano_id, status, inicio, fim_periodo_atual)
  VALUES (v_empresa_id, v_plano_id, 'trial', now(), now() + interval '7 days')
  RETURNING id INTO v_assinatura_id;

  INSERT INTO public.trial_documentos_usados (documento, tipo, empresa_cliente_id, user_id) VALUES
    (v_cnpj, 'cnpj', v_empresa_id, v_user_id),
    (v_cpf, 'cpf', v_empresa_id, v_user_id);

  UPDATE public.profiles SET cpf = v_cpf WHERE user_id = v_user_id;

  RETURN v_assinatura_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.iniciar_trial_self_service(text, text, text) TO authenticated;

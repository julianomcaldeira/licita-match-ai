-- Alinhamento com a decisao do time (WhatsApp, 2026-09-04):
-- trial 1x por CNPJ (nao mais CPF+CNPJ), sem cartao obrigatorio, CPF vira
-- so dado cadastral, e comeca uma verificacao leve de vinculo com o CNPJ
-- via dominio do e-mail (corporativo = automatico, dominio pessoal = fica
-- marcado para conferencia manual do admin, sem bloquear o trial).

ALTER TABLE public.empresas_clientes ADD COLUMN IF NOT EXISTS verificacao_pendente boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.iniciar_trial_self_service(p_cnpj text, p_cpf text, p_nome_empresa text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_dominio text;
  v_email_pessoal boolean;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_empresa_id uuid;
  v_plano_id uuid;
  v_assinatura_id uuid;
  v_dominios_pessoais text[] := ARRAY[
    'gmail.com','hotmail.com','outlook.com','live.com','yahoo.com','yahoo.com.br',
    'icloud.com','bol.com.br','uol.com.br','terra.com.br','ig.com.br','r7.com'
  ];
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

  -- Trava e so por CNPJ agora — CPF e so dado cadastral, nao bloqueia mais.
  IF EXISTS (SELECT 1 FROM public.trial_documentos_usados WHERE documento = v_cnpj) THEN
    RAISE EXCEPTION 'trial_ja_utilizado';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  v_dominio := lower(split_part(coalesce(v_email, ''), '@', 2));
  v_email_pessoal := v_dominio = ANY(v_dominios_pessoais);

  SELECT id INTO v_empresa_id FROM public.empresas_clientes WHERE cnpj = v_cnpj;
  IF v_empresa_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.assinaturas WHERE empresa_cliente_id = v_empresa_id) THEN
      RAISE EXCEPTION 'empresa_ja_possui_assinatura';
    END IF;
    UPDATE public.empresas_clientes SET nome = p_nome_empresa, verificacao_pendente = v_email_pessoal
    WHERE id = v_empresa_id;
  ELSE
    INSERT INTO public.empresas_clientes (nome, cnpj, verificacao_pendente)
    VALUES (p_nome_empresa, v_cnpj, v_email_pessoal)
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

  INSERT INTO public.trial_documentos_usados (documento, tipo, empresa_cliente_id, user_id)
  VALUES (v_cnpj, 'cnpj', v_empresa_id, v_user_id);

  UPDATE public.profiles SET cpf = v_cpf WHERE user_id = v_user_id;

  RETURN v_assinatura_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.iniciar_trial_self_service(text, text, text) TO authenticated;

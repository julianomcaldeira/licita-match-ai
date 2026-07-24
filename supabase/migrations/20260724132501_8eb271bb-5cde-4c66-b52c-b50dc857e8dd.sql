
-- Extend cliente_participacoes for user-facing use
ALTER TABLE public.cliente_participacoes
  ADD COLUMN IF NOT EXISTS participou boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- One record per (empresa_cliente, licitacao)
CREATE UNIQUE INDEX IF NOT EXISTS cliente_participacoes_empresa_licitacao_uidx
  ON public.cliente_participacoes(empresa_cliente_id, licitacao_id);

-- Resultado allowed values (null = ainda não informado)
DO $$ BEGIN
  ALTER TABLE public.cliente_participacoes
    ADD CONSTRAINT cliente_participacoes_resultado_chk
    CHECK (resultado IS NULL OR resultado IN ('venceu','perdeu','desclassificado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_cliente_participacoes_updated_at ON public.cliente_participacoes;
CREATE TRIGGER trg_cliente_participacoes_updated_at
BEFORE UPDATE ON public.cliente_participacoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_participacoes TO authenticated;
GRANT ALL ON public.cliente_participacoes TO service_role;

-- RLS: keep admin_central full access; add self-empresa policies
DROP POLICY IF EXISTS "participacoes self select" ON public.cliente_participacoes;
CREATE POLICY "participacoes self select"
ON public.cliente_participacoes FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin_central'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.empresa_id = cliente_participacoes.empresa_cliente_id
  )
);

DROP POLICY IF EXISTS "participacoes self insert" ON public.cliente_participacoes;
CREATE POLICY "participacoes self insert"
ON public.cliente_participacoes FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin_central'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.empresa_id = cliente_participacoes.empresa_cliente_id
  )
);

DROP POLICY IF EXISTS "participacoes self update" ON public.cliente_participacoes;
CREATE POLICY "participacoes self update"
ON public.cliente_participacoes FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin_central'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.empresa_id = cliente_participacoes.empresa_cliente_id
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin_central'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.empresa_id = cliente_participacoes.empresa_cliente_id
  )
);

DROP POLICY IF EXISTS "participacoes self delete" ON public.cliente_participacoes;
CREATE POLICY "participacoes self delete"
ON public.cliente_participacoes FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin_central'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.empresa_id = cliente_participacoes.empresa_cliente_id
  )
);

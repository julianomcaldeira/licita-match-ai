-- Corrige integridade histórica em execucao_unificada:
-- Fontes de pagamento (recursos-recebidos e pagamentos diários) copiavam o valor
-- pago para empenhado_total e liquidado_total. Zeramos essas colunas para essas
-- fontes; preservamos registros originados de CSV/outras fontes.
UPDATE public.execucao_unificada
SET empenhado_total = 0,
    liquidado_total = 0
WHERE fonte_dados IN ('/despesas/recursos-recebidos', 'api-pagamentos-diarios');

-- execucao_despesa é derivada de execucao_unificada via syncLegacyTables.
-- Não temos coluna fonte_dados, mas registros com valor_pago > 0 e
-- valor_empenhado == valor_pago == valor_liquidado são o padrão que veio das
-- fontes de pagamento. Zeramos empenhado/liquidado apenas nesses casos.
UPDATE public.execucao_despesa
SET valor_empenhado = 0,
    valor_liquidado = 0
WHERE valor_pago > 0
  AND valor_empenhado = valor_pago
  AND valor_liquidado = valor_pago;
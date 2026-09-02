import { prisma } from "../db";

// F.1 do documento — "Dinheiro deixado na mesa". SQL determinístico,
// nunca IA: o número da manchete não pode variar entre execuções.
//
// Cadeia real do schema: licitacoes -> licitacao_itens (licitacao_id) ->
// licitacao_vencedores (item_id). valor_homologado vive em `licitacoes`;
// o CNPJ vencedor só é conhecido via licitacao_vencedores.cnpj do item.
//
// NOTA: o schema.prisma gerado (gen-schema.cjs) ainda não modela foreign
// keys como relations do Prisma — só PK/tipos, via information_schema.columns.
// Por isso os joins abaixo são feitos manualmente em JS, não via `include`.
// Adicionar as relations é um follow-up (extrair de information_schema
// .key_column_usage + constraint_column_usage) antes de crescer esse serviço.
//
// TODO: aderência por segmento/palavra-chave (empresas_clientes.segmentos /
// palavras_chave) ainda não entra no filtro — placeholder até definir o
// corte fixo de aderência que o documento exige (F.1: "corte fixo, não pode
// variar entre execuções").
export async function calcularDinheiroNaMesa(empresaClienteId: string, meses = 12) {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - meses);

  const [exclusoes, cnpjsEmpresa] = await Promise.all([
    prisma.cliente_exclusoes.findMany({
      where: { empresa_cliente_id: empresaClienteId },
      select: { licitacao_id: true },
    }),
    prisma.cliente_cnpjs.findMany({
      where: { empresa_id: empresaClienteId },
      select: { cnpj: true },
    }),
  ]);
  const excluidas = new Set(exclusoes.map((e) => e.licitacao_id));
  const meusCnpjs = new Set(cnpjsEmpresa.map((c) => c.cnpj));

  const licitacoes = await prisma.licitacoes.findMany({
    where: {
      data_resultado: { gte: desde },
      valor_homologado: { not: null },
      id: { notIn: [...excluidas] },
    },
    select: { id: true, objeto: true, orgao: true, valor_homologado: true },
  });
  if (licitacoes.length === 0) {
    return { totalCentavos: 0n, quantidade: 0, itens: [] };
  }

  const itensDasLicitacoes = await prisma.licitacao_itens.findMany({
    where: { licitacao_id: { in: licitacoes.map((l) => l.id) } },
    select: { id: true, licitacao_id: true },
  });
  const itemIdParaLicitacaoId = new Map(itensDasLicitacoes.map((it) => [it.id, it.licitacao_id]));

  const vencedores = await prisma.licitacao_vencedores.findMany({
    where: { item_id: { in: itensDasLicitacoes.map((it) => it.id) }, cnpj: { not: null } },
    select: { item_id: true, cnpj: true },
  });
  const licitacaoIdParaVencedorCnpj = new Map<string, string>();
  for (const v of vencedores) {
    const licitacaoId = itemIdParaLicitacaoId.get(v.item_id);
    if (licitacaoId && v.cnpj && !licitacaoIdParaVencedorCnpj.has(licitacaoId)) {
      licitacaoIdParaVencedorCnpj.set(licitacaoId, v.cnpj);
    }
  }

  let totalCentavos = 0n;
  const itens: typeof licitacoes = [];
  for (const l of licitacoes) {
    const vencedorCnpj = licitacaoIdParaVencedorCnpj.get(l.id);
    if (!vencedorCnpj) continue; // sem vencedor identificado, não entra na conta
    if (meusCnpjs.has(vencedorCnpj)) continue; // fui eu quem ganhou
    totalCentavos += BigInt(Math.round(Number(l.valor_homologado) * 100));
    itens.push(l);
  }

  return { totalCentavos, quantidade: itens.length, itens };
}

import { prisma } from "../db";

// Regra de isolamento (Parte B.2 / H.1): todo método recebe
// empresaClienteId já resolvido pelo serviço — nunca lê de req diretamente.

export async function listarExclusoes(empresaClienteId: string) {
  return prisma.cliente_exclusoes.findMany({
    where: { empresa_cliente_id: empresaClienteId },
  });
}

export async function excluirLicitacao(empresaClienteId: string, licitacaoId: string) {
  return prisma.cliente_exclusoes.upsert({
    where: {
      empresa_cliente_id_licitacao_id: {
        empresa_cliente_id: empresaClienteId,
        licitacao_id: licitacaoId,
      },
    },
    create: { empresa_cliente_id: empresaClienteId, licitacao_id: licitacaoId },
    update: {},
  });
}

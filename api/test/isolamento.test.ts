import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db";
import { listarExclusoes, excluirLicitacao } from "../src/repos/clienteExclusoesRepo";

// Parte H.1 do documento: "Isolamento: duas empresas, dados distintos.
// Se A enxergar dado de B, o build falha." Este é o único teste que
// substitui a RLS do Supabase — precisa existir ANTES de qualquer
// funcionalidade nova ser construída sobre os repos.
//
// Requer DATABASE_URL apontando pra um Postgres com o schema aplicado
// (dev ou um banco de teste dedicado — nunca produção).

describe("isolamento entre empresas", () => {
  const empresaA = randomUUID();
  const empresaB = randomUUID();
  const licitacaoX = randomUUID();
  const licitacaoY = randomUUID();

  beforeAll(async () => {
    await prisma.empresas_clientes.createMany({
      data: [
        { id: empresaA, nome: "Empresa Teste A" },
        { id: empresaB, nome: "Empresa Teste B" },
      ],
    });
    await excluirLicitacao(empresaA, licitacaoX);
    await excluirLicitacao(empresaB, licitacaoY);
  });

  afterAll(async () => {
    await prisma.cliente_exclusoes.deleteMany({
      where: { empresa_cliente_id: { in: [empresaA, empresaB] } },
    });
    await prisma.empresas_clientes.deleteMany({
      where: { id: { in: [empresaA, empresaB] } },
    });
    await prisma.$disconnect();
  });

  it("empresa A nunca vê exclusão gravada pela empresa B", async () => {
    const exclusoesDeA = await listarExclusoes(empresaA);
    expect(exclusoesDeA.map((e) => e.licitacao_id)).toEqual([licitacaoX]);
    expect(exclusoesDeA.map((e) => e.licitacao_id)).not.toContain(licitacaoY);
  });

  it("empresa B nunca vê exclusão gravada pela empresa A", async () => {
    const exclusoesDeB = await listarExclusoes(empresaB);
    expect(exclusoesDeB.map((e) => e.licitacao_id)).toEqual([licitacaoY]);
    expect(exclusoesDeB.map((e) => e.licitacao_id)).not.toContain(licitacaoX);
  });
});

# iPesquisei — Especificação Completa de Construção
**Versão 2.0** · 24/07/2026 · **Inclui a fusão com o iVerbas.**
**Este é o único documento. Autocontido. Substitui todos os anteriores.**
Colocar na raiz do repositório. É a fonte de verdade para o Cursor e para a equipe.

---

# PARTE 0 — SAÍDA DO LOVABLE CLOUD 🔴 LEIA ANTES DE TUDO

## 0.1 A situação

**Dois** sistemas estão no Lovable Cloud: iPesquisei e iVerbas. As 923 mil licitações estão numa instância que não pertence à StartGi, sem acesso SQL direto.

| Item | Onde está | Status |
|---|---|---|
| Frontend, migrations, edge functions (ambos os sistemas) | GitHub | ✅ Nosso |
| **923 mil licitações + dados de tabela** | Instância Lovable (iPesquisei) | ⚠️ **Não exportado** |
| Schema e dados do iVerbas | Instância Lovable (iVerbas) | ⚠️ **Não exportado** |
| Usuários de autenticação | Instâncias Lovable | ⚠️ Não exportado |
| Secrets (chaves de API) | Painéis do Lovable | ⚠️ Não exportado |

Fatos da documentação do Lovable:
- Lovable Cloud roda sobre Supabase, mas **não expõe acesso SQL direto**.
- Conectar ao Cloud é **irreversível**; não há botão de desconectar.
- **"Remove Lovable Cloud" apaga a instância permanentemente.**
- Código sincroniza para o GitHub; **dados, storage e usuários exigem exportação manual**.
- O saldo de Cloud do iPesquisei já se esgotou uma vez (jul/2026). O sistema seguiu no ar, mas o episódio confirma o risco.

## 0.2 🛑 QUATRO PROIBIÇÕES ABSOLUTAS

1. **Nunca clicar em "Remove Lovable Cloud".** Irreversível. Ao terminar a migração, apenas pare de usar.
2. **Não editar no Lovable durante a transição.** O `.env` pode ser revertido para o Cloud, repontando a aplicação ao banco antigo em silêncio.
3. **Não reduzir o plano do Lovable** antes de sair do gateway de IA (Etapa 6 da Parte I). Quatro funções dependem de `ai.gateway.lovable.dev`.
4. **Não iniciar nenhuma outra etapa antes do resgate (0.3) conferido.**

## 0.3 O resgate — primeira tarefa, antes de qualquer código

**Não exige crédito de IA do Lovable.** As tabelas são legíveis pela mesma porta que o frontend já usa (URL + chave anon do `.env`, com login de admin), ou pelo MCP do Lovable, que dá acesso SQL direto.

Extrair de **ambos** os sistemas:

**iPesquisei:** `licitacoes`, `licitacao_itens`, `licitacao_vencedores`, `pncp_raw`, `contratos`, `empenhos`, `empresas_sancionadas`, `diarios_oficiais`, `empresas_clientes`, `cliente_cnpjs`, `cliente_vinculos`, `profiles`, `user_roles`, `api_keys`, `orgaos_score`, `indice_startgi_*`, `sync_status`, `ingestao_logs`, `ai_usage_log`, `ai_query_cache`, `planos`, `assinaturas`, `creditos_movimentos`, `cliente_participacoes`, `cliente_exclusoes`, `uso_eventos`

**iVerbas:** `contratos_gestao`, `contrato_empenhos`, `execucao_despesa`, `execucao_unificada`, `execucao_diaria_empresa`, `orcamento_anual`, `orcamento_unificado`, `emendas_parlamentares`, `emendas_documentos`, `contratos_comprasgov`, `licitacoes`, `iscores`, `sector_benchmark`, `concentration_analysis`, `market_insights`, `tenants`, `orgao_ministerio_map`, `sync_state`

Gravar como dump Postgres ou CSV. Guardar em **dois lugares** sob controle da StartGi. Copiar **todos os secrets** dos dois painéis.

**Critério de conclusão:**
```
Para cada tabela:  COUNT(*) na origem  ==  COUNT(*) na cópia
```
Registrar a tabela de conferência por escrito. Sem isso, o resgate não aconteceu.

> **Usuários e senhas:** se forem a equipe da StartGi e poucos clientes, o reset de senha é irrelevante. Avisar por e-mail e seguir.

## 0.4 Por que sair

- **Custódia:** o ativo que custou meses de ingestão está em conta de terceiro, sem acesso SQL, e já ficou sem saldo uma vez.
- **Unificação:** a StartGi não usa Supabase em nenhum outro projeto. Node + Express + Prisma + PostgreSQL + React/Vite é o padrão da casa (Pardini, sistema de editais).
- **Adequação técnica:** ingerir milhões de eventos com retomada e rate limit não cabe em edge function com timeout.

## 0.5 O que se perde e o substituto

| Perde | Substituto |
|---|---|
| Supabase Auth | Provedor gerenciado **com SAML/OIDC desde já** (comprar, não construir) |
| **RLS** | Isolamento na camada de serviço + **teste automatizado no CI** (Parte H.1) |
| `pg_cron` | GitHub Actions ou scheduler da fila |
| Gateway de IA do Lovable | Interface própria com provedor plugável (Parte E.1) |
| Edge functions | Workers com fila (BullMQ + Redis) |

> ⚠️ Sem RLS, o isolamento entre empresas depende **exclusivamente do código**. O teste do H.1 é a única barreira contra vazar dado de um cliente para outro. **Escrever o teste antes da funcionalidade.**

---

# PARTE A — O PRODUTO UNIFICADO

## A.1 A fusão

Dois sistemas foram desenvolvidos em paralelo e são **as duas metades do mesmo produto**:

| | iPesquisei | iVerbas |
|---|---|---|
| Cobre | A **disputa** | A **execução** e o **planejamento** |
| Traz | 923 mil licitações, itens, vencedores, preços homologados, sancionadas, diários oficiais, camada comercial, IA com validador | Contratos com empenho vinculado (SIAFI), execução de despesa, orçamento anual, emendas parlamentares, coletores que funcionam |
| Papel na fusão | **Ativo** (dado + produto comercial) | **Estrutura** (schema + coletores) |

**O iPesquisei é a base.** O iVerbas contribui schema e coletores. Nada do iVerbas que duplique o iPesquisei sobrevive.

## A.2 O posicionamento (decidido)

> **iPesquisei = inteligência do ciclo do dinheiro público.**

```
ORÇAMENTO → EMENDA → LICITAÇÃO → CONTRATO → EMPENHO → LIQUIDAÇÃO → PAGAMENTO
└──── ANTES (iVerbas) ────┘└─ DURANTE (iPesquisei) ─┘└──── DEPOIS (iVerbas) ────┘
```

Não entrega alertas de edital nem robô de lances — mercado commodity com seis concorrentes maduros (Effecti, ConLicitação, Licitei, LicitaGov, Quero Licitação, Alerta Licitação).

Entrega o que ninguém entrega: **"veja onde o dinheiro público está antes, durante e depois."**

**Comprador:** diretor comercial / head de novos negócios. Não o analista que dá lances.

## A.3 A resposta ao problema de churn 🔴 conceito central

O iPesquisei sozinho olhava só para trás. Passado se consulta uma vez — por isso churn alto:

| Pergunta | Frequência | Origem |
|---|---|---|
| "Quem ganhou?" | uma vez por pesquisa | iPesquisei |
| "Esse órgão pagou?" | uma vez por órgão | iVerbas (execução) |
| **"Onde tem dinheiro alocado que ainda não virou compra?"** | **muda toda semana** | **iVerbas (orçamento + emenda)** |
| **"Qual preço praticar nesta proposta?"** | **toda disputa** | **iPesquisei (preço unitário)** |

**As duas perguntas recorrentes são as que criam hábito.** Orçamento e emenda são antecipação: o dinheiro é carimbado meses antes de virar licitação. Preço é decisão obrigatória em toda proposta.

**Prioridade de produto:** as funcionalidades voltadas ao futuro (potencial de compra, emenda, saldo orçamentário) e ao preço têm precedência sobre as retrospectivas, porque são elas que fazem o cliente voltar.

## A.4 Fatos verificados

| Fato | Evidência |
|---|---|
| 923.405 licitações (PNCP 696.740 · PNCP_DADOS_ABERTOS 226.665) | painel de diagnóstico |
| ~3.368 licitações "Divulgada no PNCP", com valor homologado, **todas com itens**, **sem vencedor** | painel de diagnóstico |
| 1.163 sem vencedor são Revogada/Anulada/Suspensa — **normal**, não é bug | painel de diagnóstico |
| Score de órgãos do iPesquisei: 79% calculado só com componente circular; 1.809 órgãos nota D por defasagem da própria base | painel de diagnóstico |
| **Empenho federal com vínculo oficial ao contrato É acessível, sem autenticação** | código iVerbas em produção (ver A.5) |
| Empenho municipal (TCE-SP) aberto — HTTP 200, sem chave | teste de campo |
| Eventos TCE-SP: Empenhado, Valor Liquidado, Valor Pago, Anulação, Reforço | teste de campo |
| Defasagem municipal TCE-SP: **5–6 semanas** | teste de campo |
| Volume TCE-SP: ~38 mi eventos/ano (Campinas 9.808/mês · Adamantina 4.561/mês × 644 × 12) | medição |
| SP capital **não** está no TCE-SP (tem TCM próprio) | lista tem 644, capital ausente |
| API legada `compras.dados.gov.br` → **HTTP 404**, descontinuada | teste de campo |
| Propostas de perdedores **não são públicas** | documentação Compras.gov |

## A.5 ⚠️ CORREÇÃO — empenho federal NÃO está bloqueado

Uma versão anterior desta especificação concluiu, a partir de `HTTP 401` em `/api/v1/empenho` e `HTTP 500` em `/api/contrato`, que o Contratos.gov.br exigia autenticação. **Estava errado.**

O caminho correto, em uso no iVerbas, **sem token algum** (apenas `Accept: application/json`):

```
GET https://contratos.comprasnet.gov.br/api/contrato/ug/{codigo_ug}
    → lista de contratos daquela unidade gestora

GET https://contratos.comprasnet.gov.br/api/contrato/{contrato_id}/empenhos
    → empenhos vinculados àquele contrato, com
      valor_empenhado · valor_liquidado · valor_pago · valor_rp_inscrito
```

A API não permite listagem global; permite **travessia por unidade gestora**.

**Consequência arquitetural:** para o federal, **o vínculo empenho↔contrato vem pronto do SIAFI**. Não é necessária a tabela `empenho_vinculos` com match por confiança. A heurística de match (substring do número do contrato, "mesmo fornecedor no órgão") do antigo `ingest-empenhos-federal` deve ser **deletada**, não corrigida.

`empenho_vinculos` continua necessária **apenas para o municipal (TCE-SP)**, onde o número do contrato não acompanha o empenho.

## A.6 Endpoints confirmados

```
# ABERTOS (sem autenticação)
GET https://transparencia.tce.sp.gov.br/api/json/municipios
GET https://transparencia.tce.sp.gov.br/api/json/despesas/{municipio}/{ano}/{mes}
GET https://contratos.comprasnet.gov.br/api/contrato/ug/{codigo_ug}
GET https://contratos.comprasnet.gov.br/api/contrato/{contrato_id}/empenhos
GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=&dataFinal=&codigoModalidadeContratacao=&pagina=
GET https://pncp.gov.br/api/consulta/v1/contratacoes/atualizacao?...      # NÃO USADO — usar
GET https://pncp.gov.br/api/consulta/v1/contratos

# COM CHAVE
GET https://api.portaldatransparencia.gov.br/api-de-dados/...            # header: chave-api-dados

# FECHADOS — não insistir
https://contratos.comprasnet.gov.br/api/v1/empenho      → 401 (usar o caminho por contrato)
http://compras.dados.gov.br/contratos/v1/contratos.json → 404 (legado, morto)
```

**Modalidades PNCP** (o código antigo do iPesquisei está errado — corrigir):
`1` Leilão-Eletrônico · `2` Diálogo Competitivo · `3` Concurso · `4` Concorrência-Eletrônica · `5` Concorrência-Presencial · `6` **Pregão-Eletrônico** · `7` **Pregão-Presencial** · `8` **Dispensa** · `9` **Inexigibilidade** · `10` Manifestação de Interesse · `11` Pré-qualificação · `12` Credenciamento · `13` Leilão-Presencial

## A.7 Estrutura do dado do TCE-SP

```json
{
  "orgao": "PREFEITURA MUNICIPAL DE CAMPINAS",
  "mes": "Janeiro",
  "evento": "Empenhado",
  "nr_empenho": "2557-2024",
  "id_fornecedor": "CNPJ - PESSOA JURÍDICA - 51885242000140",
  "nm_fornecedor": "...",
  "dt_emissao_despesa": "29/01/2024",
  "vl_despesa": "43571,08"
}
```
`vl_despesa` usa vírgula decimal. `id_fornecedor` traz o CNPJ dentro de string com prefixo. `evento` classifica o estágio.

---

# PARTE B — ARQUITETURA

## B.1 Stack (decidida — padrão StartGi)

```
Frontend    React + Vite            (base: iPesquisei; absorver telas do iVerbas)
API         Node + TypeScript + Express
ORM         Prisma
Banco       PostgreSQL gerenciado (provedor neutro)
Filas       BullMQ + Redis          (obrigatório: ingestões longas)
Auth        provedor gerenciado com SAML/OIDC (comprar, não construir)
CI/CD       GitHub Actions
Ambientes   dev · homologação · produção
IA          interface própria, provedor plugável
Pagamento   Asaas (Pix Automático primário)
NFS-e       Omie
```

Sem Supabase. Sem Lovable. Sem edge functions.

## B.2 Camadas

```
routes/      → validação de entrada e chamada ao serviço. NUNCA consulta banco.
services/    → regra de negócio. SEMPRE recebe e aplica empresaClienteId.
repos/       → Prisma. Recebe empresaClienteId já resolvido.
workers/     → jobs de ingestão, com fila e retomada.
ai/          → interface de provedor + medição de custo + créditos.
```

**Regra de isolamento (substitui a RLS):** nenhuma query em controller. Todo serviço recebe `empresaClienteId` do contexto autenticado e o repassa ao repositório. Teste no CI falha o build se empresa A enxergar dado de empresa B.

---

# PARTE C — MODELO DE DADOS UNIFICADO

O schema do iPesquisei (127 migrations) é a base, aproveitado por introspecção:
```
pg_dump do schema → restore no Postgres novo → prisma db pull → baseline
```
**Não reescrever migrations à mão. Não rodar `db reset`.**

## C.1 Resolução de conflitos entre os dois sistemas

| Conflito | Decisão | Razão |
|---|---|---|
| `licitacoes` existe nos dois | **Vence a do iPesquisei** | 923 mil linhas, com itens, vencedores e raw. A do iVerbas é vestigial |
| `tenants` (iVerbas) vs `empresas_clientes` (iPesquisei) | **Vence `empresas_clientes`** | a camada comercial (planos, assinaturas, créditos) já está ligada a ela |
| Colunas úteis de `tenants` | **Absorver** em `empresas_clientes`: `cnae_principal`, `natureza_juridica`, `situacao_cadastral`, `segmento` | enriquecem o perfil do cliente |
| `contratos` (iPesquisei) vs `contratos_gestao` (iVerbas) | **Vence `contratos_gestao`** | tem `contrato_id_externo`, que é a chave para buscar empenhos |
| `empenhos` (iPesquisei, vazia) | **Descartar** | substituída por `contrato_empenhos` (federal) e `despesa_eventos` (municipal) |
| `orgaos_score` (iPesquisei) e `iscores` (iVerbas) | **Descartar ambas**, reconstruir (ver F.2) | a do iPesquisei dá AAA a órgão sem pagamento examinado |
| `user_roles`, `profiles` | **Vence a do iPesquisei** | tem os papéis da camada comercial |

## C.2 Tabelas absorvidas do iVerbas (manter como estão)

```sql
contratos_gestao          -- contratos federais; chave: contrato_id_externo
contrato_empenhos         -- empenho vinculado ao contrato pelo SIAFI
                          -- UNIQUE (contrato_id_externo, numero_empenho)
                          -- valor_empenhado · valor_liquidado · valor_pago · valor_rp_inscrito
execucao_despesa          -- execução por órgão/programa/ação/natureza
orcamento_anual           -- dotacao_inicial · dotacao_atualizada por órgão/programa/ação
emendas_parlamentares     -- emendas e seus destinos
emendas_documentos
orgao_ministerio_map      -- mapeamento órgão → ministério
```

> `contrato_empenhos` já tem chave correta e traz **restos a pagar** (`valor_rp_inscrito`), que é essencial para calcular execução real sem distorção de fim de exercício.

## C.3 Tabelas novas

```sql
-- ===== EMPENHO MUNICIPAL (TCE-SP) — fato imutável =====
CREATE TABLE despesa_eventos (
  id             bigserial PRIMARY KEY,
  fonte          text NOT NULL,              -- 'tce_sp'
  esfera         text NOT NULL,              -- 'municipal'
  uf             char(2),
  municipio      text,
  orgao_nome     text NOT NULL,
  nr_empenho     text NOT NULL,
  evento         text NOT NULL,              -- empenhado|liquidado|pago|anulacao|reforco
  cnpj_fornecedor text,
  nome_fornecedor text,
  data_evento    date NOT NULL,
  valor_centavos bigint NOT NULL,
  ano            int NOT NULL,
  raw            jsonb,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (fonte, orgao_nome, nr_empenho, evento, data_evento, valor_centavos)
) PARTITION BY RANGE (ano);

CREATE TABLE despesa_eventos_2024 PARTITION OF despesa_eventos FOR VALUES FROM (2024) TO (2025);
CREATE TABLE despesa_eventos_2025 PARTITION OF despesa_eventos FOR VALUES FROM (2025) TO (2026);
CREATE TABLE despesa_eventos_2026 PARTITION OF despesa_eventos FOR VALUES FROM (2026) TO (2027);

CREATE INDEX ON despesa_eventos (cnpj_fornecedor, data_evento DESC);
CREATE INDEX ON despesa_eventos (orgao_nome, ano);

-- ===== VÍNCULO empenho↔contrato — SOMENTE municipal =====
-- (no federal o vínculo vem pronto em contrato_empenhos)
CREATE TABLE empenho_vinculos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nr_empenho   text NOT NULL,
  orgao_nome   text NOT NULL,
  contrato_id  uuid NOT NULL,
  metodo       text NOT NULL,   -- 'favorecido_unico'|'manual'
  confianca    text NOT NULL,   -- 'alta'|'media'|'baixa'
  created_at   timestamptz DEFAULT now(),
  UNIQUE (nr_empenho, orgao_nome, contrato_id)
);

-- ===== PREÇO UNITÁRIO (do PNCP, fonte já ingerida) =====
CREATE TABLE item_precos (
  id                bigserial PRIMARY KEY,
  licitacao_id      uuid NOT NULL,
  numero_item       int NOT NULL,
  descricao         text NOT NULL,
  catmat_catser     text,
  tipo              text,          -- 'material'|'servico'
  quantidade        numeric,
  unidade           text,
  valor_unit_homologado numeric(18,4),
  cnpj_vencedor     text,
  orgao_nome        text,
  uf                char(2),
  data_homologacao  date,
  UNIQUE (licitacao_id, numero_item)
);
CREATE INDEX ON item_precos (catmat_catser, data_homologacao DESC);
CREATE INDEX ON item_precos (cnpj_vencedor);

-- ===== ATAS DE REGISTRO DE PREÇO =====
CREATE TABLE atas_registro_preco (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ata        text NOT NULL,
  orgao_gerenciador text,
  vigencia_inicio   date,
  vigencia_fim      date,
  raw               jsonb,
  UNIQUE (numero_ata, orgao_gerenciador)
);
```

## C.4 Camada comercial (já criada no Lovable — preservar)

```sql
planos                 -- codigo · preco_centavos · max_cnpjs · max_usuarios
                       -- creditos_ia_mes · features[] · self_service
                       -- populada: inteligencia · execucao · canal (features cumulativas)
assinaturas            -- status: trial|ativa|inadimplente|suspensa|cancelada
                       -- índice único parcial: 1 assinatura ativa por empresa
creditos_movimentos    -- saldo derivado por SUM, nunca armazenado
cliente_participacoes  -- UNIQUE (empresa_cliente_id, licitacao_id)
cliente_exclusoes      -- PK (empresa_cliente_id, licitacao_id)
uso_eventos            -- instrumentação de churn; já gravando
```

## C.5 Pagamentos (a criar)

```sql
CREATE TABLE pagamentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id         uuid REFERENCES assinaturas(id),
  empresa_cliente_id    uuid NOT NULL,
  provedor_pagamento_id text UNIQUE NOT NULL,
  tipo                  text NOT NULL,   -- 'assinatura'|'creditos'
  status                text NOT NULL,   -- pendente|confirmado|vencido|estornado
  valor_centavos        int NOT NULL,
  vencimento            date,
  pago_em               timestamptz,
  forma                 text,
  raw                   jsonb
);

CREATE TABLE webhook_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor      text NOT NULL DEFAULT 'asaas',
  evento_id     text NOT NULL,
  tipo          text NOT NULL,
  payload       jsonb NOT NULL,
  processado_em timestamptz,
  UNIQUE (provedor, evento_id)     -- ISTO é a idempotência
);
```

---

# PARTE D — INGESTÃO (WORKERS)

Cada worker: fila, retomada por cursor, idempotência por chave única, log de progresso, respeito a rate limit.

## D.1 `worker:pncp-publicacao` (corrigir o existente)
- `/contratacoes/publicacao`, por dia e modalidade.
- **Parar a paginação só em página vazia.** Nunca por "duplicatas" — registros deslizam entre páginas.
- `id_origem` determinístico. **Proibido `Math.random()` ou `Date.now()` em chave.**
- Usar a tabela de modalidades de A.6.

## D.2 `worker:pncp-atualizacao` (NOVO — resolve dado congelado)
- `/contratacoes/atualizacao`, diário, janela de 2 dias. Upsert por `numero_controle_pncp`.
- **Sem isto, licitação publicada há mais de 7 dias nunca recebe o resultado.** Causa central da desconfiança no dado.

## D.3 `worker:pncp-vencedores` 🔴 FASE 0 — bloqueia o comercial
- Alvo: `valor_homologado > 0`, situação "Divulgada no PNCP", com itens, sem vencedor.
- Buscar resultado item a item. Lotes de no máximo 200, com pausa. **Validar com lote de 20 antes do volume.**
- **Pronto quando:** sem-vencedor restante só em Revogada/Anulada/Suspensa/Deserta.

## D.4 `worker:pncp-itens` (NOVO — inteligência de preço)
- Para cada licitação, buscar itens com valor unitário homologado (4 casas), tipo, quantidade, vencedor. Gravar em `item_precos`.
- Normalizar por CATMAT/CATSER para permitir comparação entre órgãos.
- **Fonte nova: zero.** É o PNCP já ingerido, num endpoint hoje ignorado.

## D.5 `worker:pncp-atas` (NOVO)
- Atas de registro de preço por período de vigência, com itens e preços registrados.
- Ata vigente no segmento do cliente = venda disponível hoje (carona), sem novo edital.

## D.6 `worker:contratos-gov` (ABSORVER do iVerbas — quase pronto)
```
para cada unidade gestora (UG):
    GET /api/contrato/ug/{codigo}                → upsert contratos_gestao
    para cada contrato:
        GET /api/contrato/{id}/empenhos          → upsert contrato_empenhos
                                                   (onConflict: contrato_id_externo, numero_empenho)
```
- **Sem autenticação.** Apenas `Accept: application/json`.
- **Este worker substitui integralmente o antigo `ingest-empenhos-federal`.** A heurística de match por substring e por "mesmo fornecedor no órgão" deve ser **deletada** — era a origem dos totais que oscilavam a cada execução.
- Necessário: lista de UGs a percorrer (derivar de `contratos_gestao`, de `orgao_ministerio_map` e dos órgãos presentes nas licitações do PNCP).

## D.7 `worker:tce-sp` (O FOSSO MUNICIPAL)
```
municípios = GET /api/json/municipios          # 644
para cada município, ano, mês:
    GET /api/json/despesas/{mun}/{ano}/{mes}
    normalizar:
        cnpj_fornecedor = últimos 14 dígitos de id_fornecedor
        valor_centavos  = vl_despesa (vírgula decimal) → inteiro
        evento          = 'Anulação'→anulacao · 'Reforço'→reforco
                          'Valor Liquidado'→liquidado · 'Valor Pago'→pago
        data_evento     = dt_emissao_despesa (dd/mm/aaaa)
    upsert em despesa_eventos
```
- Começar com **2 anos** de histórico, não a década.
- Cursor `(municipio, ano, mes)` para retomada. Escrita em lote (`COPY` / `createMany`).
- **Anulação subtrai. Reforço soma.**
- SP capital não existe aqui (TCM próprio) — não tratar como erro.

## D.8 `worker:orcamento` e `worker:emendas` (ABSORVER do iVerbas)
- Orçamento anual (dotação inicial e atualizada) e emendas parlamentares.
- **São a base das funcionalidades de antecipação** (F.5), que são as de maior impacto em retenção.

## D.9 `worker:transparencia-pagamentos` (ABSORVER do iVerbas)
- Pagamentos diários do Portal da Transparência, para complementar a execução federal.

## D.10 `worker:ceis-cnep`, `worker:diarios` — manter comportamento atual.

---

# PARTE D-BIS — ESTRATÉGIA DE FONTES

## A tese

> **Não é ter mais fontes que torna o produto único. É ter uma fonte que ninguém teve paciência de fazer direito.**

**Profundidade vende. Largura impressiona em pitch e frustra no uso.** Um fornecedor vende para a região dele. Paga por 1 estado profundo e confiável, não por 15 rasos em que não confia. **Cada fonte é dívida eterna** — quebra, muda de formato, atrasa.

## Prioridade travada

**🥇 P1 — O que já está na base (fonte nova: zero)**
Preço unitário homologado · Atas de registro de preço · Modo atualização do PNCP.
Maior retorno por esforço do projeto inteiro.

**🥈 P2 — Federal via Contratos.gov.br** (absorvido do iVerbas, quase pronto)
Empenho com vínculo oficial + orçamento + emendas.

**🥉 P3 — TCE-SP em profundidade** (o fosso municipal)
Terminar por completo antes de qualquer outro estado.

**P4 — Expansão estadual, PUXADA por demanda.** Um estado por vez, só com cliente real pedindo:

| Estado | Fonte | Acesso |
|---|---|---|
| MG | API Compras (Prodemge) + TCE-MG (SICOM) | chave por e-mail |
| PE | API Dados Abertos TCE-PE | aberto |
| SC | API Dados Abertos TCE-SC | aberto |
| PB | SAGRES (TCE-PB) | arquivo (ETL) |
| RS | LicitaCon + SIAPC (TCE-RS) | CKAN, latência mensal |

> Cada TCE tem formato próprio. **Não existe padrão nacional.** "A API respondeu" ≠ "a fonte está pronta".

## Raso nacional como isca · profundo em SP como produto
Camada rasa (marketing): "quem ganhou o quê" nacional, via PNCP que já é nacional.
Camada profunda (produto pago): empenho, pagamento, preço — só onde existe de verdade.

## Fontes a IGNORAR
- ❌ Scrapers de portais municipais individuais — o TCE agrega estruturado
- ❌ Notícia como fonte de produto — commodity; só como marketing, com link
- ❌ `compras.dados.gov.br` legado (404)
- ❌ Qualquer estado novo antes de SP completo

> **Risco nº 1 do projeto: excesso de fontes dispersando o foco.** Lista congelada. Fonte nova só entra puxada por cliente pagante.

---

# PARTE E — CAMADA DE IA

## E.1 Interface (provedor plugável)

```ts
export interface ProvedorIA {
  completar(req: {
    modelo: string;
    mensagens: Mensagem[];
    ferramentas?: Ferramenta[];
    maxTokens: number;            // OBRIGATÓRIO — sem teto não há controle de custo
  }): Promise<{
    texto: string;
    tokensEntrada: number;
    tokensSaida: number;
    custoUsd: number;             // OBRIGATÓRIO — sem medida não há margem
  }>;
}
```
Migrar `market-analysis`, `analyze-objeto`, `match-ia`, `auto-analysis` para esta interface, saindo de `ai.gateway.lovable.dev`.

## E.2 Créditos — a regra que não se viola

| O quê | Como calcula | Cobra crédito? |
|---|---|---|
| Dinheiro na mesa, concorrentes, prazo de pagamento, potencial de compra, preço de referência | **SQL determinístico** | ❌ Não. Incluído no plano |
| Chat de análise, narração de insight, leitura de edital, resumo do radar | **IA** | ✅ Sim |

> **A IA não calcula. SQL calcula, IA narra.** Cobrar crédito para o cliente ver "quanto deixei na mesa" é cobrar por um SELECT.

**Venda créditos, não tokens.** Preço de token muda quando o provedor quer; crédito é unidade sua.
```
custo_interno = tokens × preço_modelo × câmbio
preço_cliente = custo_interno × margem      (margem ≥ 3×)
```

**Fluxo:** estimar custo → verificar saldo (`SUM`) → reservar → executar → medir real → lançar consumo e estornar diferença → registrar em `ai_usage_log`.

**Proteções:** teto por requisição, teto diário por usuário, cache de resposta idêntica (não consome crédito), alerta quando a margem real de um cliente cai abaixo do piso.

## E.3 Validador anti-alucinação (preservar do iPesquisei)
Extrair CNPJs e valores da resposta e conferir se aparecem nos dados consultados. Se não aparecerem, não entregar.

> ⚠️ **Confere procedência, não correção.** Se a fonte estiver errada, a IA narra o erro com confiança e o validador aprova. Foi o que aconteceu com o score de órgãos: a IA afirmava "AAA, bom pagador" sobre municípios cujos pagamentos nunca foram examinados.

---

# PARTE F — MÉTRICAS (o produto)

Todas em SQL. Nenhuma com IA.

## F.1 Dinheiro deixado na mesa
```
DINHEIRO_NA_MESA(empresa, meses) =
  Σ valor_homologado das licitações que:
    • casam com o perfil da empresa (palavras-chave + CNAE), E
    • foram homologadas COM vencedor, E
    • o vencedor NÃO é CNPJ da empresa, E
    • não estão em cliente_exclusoes
```
> *"Nos últimos 12 meses, R$ 47,3 milhões do seu segmento foram para 8 concorrentes."*

**Obrigatório:** lista auditável · botão "não é do meu segmento" (grava em `cliente_exclusoes`) · filtro visível · **corte fixo de aderência** (o score de IA do `match-ia` não pode ser a base direta — o número da manchete não pode variar entre execuções).

**Limite honesto:** propostas de perdedores não são públicas. Pode-se dizer *"foi para X por R$ Y e você não participou"*, mas **não** *"você perdeu por R$ 3 mil"*. Solução: `cliente_participacoes` — o cliente registra onde participou. Vira dado que ninguém mais tem e cria dependência.

## F.2 Score de pagamento (reconstruir; descartar `orgaos_score` e `iscores`)
```sql
-- FEDERAL (contrato_empenhos)
TAXA_EXECUCAO(orgao)      = Σ valor_pago ÷ Σ valor_empenhado
RESTOS_A_PAGAR(orgao)     = Σ valor_rp_inscrito ÷ Σ valor_empenhado
LIQUIDADO_NAO_PAGO(orgao) = Σ (valor_liquidado − valor_pago) ÷ Σ valor_liquidado

-- MUNICIPAL (despesa_eventos)
PRAZO_MEDIO_PAGAMENTO(orgao) = média( data(pago) − data(empenhado) )   -- dias
TAXA_EXECUCAO(orgao, safra)  = Σ pago ÷ Σ (empenhado + reforco − anulacao)
```

**Regras inegociáveis:**
1. **Nunca normalizar pelo peso das fontes disponíveis.** Foi esse bug que deu AAA a municípios sem nenhum pagamento examinado.
2. Sem dado de pagamento → `SD` (sem dado). Nunca uma nota.
3. Mínimo de 30 empenhos pagos no período. Abaixo → `SD`.
4. **Proibido** componente "contratos internos" (mede a defasagem da própria base, não o órgão). Classificou 1.809 órgãos como D.
5. Exibir componentes, não só a letra: *"paga em média em 41 dias · 94% de execução · base: 1.203 empenhos"*.

## F.3 Inteligência de preço (do PNCP, sem fonte nova)
```
PRECO_REFERENCIA(item, periodo) = mín / mediana / máx do valor_unit_homologado
                                  entre órgãos, no período
MINHA_POSICAO(empresa, item)    = preço do cliente vs. mediana do mercado
```
> *"O item que você vende foi homologado entre R$ 4,72 e R$ 6,10; a mediana é R$ 5,15."*

**Recorrente:** toda proposta exige decidir um preço. É a pergunta que mais se repete no ciclo de venda ao governo. Exige normalização por CATMAT/CATSER.

## F.4 Vínculo empenho↔contrato
**Federal:** vem pronto em `contrato_empenhos`. Nenhum match necessário.

**Municipal (TCE-SP):** o número do contrato não acompanha o empenho. Em camadas:
1. **media** — mesmo órgão + mesmo CNPJ + fornecedor com **exatamente um** contrato vigente ali no período.
2. **baixa/ambíguo** — fornecedor com vários contratos no órgão → **não vincular**. Vira pendência para curadoria manual.

Tela de "empenhos não atribuídos" não é dívida técnica: é transparência sobre o que é fato e o que é inferência.

## F.5 🔴 Antecipação — as métricas que criam recorrência
Origem: `orcamento_anual`, `emendas_parlamentares`, `execucao_despesa` (absorvidos do iVerbas).

```
POTENCIAL_DE_COMPRA(orgao, ano) =
  dotacao_atualizada − valor_empenhado        -- dinheiro alocado ainda não comprometido

SALDO_POR_NATUREZA(orgao, natureza_despesa) =
  mesmo cálculo, segmentado pelo tipo de despesa que o cliente vende

EMENDAS_DO_SEGMENTO(empresa) =
  emendas destinadas a órgãos/finalidades compatíveis com o perfil do cliente

SAZONALIDADE(orgao) =
  distribuição histórica de empenho por mês  -- quando este órgão costuma comprar
```

> **Este bloco é a resposta ao churn.** Todas as demais métricas olham para trás e se consultam uma vez. Estas olham para frente e mudam toda semana. Emenda parlamentar antecipa em meses o dinheiro que virará licitação.
>
> **Prioridade de produto:** F.3 e F.5 vêm antes de F.1 e F.2 na ordem de construção do que é voltado ao cliente.

## F.6 Demais métricas
- **Minhas vitórias:** licitações e contratos vencidos por CNPJ.
- **Meus concorrentes:** quem mais vence no segmento/órgão, com valor total.
- **Concorrente sancionado:** vencedor recorrente do segmento que entrou em CEIS/CNEP → *abre vaga no mercado*. Exibir sempre tipo, órgão sancionador, vigência e escopo — sanção tem alcance limitado; publicar sem isso gera acusação falsa.
- **Janela de recompra:** contratos do segmento vencendo nos próximos 6 meses.
- **Concentração e dependência** (absorver do iVerbas): quanto do faturamento de um fornecedor vem do setor público, e quão concentrado está um órgão em poucos fornecedores.

---

# PARTE G — COMERCIAL

## G.1 Planos (já populados)

| Plano | Compra | Entrega |
|---|---|---|
| **Inteligência** | self-service, preço público | vitórias · dinheiro na mesa · concorrentes · sancionadas · radar diário · **preço de referência** |
| **Execução** | consultivo | tudo acima + empenhos · score de pagamento · **potencial de compra** · **emendas** · janela de recompra · API |
| **Canal** | consultivo | tudo + white-label · múltiplos clientes finais |

Features são **cumulativas** no array (Execução contém as de Inteligência). Preços em zero — definir vendendo aos 10 primeiros e anotando onde cada um aceitou sem hesitar.

## G.2 Gestão de usuários

| Papel | Pode |
|---|---|
| `admin_central` | tudo, todas as empresas |
| `admin_cliente` | convidar usuários, gerir CNPJs, ver faturas |
| `usuario_cliente` | consultar |
| `admin_parceiro` | gerir os clientes finais dele |

Papel vive em `user_roles`, nunca em claims do token. Convite verifica `max_usuarios`; cadastro de CNPJ verifica `max_cnpjs`. Ninguém altera o próprio papel nem a própria empresa. Último `admin_cliente` não pode se rebaixar.

## G.3 Pagamento (Asaas)

```
trial ──(pagamento confirmado)──> ativa
ativa ──(PAYMENT_OVERDUE)───────> inadimplente
inadimplente ──(pagamento)──────> ativa
inadimplente ──(D+15)───────────> suspensa      (bloqueia acesso, NUNCA apaga dado)
qualquer ──(cancelamento)───────> cancelada     (acesso até fim_periodo_atual)
```

**Regras inegociáveis:**
1. Nunca trafegar nem armazenar dados de cartão. Checkout no Asaas.
2. **Pix Automático primário** (MDR ~0,4–1,2%, sem chargeback); cartão alternativo (~2,99% + R$0,49).
3. **A verdade é o webhook, nunca o retorno do navegador.** `criar-assinatura` grava `trial`. Só o webhook ativa.
4. **Idempotência:** primeira ação do webhook é inserir em `webhook_eventos`. Violou o UNIQUE? Já processado: responda 200 e encerre.
5. Webhook valida `ASAAS_WEBHOOK_TOKEN` no header. Sem token → 401.
6. Créditos comprados só são lançados **após** confirmação do webhook.
7. Suspensão bloqueia acesso; jamais apaga dado.
8. NFS-e via Omie na confirmação.

**Teste obrigatório:** dispare o **mesmo** evento duas vezes. Se o período for estendido duas vezes, a idempotência falhou.

## G.4 API pública (i-Ganhei e canal)
Versionada na URL (`/v1/...`) · chave com **hash** no banco · escopos por chave · rate limit **por chave** · log de auditoria · **recorte automático** (chave de uma empresa só devolve a fatia dela).

O i-Ganhei é o primeiro consumidor real e o melhor teste de isolamento.

---

# PARTE G-BIS — CAMADA OPERACIONAL

> Pré-requisito de qualquer venda, inclusive de piloto gratuito.
> **Boa parte do churn em SaaS B2B é operacional, não de produto:** pagamento que falha sem ninguém perceber (20–40% do cancelamento total), cliente que não extrai valor na primeira sessão, e cliente com problema que não acha suporte.

## G-BIS.1 Admin Central

**Tela 1 — Clientes:** empresa, CNPJ, plano, status, data de entrada, MRR, nº de usuários, nº de CNPJs. Ações: criar manualmente, cortesia, estender trial, suspender, reativar.

**Tela 2 — Uso e risco de churn** 🔴 *(já construída no Lovable — preservar o desenho)*

| Sinal | Por que importa |
|---|---|
| Último acesso | **Sem acesso há 14 dias = churn anunciado com 60 dias de antecedência** |
| Frequência (7 dias vs. 7 anteriores) | queda precede cancelamento |
| Telas mais abertas | revela o que o cliente valoriza |
| Perguntas à IA | revela o que procura e não acha |
| Usuários ativos / cadastrados | adoção interna |
| Registros criados (participações) | **melhor previsor de retenção** |

Semáforo: **verde** ≤7 dias · **amarelo** 8–14 · **vermelho** >14. Vermelhos no topo. Alerta automático para a StartGi.

**Tela 3 — Financeiro:** MRR total e por plano · novos vs. cancelados · churn de receita e de logo · inadimplência · NFS-e pendentes · receita de créditos.

**Tela 4 — Créditos e margem de IA:** consumo por cliente · custo interno vs. cobrado · **margem real** · alerta abaixo do piso.

**Tela 5 — Suporte:** chamados, tempo de resposta, histórico.

**Recurso crítico — impersonar cliente:** ver o sistema exatamente como o cliente vê, **somente leitura**, com log de auditoria (quem, qual cliente, quando) e banner permanente. Sem isso, todo atendimento vira "manda um print".

## G-BIS.2 Jornada de compra
```
Landing → Planos com preço → Cadastro → Pagamento → Onboarding → PRIMEIRO VALOR
```
**Cadastro:** e-mail corporativo + CNPJ; preencher razão social automaticamente pelo CNPJ.
**Trial:** 14 dias **com meio de pagamento cadastrado** — converte melhor e filtra curioso.
**Onboarding, máximo 3 passos:** confirmar CNPJ(s) → escolher segmento (sugerir pelo CNAE, nunca campo vazio) → **mostrar valor**.

> ### O "aha" da primeira sessão
> *"Você venceu 12 licitações (R$ 3,2 mi) em 24 meses. No mesmo período, R$ 47,3 mi do seu segmento foram para 8 concorrentes. E há R$ 18 mi em orçamento alocado e ainda não comprometido nos órgãos que compram o que você vende."*
>
> **Se o cliente sair da primeira sessão sem ver um número que o surpreenda sobre a própria empresa, ele não volta.** Falha de ativação é o maior previsor de cancelamento.

**Estado vazio nunca pode ser vazio.** Sem histórico, mostrar o mercado do segmento.

## G-BIS.3 Área do assinante
Faturas e NFS-e · forma de pagamento · upgrade imediato / downgrade no fim do ciclo · saldo e extrato de créditos · recarga avulsa e automática (com confirmação explícita e e-mail a cada recarga) · usuários · CNPJs e perfil · **cancelamento self-service com pesquisa de motivo obrigatória**.

> Dificultar cancelamento não reduz churn — gera reclamação. O motivo declarado é dado estratégico.

## G-BIS.4 Churn involuntário 🔴 maior ganho por esforço

| Momento | Ação |
|---|---|
| D-3 | lembrete |
| D+0 falha | nova tentativa + e-mail |
| D+3 | segunda tentativa + e-mail |
| D+7 | terceira tentativa + **WhatsApp / contato humano** |
| D+15 | suspensão — **nunca apagar dado** |
| D+45 | cancelamento |

**Pix Automático reduz na origem:** não expira como cartão, sem chargeback. **Alertar a StartGi a cada falha** — não esperar o cliente reclamar.

## G-BIS.5 Atendimento
Canal visível em toda tela · base de conhecimento com as 10 dúvidas previsíveis · **transparência sobre o dado é atendimento preventivo** (toda métrica precisa poder ser aberta e auditada — "de onde veio esse número?" é a pergunta nº 1) · impersonação para resolver.

## G-BIS.6 Medir desde o primeiro cliente
Ativação (% que chega ao "aha") · frequência · profundidade · **registros criados** · churn voluntário vs. involuntário · motivo de cancelamento.

---

# PARTE H — TESTES QUE FAZEM O BUILD FALHAR

1. **Isolamento:** duas empresas, dados distintos. Se A enxergar dado de B → build falha. *Escrever antes da funcionalidade.*
2. **Idempotência do webhook:** mesmo evento duas vezes não estende período duas vezes.
3. **Sinal do empenho:** anulação subtrai, reforço soma. Total confere com o portal do TCE.
4. **Score:** órgão sem pagamento examinado retorna `SD`, nunca nota.
5. **Créditos:** saldo zero recusa a chamada de IA. Nenhum saldo negativo.
6. **Limites de plano:** convidar além de `max_usuarios` é recusado.
7. **Fusão:** nenhuma licitação duplicada após a consolidação das duas bases.

---

# PARTE I — SEQUÊNCIA DE EXECUÇÃO

## Prompt de abertura no Cursor
```
Este é o iPesquisei, sistema de inteligência de mercado B2G com 923 mil
licitações, sendo fundido com o iVerbas (camada de execução orçamentária).
Vamos migrar do Lovable Cloud para nossa stack: Node + TypeScript + Express
+ Prisma + PostgreSQL + BullMQ + React/Vite.

A especificação completa está em ESPECIFICACAO-IPESQUISEI.md. Leia inteiro.

Regras invioláveis:
1. Não recriar o banco. Não rodar db reset. Os dados são o ativo.
2. A IA não calcula métrica. SQL calcula, IA narra.
3. Score sem dado de pagamento retorna SD, nunca uma nota.
4. Nada de Math.random() ou Date.now() em chave de deduplicação.
5. Empenho federal: o vínculo vem pronto do SIAFI via
   /api/contrato/{id}/empenhos. Não implementar match heurístico no federal.
6. Uma tarefa por vez, com teste antes de avançar.

Tarefa 1, e só ela: ler a especificação e me apresentar o plano de execução
em etapas, apontando qualquer contradição que encontrar. Não escreva código.
```

## Ordem

| # | Etapa | Duração |
|---|---|---|
| 0 | **Resgate:** extrair todas as tabelas dos DOIS sistemas + secrets. Conferir contagens | horas |
| 1 | Postgres próprio + restore + **fusão dos schemas** (Parte C.1) + `prisma db pull` | horas |
| 2 | Scaffold da API + **teste de isolamento no CI** | horas |
| 3 | Auth (provedor comprado) + papéis + limites | horas |
| 4 | Planos, assinaturas, gating de feature *(schema já pronto)* | horas |
| 5 | Asaas + webhook idempotente + créditos de IA | horas |
| 6 | Interface de IA; sair do gateway do Lovable | horas |
| 7 | **FASE 0:** `worker:pncp-vencedores` → rodar | código: horas · **execução: dias** |
| 8 | `worker:pncp-atualizacao` + correções do `pncp-publicacao` | horas |
| 9 | `worker:pncp-itens` (preço) + `worker:pncp-atas` | código: horas · execução: dias |
| 10 | `worker:contratos-gov` (absorver do iVerbas) + `orcamento` + `emendas` | horas |
| 11 | Métricas **F.3 (preço) e F.5 (antecipação) primeiro** — são as que retêm | horas |
| 12 | Métricas F.1, F.2, F.6 | horas |
| 13 | Admin Central + onboarding com "aha" | horas |
| 14 | `worker:tce-sp` → rodar | código: horas · **execução: dias** |
| 15 | Radar diário | horas |
| 16 | Frontend unificado + remover `lovable-tagger` | horas |
| 17 | **Parar de usar o Lovable. NÃO remover o Cloud** | minutos |

> **O código cabe em horas.** O que não encolhe são as etapas 7, 9 e 14: chamar o PNCP milhares de vezes e baixar dezenas de milhões de eventos do TCE-SP. É limite de API do governo. **Mas rodam em background** — não bloqueiam as demais.
>
> **Nada da Parte F entra em produção antes da etapa 7 terminar.** Métrica de manchete sobre vencedores furados é número errado com cara de verdade.

---

# PARTE J — PROIBIÇÕES

- ❌ Alertas de edital / robô de lances — commodity, seis concorrentes maduros
- ❌ SSO próprio — destrava venda, não ganha venda. Comprar quando exigirem
- ❌ Portal de notícias como produto — Google Alerts faz de graça
- ❌ Scrapers de portais municipais — o TCE agrega estruturado
- ❌ **Match heurístico de empenho no federal** — o vínculo vem pronto do SIAFI
- ❌ Score com componente "contratos internos"
- ❌ Normalizar score pelo peso das fontes disponíveis
- ❌ IA calculando métrica ou cobrando crédito por SELECT
- ❌ `Math.random()` / `Date.now()` em chave de deduplicação
- ❌ Paginação que para em "duplicata" (parar só em página vazia)
- ❌ `compras.dados.gov.br` legado (404) e `/api/v1/empenho` do Contratos.gov (401)
- ❌ Recriar o banco / `db reset`
- ❌ Clicar em "Remove Lovable Cloud"
- ❌ Editar no Lovable durante a transição
- ❌ Reduzir o plano do Lovable antes da etapa 6
- ❌ Estado novo antes de SP completo

---

# PARTE K — DECISÕES PENDENTES (do CEO)

1. Provedor de Postgres e de autenticação (com SAML desde já).
2. Preço dos três planos e dos pacotes de crédito. *Método: vender manualmente aos 10 primeiros.*
3. **Cobrança do canal: por parceiro ou por cliente final?** Muda o faturamento em ordem de grandeza.
4. Quantos anos de histórico do TCE-SP ingerir. Recomendação: 2.
5. Escopo federal do `worker:contratos-gov`: quais unidades gestoras percorrer primeiro.

---

# PARTE L — LIÇÕES

1. **Medir antes de dimensionar.** Duas estimativas erraram: volume do TCE-SP (10× para menos) e latência (para mais). Só o teste corrigiu.
2. **Testar a porta certa antes de concluir que está fechada.** `/api/v1/empenho` responde 401 e `/api/contrato/{id}/empenhos` responde 200. Uma conclusão precipitada quase custou a arquitetura errada para o empenho federal.
3. **Lote pequeno antes do volume.** O teste com 20 órfãs revelou que a rotina de reparo só enxergava 3.
4. **Guarda-corpo de IA não conserta dado ruim na origem.** O validador confere procedência, não correção.
5. **Sistemas construídos em paralelo podem ser a mesma coisa.** iPesquisei e iVerbas eram as duas metades do ciclo do dinheiro público.

---

# PARTE M — DIVISÃO DE RESPONSABILIDADES

Quem faz o quê. **Tudo que está na coluna do CEO bloqueia o desenvolvedor se não for feito** — ele para e espera.

## M.1 O que só o CEO pode fazer

### 🔴 ANTES do desenvolvedor começar

| # | Tarefa | Por quê |
|---|---|---|
| 1 | **Dar acesso aos 2 repositórios GitHub** (iPesquisei e iVerbas) | é o código |
| 2 | **Dar acesso aos 2 painéis do Lovable** | necessário para extrair os dados e copiar os secrets |
| 3 | **Manter saldo no Lovable Cloud até a extração terminar** | sem saldo, risco de perder acesso à base |
| 4 | **Parar de editar nos dois sistemas no Lovable** | edições simultâneas fazem os repositórios divergirem |
| 5 | Colocar o `ESPECIFICACAO-IPESQUISEI.md` na raiz do repositório do iPesquisei | é o que o Cursor lê |

### 🔴 Contratar e pagar os serviços (o dev não pode fazer por você)

| Serviço | Para quê | Quando |
|---|---|---|
| **PostgreSQL gerenciado** | onde o banco vai morar | antes da etapa 1 |
| **Provedor de autenticação** (com SAML/OIDC) | substitui o Supabase Auth | antes da etapa 3 |
| **Redis** | fila dos workers | antes da etapa 7 |
| **OpenAI** (projeto `iPesquisei - IA`) | substitui o gateway do Lovable | antes da etapa 6 |
| **Asaas** (conta + sandbox) | cobrança | antes da etapa 5 |
| **Hospedagem da API** | onde o Node roda | antes da etapa 2 |

> Peça ao desenvolvedor a recomendação técnica de cada um, mas **a conta e o cartão são seus**. Nunca deixe serviço de produção em conta pessoal de terceiro — foi exatamente esse o problema com o Lovable Cloud.

### 🔴 Decisões que só você toma (Parte K)

| Decisão | Bloqueia | Como decidir |
|---|---|---|
| **Preço dos 3 planos e dos créditos** | etapa 5 | vender manualmente aos 10 primeiros e anotar onde cada um aceitou sem hesitar. Antes disso, qualquer número é chute |
| **Cobrança do canal:** por parceiro ou por cliente final que ele atende? | etapa 5 | muda o faturamento em ordem de grandeza |
| **Quantos anos de histórico do TCE-SP** | etapa 14 | recomendação: começar com 2 |
| **Quais unidades gestoras federais percorrer primeiro** | etapa 10 | a API exige escolher UG. Comece pelos órgãos onde seus clientes atuam |

### 🟡 Verificação (você confere, não constrói)

| # | O que conferir | Como |
|---|---|---|
| 1 | **A extração funcionou** | o dev te entrega uma tabela: contagem de linhas na origem × na cópia, tabela a tabela. **Todas têm que bater.** Se não bater, não seguir |
| 2 | **Os dados chegaram no banco novo** | mesma conferência depois do restore |
| 3 | **O gabarito bate** | escolher 10 a 15 licitações e conferir manualmente no site do PNCP: situação, valor homologado, vencedor. É trabalho de quem entende de licitação — você faz melhor que o dev |
| 4 | **O "aha" impressiona** | abrir o onboarding com o CNPJ de uma empresa conhecida. Se o número não te surpreender, não vai surpreender o cliente |

## M.2 O que o desenvolvedor faz

Tudo que envolve código, banco e infraestrutura. Em ordem, conforme a Parte I:

**Fase 1 — Resgate e fundação** (etapas 0 a 2)
Extrair as tabelas dos dois sistemas, montar o Postgres próprio, fundir os schemas conforme a Parte C.1, rodar o `prisma db pull`, montar a API em Node e **escrever o teste de isolamento no CI antes de qualquer funcionalidade**.

**Fase 2 — Acesso e comercial** (etapas 3 a 6)
Auth, papéis, limites por plano, Asaas com webhook idempotente, créditos de IA, e sair do gateway do Lovable.

**Fase 3 — Dado confiável** (etapas 7 e 8)
Reparar os ~3.368 vencedores e ligar o modo de atualização do PNCP. **Nada de produto entra em produção antes disso.**

**Fase 4 — Coletores** (etapas 9, 10 e 14)
Preço unitário, atas, `contratos-gov` (absorvido do iVerbas), orçamento, emendas e, por último, o TCE-SP.

**Fase 5 — Produto** (etapas 11 a 16)
Métricas (preço e antecipação primeiro), Admin Central, onboarding, radar diário, frontend unificado.

## M.3 O que NÃO é responsabilidade de ninguém dos dois

Estas decisões já estão tomadas nesta especificação. **Não reabrir:**
- Posicionamento (ciclo do dinheiro público; sem alertas de edital)
- Stack (Node + Express + Prisma + PostgreSQL + React/Vite)
- Que o iVerbas é canibalizado, não migrado
- Que o vínculo de empenho federal vem pronto do SIAFI
- Que score sem dado de pagamento retorna `SD`
- Que a IA narra, não calcula

## M.4 Ritmo de acompanhamento

Você não precisa entender o código. Precisa de três perguntas por semana:

1. **"Qual etapa da Parte I está concluída?"** — a lista é fechada; a resposta é um número.
2. **"O que está bloqueado esperando decisão minha?"** — se houver, resolva no mesmo dia. É a maior fonte de atraso.
3. **"Qual teste da Parte H passou esta semana?"** — os sete testes são o critério objetivo de qualidade. "Está pronto" sem teste passando não é pronto.

> **Regra que evitou erro caro neste projeto:** antes de qualquer mudança que grave dado, peça o número primeiro. "Quantos registros isso vai afetar?" antes de "pode rodar". Duas vezes, nesta construção, uma medição de dez minutos evitou semanas de trabalho errado.

---

# PARTE N — FRONTEND UNIFICADO

Os dois sistemas têm frontends separados. Esta parte define como viram um.

## N.1 Princípio de navegação

A navegação segue o **ciclo do dinheiro**, não a origem do sistema. O usuário nunca deve perceber que existiram dois produtos.

```
┌─ MEU PAINEL ───────────────────────────────────────────┐
│  Resumo · Minhas vitórias · Minha participação          │
├─ ONDE TEM DINHEIRO ────────────────────── (antecipação) │
│  Potencial de compra · Emendas · Sazonalidade           │
│  Atas vigentes · Janela de recompra                     │
├─ O MERCADO ────────────────────────────────── (disputa) │
│  Licitações · Preço de referência · Concorrentes        │
│  Dinheiro na mesa · Empresas sancionadas                │
├─ OS ÓRGÃOS ────────────────────────────────── (execução)│
│  Ficha do órgão · Pagamento e execução · Contratos      │
├─ ANÁLISE ───────────────────────────────────────── (IA) │
│  Análise de mercado · Relatórios · Índice StartGi       │
└─ CONFIGURAÇÕES ────────────────────────────────────────┘
   Empresa e CNPJs · Usuários · Plano e faturas · Créditos
```

## N.2 Aproveitamento das telas existentes

| Origem | Tela | Destino |
|---|---|---|
| iPesquisei | LicitacoesPage · SancionadasPage · IndiceStartGiPage · AnalyticsPage · RelatoriosPage | manter, reagrupar no menu acima |
| iPesquisei | DiagnosticoDadosPage · IngestaoMonitorPage · AIMonitorPage · ClientesPage | **área admin**, fora da navegação do cliente |
| iPesquisei | OportunidadesPage · OrgaosScorePage | **descartar** (reposicionamento e score quebrado) |
| iVerbas | PaymentSpeedPage · BudgetBalancePage · BudgetGrowthPage | fundir em **Ficha do órgão** (uma tela, várias abas) |
| iVerbas | PotencialCompraPage · EmendasPage · SeasonalityPage | manter, agrupar em **Onde tem dinheiro** |
| iVerbas | SuppliersPage · SupplierDetailPage · ConcentrationPage | fundir em **Concorrentes** |
| iVerbas | ContractsPage | fundir em **Ficha do órgão** |
| iVerbas | IntelligencePage · DashboardPage | fundir com as equivalentes do iPesquisei |
| iVerbas | ClientsPage · LogsPages · LoginPage | **descartar** (equivalentes do iPesquisei vencem) |

> Regra: quando as duas bases têm tela equivalente, **vence a do iPesquisei** (é a base) e absorve-se o que a do iVerbas tinha de melhor.

## N.3 Duas telas centrais a construir

**Ficha do Órgão** — a tela que materializa o ciclo completo. Um órgão, todas as fases:
```
Orçamento alocado · já empenhado · saldo disponível
Prazo médio de pagamento · taxa de execução · restos a pagar
O que compra (itens e faixas de preço) · de quem compra (fornecedores)
Sazonalidade · emendas destinadas
Licitações recentes · contratos vigentes
```

**Ficha do Fornecedor (concorrente)** — o espelho da anterior:
```
Contratos públicos · valor total · órgãos onde atua
Situação em CEIS/CNEP · concentração e dependência do setor público
Onde ele ganha e você não aparece
```

## N.4 Regra de gating (funcionalidade bloqueada por plano)

Funcionalidade fora do plano **nunca some do menu** — aparece com cadeado e uma linha do que ela entrega, levando ao upgrade. Menu que some confunde; cadeado vende.

Exceção: nada de teaser sobre dado que não existe. Se o TCE-SP ainda não foi ingerido, a funcionalidade não aparece nem com cadeado.

---

# PARTE O — PLANOS E PREÇOS

> ⚠️ **Os valores são hipótese fundamentada, não recomendação firme.** O mercado brasileiro não publica preço (todos os concorrentes são "fale com um especialista"), então não há âncora confiável. **O preço real se descobre vendendo manualmente aos 10 primeiros clientes e anotando onde cada um aceitou sem hesitar.** Use estes números para publicar e começar, não como verdade.

## O.1 A decisão de produto por trás da divisão

**O que retém vai no plano de entrada. O que se monetiza é a profundidade.**

As funcionalidades de antecipação (potencial de compra, emendas, sazonalidade) e o preço de referência são o que faz o cliente voltar toda semana. O instinto de colocá-las só no plano caro está errado: o plano de entrada ficaria sem motivo de recorrência e churnaria por desenho.

| Camada | O que é | Onde vai |
|---|---|---|
| **Gancho** (recorrência) | preço de referência · potencial de compra · atas vigentes | **plano de entrada** |
| **Profundidade** (monetização) | empenho detalhado · score de pagamento · emendas · sazonalidade · API · mais CNPJs e usuários | **plano superior** |

## O.2 Os três planos

### 🔹 INTELIGÊNCIA — R$ 397/mês
*Self-service · preço público · para a empresa que já vende ao governo*

| Inclui | |
|---|---|
| Busca completa | 923 mil licitações, itens, resultados |
| **Preço de referência** | quanto os órgãos pagam pelo que você vende (mín/mediana/máx) |
| **Potencial de compra** | saldo orçamentário dos órgãos do seu segmento (visão consolidada) |
| **Atas vigentes** | oportunidades de carona no seu segmento |
| Minhas vitórias | tudo que sua empresa já ganhou |
| Dinheiro na mesa | quanto do seu segmento foi para concorrentes |
| Concorrentes | quem mais vence, em quais órgãos |
| Empresas sancionadas | CEIS/CNEP, com alerta de concorrente sancionado |
| Registro de participação | histórico das suas disputas |
| Radar diário | resumo por e-mail |
| **Limites** | 3 CNPJs · 5 usuários · 1.000 créditos de IA/mês |

### 🔸 EXECUÇÃO — R$ 1.297/mês
*Consultivo · o fosso · para quem tem contratos públicos vigentes*

| Adiciona | |
|---|---|
| **Ficha completa do órgão** | prazo médio de pagamento · taxa de execução · restos a pagar |
| **Empenho detalhado** | empenhado → liquidado → pago, por contrato (federal e SP municipal) |
| **Emendas parlamentares** | dinheiro carimbado antes de virar licitação |
| **Sazonalidade** | quando cada órgão costuma comprar |
| **Potencial de compra detalhado** | por órgão, programa e natureza de despesa |
| Janela de recompra | contratos do segmento vencendo em 6 meses |
| Ficha do concorrente | concentração, dependência do setor público |
| **API** | integração com o CRM/ERP do cliente |
| **Limites** | 15 CNPJs · 15 usuários · 5.000 créditos de IA/mês |

### 🔷 CANAL / WHITE-LABEL — a partir de R$ 3.997/mês
*Consultivo · para consultorias, escritórios de licitação e integradores*

| Adiciona | |
|---|---|
| Marca do parceiro (CNAME) | o cliente final vê o logo dele |
| Painel multi-cliente | o parceiro gerencia os clientes dele |
| API com escopos | integração no produto do parceiro |
| Suporte dedicado | |
| **Limites** | CNPJs e usuários por faixa contratada · 20.000 créditos/mês |

## O.3 Créditos de IA

**Vende-se crédito, não token.** Preço de token muda quando o provedor quer; crédito é unidade da StartGi e reprecifica sem renegociar com o cliente.

| Consumo | Custa |
|---|---|
| Consulta simples à IA | 1–3 créditos |
| Análise de mercado com ferramentas | 10–30 créditos |
| Leitura e resumo de edital | 20–50 créditos |
| **Métricas em SQL** (preço, dinheiro na mesa, potencial de compra, score) | **0 — nunca cobram crédito** |

**Recarga avulsa:** R$ 97 / 1.000 créditos · R$ 397 / 5.000 · R$ 697 / 10.000
**Recarga automática** opcional (com confirmação explícita e e-mail a cada recarga).

> ⚠️ **Calibrar antes de publicar.** Meça o custo real por tipo de consulta no provedor escolhido e ajuste a tabela de consumo para manter margem ≥ 3×. A relação "1 crédito ≈ R$ 0,10 no varejo" só se sustenta se o custo interno ficar em torno de R$ 0,03.

## O.4 Regras comerciais

**Anual com 2 meses grátis** (≈17% de desconto). Melhora caixa e trava o cliente durante o período em que ele ainda está aprendendo a usar — que é justamente quando o churn é maior.

**Trial de 14 dias com meio de pagamento cadastrado.** Converte melhor que trial longo sem cartão e filtra curioso de comprador.

**Preço público apenas em Inteligência.** Execução e Canal ficam "fale com o time": é onde está a margem e onde a venda consultiva se paga.

**Não crie plano abaixo de Inteligência.** Ticket baixo atrai cliente sensível a preço, que é o que mais cancela, e o custo de suporte é o mesmo.

## O.5 A âncora da conversa comercial

Nunca ancore no custo do dado. Ancore no valor de um contrato:

> *"Um contrato público de porte médio vale entre R$ 100 mil e R$ 1 milhão. Se o iPesquisei mostrar uma oportunidade que você perderia, ou evitar um órgão que não paga, a assinatura anual se paga muitas vezes."*

**O plano Execução só pode ser vendido depois que os coletores existirem** (etapas 10 e 14 da Parte I). Vender o fosso antes de construí-lo é churn garantido e dano de marca.

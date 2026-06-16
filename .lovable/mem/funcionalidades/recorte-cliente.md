---
name: Recorte por Cliente
description: Cada empresa_cliente tem recorte próprio (vitórias por CNPJ + matches por keyword) exposto na API pública via api_keys.empresa_cliente_id
type: feature
---

## Modelo (híbrido)

- **cliente_cnpjs(empresa_id, cnpj)** — 1..N CNPJs por cliente (matriz/filiais). CNPJ sempre normalizado (somente dígitos). Seed automática a partir de `empresas_clientes.cnpj`.
- **cliente_vinculos(empresa_id, tipo, referencia_id, licitacao_id, cnpj_match, data_evento, valor)** — vínculos materializados por CNPJ:
  - `tipo='licitacao_vencedor'` → `referencia_id` = id em `licitacao_vencedores`
  - `tipo='contrato'` → `referencia_id` = id em `contratos`
  - UNIQUE (empresa_id, tipo, referencia_id) evita duplicatas no refresh.
- **api_keys.empresa_cliente_id** (nullable, FK ON DELETE SET NULL): chave vinculada a um cliente entrega só o recorte; chave nula = global (admin).
- **Match por keyword é dinâmico**, sem materialização: `objeto ILIKE ANY (palavras_chave || segmentos)` resolvido nas RPCs `list_cliente_*` e indexado pelos GIN trigram existentes.

## Funções

- `refresh_cliente_vinculos(p_empresa_id uuid)` — popula vínculos por CNPJ (vitórias + contratos). Sem param = todas as empresas.
- `list_cliente_licitacoes(p_empresa_id, filtros…)` — UNION de vitórias (por CNPJ) + matches (por keyword), com `match_source: 'cnpj' | 'keyword' | 'both'` e `valor_vencido`.
- `list_cliente_contratos(p_empresa_id, filtros…)` — análogo para contratos.
- `cliente_resumo(p_empresa_id)` — jsonb com KPIs (vitórias, valor, ticket médio, contratos vigentes, top órgãos).
- `api_key_resolve_cliente(p_hash)` — usada pela edge function `public-api` para descobrir o cliente da chave em uma única chamada.

## Índices críticos

- `idx_contratos_fornecedor_cnpj_digits` — expressão `regexp_replace(fornecedor_cnpj,'\D','','g')`.
- `idx_lic_venc_cnpj_digits` — expressão `regexp_replace(cnpj,'\D','','g')`.
Sem esses dois índices `refresh_cliente_vinculos` excede 60s em escala (contratos ~700k, vencedores ~1.7M).

## API pública (public-api)

Chave global: comportamento antigo (todos os dados).
Chave vinculada: `/licitacoes`, `/contratos` e `/licitacoes/:id` usam as RPCs `list_cliente_*` e respondem `meta.scope = { cliente_id, cliente_nome }`. Endpoints exclusivos do escopo:
- `GET /me`
- `GET /me/resumo`
- `GET /me/vitorias`

## Agendamento

- `pg_cron`: job `refresh-cliente-vinculos-daily` às 03:30 UTC chama `refresh_cliente_vinculos(NULL)`.
- UI `/empresas`: botão "Reprocessar vínculos" por cliente chama a mesma função para a empresa selecionada.

## Objetivo

Dar a cada cliente cadastrado em `empresas_clientes` um recorte próprio do dado público — combinando o que ele **já ganhou** (por CNPJ) e o que **combina com o perfil dele** (palavras-chave + segmentos) — e expor isso na API pública de forma que o i-Ganhei só precise usar a `api_key` certa.

## Arquitetura (híbrido)

```text
empresas_clientes  ──┐
                     ├── cliente_cnpjs (1..N CNPJs por cliente)
                     │
                     ├── cliente_vinculos                      ← MATERIALIZADO (CNPJ)
                     │     (empresa_id, tipo, ref_id, fonte)     job diário + on-insert
                     │     • licitacao_vencedor → item_id / licitacao_id
                     │     • contrato           → contrato_id
                     │
                     └── (sem tabela)                          ← DINÂMICO (keywords)
                           RPC filtra licitacoes/contratos
                           usando palavras_chave + segmentos
                           da empresa, com índice GIN trigram
```

- **Materializado por CNPJ**: rápido, estável, perfeito para "o que esse cliente ganhou / contratou". Não muda se as keywords mudarem.
- **Dinâmico por keywords**: sempre reflete a última versão das `palavras_chave` e `segmentos` do cliente, sem reprocessar histórico.
- **Combinação**: a RPC final faz `UNION` dos dois e marca a origem (`match_source: 'cnpj' | 'keyword' | 'both'`).

## Mudanças no banco

**Novas tabelas (`public`, RLS, GRANTs):**

1. `cliente_cnpjs` — `empresa_id`, `cnpj` (normalizado, único por empresa). Permite múltiplos CNPJs por cliente (matriz/filiais).
2. `cliente_vinculos` — `empresa_id`, `tipo` (`licitacao_vencedor` | `contrato`), `referencia_id` (uuid), `cnpj_match`, `data_evento`, `valor`. Único por (empresa, tipo, referencia_id, cnpj_match). Índices: (empresa_id, data_evento desc), (referencia_id).
3. `api_keys.empresa_cliente_id` — coluna nullable. Quando preenchida, a chave fica "presa" àquele cliente; quando nula, é uma chave global (admin).

**Novas funções:**

- `refresh_cliente_vinculos(p_empresa_id uuid default null)` — SECURITY DEFINER. Faz `INSERT … ON CONFLICT DO NOTHING` cruzando `cliente_cnpjs` com `licitacao_vencedores` e `contratos`. Quando `p_empresa_id` é nulo, processa todas.
- `list_cliente_licitacoes(p_empresa_id uuid, p_filters …, p_limit, p_offset)` — UNION entre `cliente_vinculos` (tipo vencedor) e licitações que batem em keywords (`objeto ILIKE ANY (palavras_chave) OR objeto ILIKE ANY (segmentos)`), com `match_source` calculado.
- `list_cliente_contratos(p_empresa_id, …)` — análogo para contratos.
- `cliente_resumo(p_empresa_id)` — KPIs do recorte (total ganho, ticket médio, top órgãos, top modalidades, contratos vigentes).

**Cron diário**: às 03:30 chama `refresh_cliente_vinculos(null)` após o pipeline PNCP/Portal terminar.

## Mudanças na API pública

Edge function `public-api`:

1. Resolver `empresa_cliente_id` a partir da `api_key` autenticada.
2. Se a chave estiver vinculada a um cliente, **todos** os endpoints já existentes passam a chamar o recorte:
   - `/licitacoes` → `list_cliente_licitacoes(empresa_id, …)`
   - `/contratos` → `list_cliente_contratos(empresa_id, …)`
   - `/licitacoes/:id` → 404 se a licitação não está no recorte do cliente
   - Resposta ganha `meta.scope: { cliente_id, cliente_nome, match_sources: ["cnpj","keyword"] }`
3. Se a chave for global (admin), comportamento atual permanece.
4. Novos endpoints específicos do recorte para o i-Ganhei:
   - `GET /me` — dados do cliente da api_key (nome, CNPJs, segmentos, palavras-chave)
   - `GET /me/resumo` — KPIs consolidados
   - `GET /me/vitorias` — só o que veio por CNPJ (licitações vencidas + contratos firmados), ordenado por data

## Mudanças na UI

`/api-keys`:

- Ao criar uma chave, escolher "**Vincular a cliente**" (select com `empresas_clientes`) ou "Global (admin)".
- Coluna "Cliente" na tabela de chaves.
- Botão "Reprocessar vínculos" por cliente em `/empresas` (chama `refresh_cliente_vinculos(empresa_id)`).

`/empresas` (card do cliente):

- Mostra contadores: licitações ganhas, contratos vigentes, oportunidades por keyword.
- Campo "CNPJs" (lista editável, alimenta `cliente_cnpjs`).

## Backfill inicial

Roda `refresh_cliente_vinculos(null)` uma vez na migration para popular as 2 empresas já cadastradas. O resultado fica disponível imediatamente nos endpoints.

## Notas técnicas

- CNPJ sempre normalizado (`regexp_replace(cnpj, '\D', '', 'g')`) tanto na escrita quanto na consulta — o match precisa ser exato após normalização.
- Match por keyword usa os índices GIN trigram existentes em `licitacoes.objeto` e `contratos.objeto`.
- RLS de `cliente_vinculos` e `cliente_cnpjs`: leitura por `admin_central` ou por usuários da própria empresa (`has_role_for_company`); escrita só `service_role`.
- `api_keys.empresa_cliente_id` com FK `ON DELETE SET NULL` para não derrubar chaves se um cliente for removido.
- Sem mudança no schema de `licitacoes` / `contratos` — esses dados continuam globais; o recorte vive em `cliente_vinculos` + lookup por keyword.

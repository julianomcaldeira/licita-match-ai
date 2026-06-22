# i-pesquisei — API Pública (integração i-Ganhei)

Guia de integração para consumir os dados do **recorte de um cliente específico** (licitações vencidas, contratos, KPIs) via API REST.

---

## 1. Autenticação

Toda chamada exige a API key emitida em `/api-keys` no painel do i-pesquisei, **vinculada ao cliente** (campo "Escopo"). Chaves vinculadas filtram automaticamente os resultados para o CNPJ daquele cliente — não é preciso passar `empresa_id` ou CNPJ nas requisições.

Envie a chave em **um** dos dois headers:

```http
x-api-key: SUA_CHAVE_AQUI
```
ou
```http
Authorization: Bearer SUA_CHAVE_AQUI
```

Respostas de erro:

| Status | Significado |
|---|---|
| `401` | Chave ausente, inválida ou revogada |
| `400` | Endpoint `/me/*` chamado com chave global (sem cliente vinculado) |
| `404` | Recurso fora do recorte do cliente, ou inexistente |
| `429` | Rate limit (caso configurado) |

---

## 2. Base URL

```
https://eiksdfobghixofsxskke.supabase.co/functions/v1/public-api
```

Todos os endpoints são **GET**. Respostas em JSON com o formato:

```json
{
  "data": [ ... ],
  "meta": {
    "scope": { "cliente_id": "uuid", "match_sources": ["cnpj","keyword","both"] },
    "limit": 50,
    "offset": 0,
    "total": 1234
  }
}
```

O campo `meta.scope` indica o recorte aplicado. Em endpoints de listagem, cada item pode trazer `match_source` (`cnpj` = vencedor pelo CNPJ do cliente, `keyword` = match por palavra-chave/segmento, `both` = ambos).

---

## 3. Endpoints

### 3.1 `GET /` — Catálogo
Lista os endpoints disponíveis e versão da API.

### 3.2 `GET /me` — Dados do cliente vinculado
Retorna nome, CNPJ principal, segmentos, palavras-chave e CNPJs adicionais (filiais) do cliente.

### 3.3 `GET /me/resumo` — KPIs consolidados
Resumo agregado (total de vitórias, valor contratado, ticket médio, principais órgãos). Ideal para dashboards no i-Ganhei.

### 3.4 `GET /me/vitorias` — Vitórias por CNPJ
Lista materializada de licitações vencidas e contratos firmados onde o CNPJ do cliente aparece como vencedor/fornecedor.

Query params: `limit` (default 50, máx 200), `offset`.

### 3.5 `GET /licitacoes` — Licitações no recorte do cliente
União entre vitórias por CNPJ + matches por palavra-chave/segmento.

Query params:
| Param | Tipo | Descrição |
|---|---|---|
| `search` | string | Busca textual no objeto |
| `uf` | string(2) | Filtro por UF |
| `modalidade` | string | Ex.: `Pregão Eletrônico` |
| `date_from`, `date_to` | `YYYY-MM-DD` | Janela por data de publicação |
| `only_vencidas` | `true`/`false` | Apenas licitações em que o cliente venceu |
| `limit`, `offset` | int | Paginação |

### 3.6 `GET /licitacoes/:id` — Detalhe da licitação
Retorna a licitação com `itens[]` aninhados. Cada item traz:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid | ID do item |
| `numero_item` | int | Nº do item no edital |
| `descricao` | text | Descrição completa |
| `quantidade` | numeric | Quantidade licitada |
| `unidade` | text | Unidade de medida (UN, KG, …) |
| `valor_unitario_estimado` | numeric | Preço unitário estimado |
| `valor_unitario_final` | numeric | Preço unitário homologado |
| `vencedores[]` | array | Vencedores do item (pode ser >1) |

Cada `vencedores[]` traz: `id`, `cnpj`, `razao_social`, `valor_final`, `percentual_desconto`.

Para chaves vinculadas, retorna `404` se a licitação não estiver no recorte do cliente.

### 3.6.1 `GET /licitacoes/:id/itens` — Itens (lista plana p/ integração)
Mesmo conteúdo dos itens acima, sem o envelope da licitação. Útil para sincronizar tabelas de itens/vencedores em outro sistema sem ter que descer pelo objeto completo.

```json
{
  "data": [
    {
      "id": "…",
      "licitacao_id": "…",
      "numero_item": 1,
      "descricao": "Veículo de Passeio Hatch…",
      "quantidade": 1,
      "unidade": "UN",
      "valor_unitario_estimado": 83830.30,
      "valor_unitario_final": 83800.00,
      "vencedores": [
        { "id": "…", "cnpj": "54977710000103", "razao_social": "D+ SAUDE VEICULOS…", "valor_final": 83800.00, "percentual_desconto": 0.04 }
      ]
    }
  ],
  "meta": { "scope": {…}, "licitacao_id": "…", "total": 3 }
}
```


### 3.7 `GET /contratos` — Contratos no recorte do cliente
Query params:
| Param | Descrição |
|---|---|
| `search`, `uf`, `date_from`, `date_to`, `limit`, `offset` | iguais a `/licitacoes` |
| `only_proprios` | `true` para apenas contratos onde o CNPJ do cliente é fornecedor |

### 3.8 Endpoints globais (não filtram por cliente)
- `GET /orgaos` — lista de órgãos compradores (params: `search`, `uf`, `order_by`, `limit`, `offset`).
- `GET /empresas-vencedoras` — ranking de empresas vencedoras.
- `GET /sancionadas` — empresas em CEIS/CNEP (`search`, `uf`, `tipo_cadastro`, `vigente`).
- `GET /check-sancionada/:cnpj` — checagem rápida de CNPJ sancionado.

---

## 4. Exemplos

### cURL — resumo do cliente
```bash
curl -H "x-api-key: $IPESQUISEI_KEY" \
  https://eiksdfobghixofsxskke.supabase.co/functions/v1/public-api/me/resumo
```

### cURL — licitações vencidas no último ano em SP
```bash
curl -G \
  -H "x-api-key: $IPESQUISEI_KEY" \
  --data-urlencode "only_vencidas=true" \
  --data-urlencode "uf=SP" \
  --data-urlencode "date_from=2025-06-16" \
  --data-urlencode "limit=100" \
  https://eiksdfobghixofsxskke.supabase.co/functions/v1/public-api/licitacoes
```

### JavaScript (fetch)
```js
const BASE = "https://eiksdfobghixofsxskke.supabase.co/functions/v1/public-api";
const headers = { "x-api-key": process.env.IPESQUISEI_KEY };

async function getResumo() {
  const r = await fetch(`${BASE}/me/resumo`, { headers });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()).data;
}

async function listVitorias({ limit = 50, offset = 0 } = {}) {
  const url = new URL(`${BASE}/me/vitorias`);
  url.searchParams.set("limit", limit);
  url.searchParams.set("offset", offset);
  const r = await fetch(url, { headers });
  return r.json();
}
```

### Node — paginação completa
```js
async function fetchAllLicitacoes() {
  const all = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const r = await fetch(
      `${BASE}/licitacoes?only_vencidas=true&limit=${limit}&offset=${offset}`,
      { headers }
    );
    const { data, meta } = await r.json();
    all.push(...data);
    if (all.length >= meta.total || data.length === 0) break;
    offset += limit;
  }
  return all;
}
```

---

## 5. Boas práticas

- **Uma chave por ambiente** (homolog e produção do i-Ganhei separados). Revogar uma não afeta a outra.
- Guarde a chave em variável de ambiente (`IPESQUISEI_KEY`), nunca no código versionado.
- Limite o `limit` a 200 por request. Para extrações grandes, pagine via `offset`.
- Quando o cliente cadastrar um novo CNPJ (filial), peça ao admin do i-pesquisei para clicar em **"Reprocessar vínculos"** na página `/empresas` — leva poucos segundos para atualizar `/me/vitorias` e o recorte de `/licitacoes`.
- Em caso de `401`, valide o header. Em caso de `404` em endpoint vinculado, verifique se o CNPJ do cliente está cadastrado em `cliente_cnpjs` (visível em `/me`).

---

## 6. Versionamento

A versão atual é exposta em `GET /` (`version` no payload). Mudanças breaking serão anunciadas com pelo menos 30 dias de antecedência por e-mail ao integrador.

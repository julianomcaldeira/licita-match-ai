
# Índice StartGi — Plano de implementação

## 1. Backend (Lovable Cloud)

**Nova tabela `indice_startgi_mensal`** (migração):
- `mes_referencia` text PK (formato `YYYY-MM`)
- `indice_startgi` numeric(8,1)
- `valor_total_brl` numeric(18,2)
- `volume_contratos` int
- `variacao_mom`, `variacao_yoy` numeric(6,2)
- `breakdown_modalidade`, `breakdown_esfera`, `breakdown_segmento` jsonb
- `destaque_segmento` text, `destaque_variacao` numeric(6,2)
- `dados_parciais` boolean
- `ultima_atualizacao` timestamptz
- GRANTs (`authenticated` SELECT; `service_role` ALL) + RLS (leitura: authenticated; escrita: somente `admin_central`/`admin_empresa` via `has_role`).

**RPC `compute_indice_startgi(p_mes text, p_force boolean default false)`** (SECURITY DEFINER):
- Calcula a partir de `contratos` (campo `data_assinatura`/`created_at` filtrado por mês), somando `valor_inicial` como proxy de `valorGlobalContrato`.
- Base Jan/2024 = soma do mês inserida na própria tabela (idempotente).
- Calcula MoM e YoY consultando linhas anteriores.
- Breakdown:
  - **Modalidade**: agrupa via join `licitacoes.modalidade` quando `contratos.licitacao_id` existe; resto vai em "outros".
  - **Esfera**: heurística pelo `cnpj_orgao` cacheado em `orgao_siafi_cache` quando possível; fallback por palavras-chave no `orgao_nome` (Município/Prefeitura → municipal; Governo do Estado/Secretaria de Estado → estadual; União/Ministério/Federal → federal).
  - **Segmento**: top-1 por `objeto` agrupado em buckets simples ("TI e Telecom", "Saúde", "Obras", "Educação", "Serviços Gerais", "Outros") por keywords.
- Marca `dados_parciais = true` se `now() < (primeiro dia do mês seguinte ao mes_referencia) + interval '10 days'`.
- Não recalcula se idade > 60 dias e linha existe, exceto `p_force`.
- UPSERT na tabela e retorna jsonb da linha.

**RPC `list_indice_startgi(p_limit int)`** retorna últimos N meses ordenados desc.

## 2. Frontend

**Roteamento e menu**
- Nova rota `/indice-startgi` em `App.tsx` (lazy import).
- Item "Índice StartGi" com ícone `TrendingUp` em `AppSidebar.tsx`, visível só se `role in ('admin_central','admin_empresa')` (filtro inline com `useAuth`).

**Página `src/pages/IndiceStartGiPage.tsx`** com seções:
1. **Controles**: `Select` mês/ano (default último mês fechado), botão "Gerar Índice" → invoca RPC `compute_indice_startgi`, status "Atualizado em…".
2. **Preview + Exportação**: componente `<IndiceStartGiCard variant="feed|story" data={...}/>` renderizado em wrapper 1080px com `transform: scale(containerWidth/1080)`. Botões "Exportar Feed PNG", "Exportar Story PNG", "Copiar texto do post".
3. **Cards resumo anual**: maior índice do ano, crescimento acumulado YTD, total contratado YTD (a partir da lista).
4. **Gráfico Recharts** `LineChart` + `Area` com gradiente, `ReferenceLine y=100`, `Dot` destacado no mês selecionado, tooltip custom.
5. **Tabela histórica** com paginação (12/pág), variações coloridas, linha destacada, "Exportar CSV".

**Componente do card `src/components/indice-startgi/IndiceStartGiCard.tsx`**
- Largura fixa 1080px (altura 1080 ou 1920 por variant), background escuro (`bg-slate-900` + gradiente), tipografia Space Grotesk/Inter já existentes.
- Layout conforme ASCII art (número índice peso 800, variações coloridas, barra de esfera tricolor, badge dados parciais, rodapé com URL/hashtag).
- Logo: usa `logo-ipesquisei.png` em filtro claro + texto "StartGi" (não há logo StartGi separado; assumo o existente).

**Exportação**
- `bun add html2canvas`.
- Render off-screen (posição fixed top-[-99999px]) e captura com `scale: 1`.
- Download via `<a download>` com nomenclatura solicitada.

**Helpers `src/lib/indiceStartGi.ts`**
- `formatBRL(v)` com regras tri/bi/mi/mil.
- `buildPostText(data)`.
- `getLastClosedMonth()`.

## 3. Pontos abertos / pressupostos

- **Não existe logo StartGi separada** no projeto; usarei o logo i-pesquisei sobre fundo escuro com texto "StartGi" ao lado. Confirmar se deve subir asset específico.
- **Esfera/Segmento são heurísticas** (não há colunas dedicadas em `contratos`); precisão dependerá da qualidade dos nomes de órgão e objeto.
- **Valor mensal usa `contratos.valor_inicial`** (proxy mais próximo de `valorGlobalContrato`) filtrado por `data_assinatura` quando presente, senão `created_at`.
- **Janeiro/2024** será calculado na primeira execução e fixado como denominador — se ainda não houver dados suficientes daquele mês, o índice ficará inflado; aceitável?
- **Roles "Administrador e Editor"**: o sistema tem `admin_central`, `admin_empresa`, `usuario_empresa`. Mapeei Administrador→admin_central e Editor→admin_empresa. Confirmar.

Posso seguir com esses pressupostos ou prefere ajustar algum antes de implementar?

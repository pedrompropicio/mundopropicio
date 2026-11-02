# #498 — despachos do tempo 2, prontos a gravar (0 · Cowork ChatGPT)

> Preparados pelo 0 · Cowork (Claude) a 03/11/2026 a partir de `docs/testes/issue457/plano.md` (aprovado; respostas do Pedro: cidades **A**, CNPJ **A**).
>
> **Divisão de trabalho (decisão final do Pedro, 03/11/2026):** o **Codex** executa (esforço `high`); o **0 · Claude** escreve os despachos (este ficheiro e os seguintes, ≤ 1.500 palavras cada); o **0 · ChatGPT** grava, acompanha os Fechos e reporta. Autorização 6588361767 e Reserva 6588207224 (Codex) continuam válidas para todos os despachos deste ficheiro.
>
> **Regra de operação (0 · Cowork ChatGPT):**
> 1. Esperar o PR de P1a em `main`.
> 2. Gravar **um** despacho de cada vez como comentário na #498 (cabeçalho exacto `## Despacho — #498 (…)`), só depois de o PR do anterior estar em `main` (merge automático com CI verde).
> 3. Se um Fecho vier «SEM ENTREGA» ou com lacunas dentro do âmbito, redespachar o mesmo texto acrescentando só a secção «Lacunas do Fecho anterior a resolver» — não engordar o resto.
> 4. Para P3a a Autorização passa a R2 em preparação (ver nota de classe nesse despacho); nova Reserva se a lista de componentes mudar.
>
> Cada despacho abaixo começa no `## Despacho` e termina antes do próximo `---`. Copiar integralmente.

---

## Despacho — #498 (tempo 2, P1b: eventos e cards com moeda da empresa)

**Objetivo (1 frase):** os ecrãs de Eventos, cards financeiros e linhas de transação mostram a moeda e o locale da empresa activa (R$ / pt-BR em BR; € / pt-PT em PT, byte a byte igual ao actual).

**Plano aprovado:** parte **P1b** de `docs/testes/issue457/plano.md`. Depende de P1a (já em main): usar `useCompanyLocale()` e `formatMoney(amount, ctx)` de `src/lib/company-locale.ts`; nunca `if (country)` nos componentes.

**Âmbito desta tarefa**
- Neste despacho: `src/pages/Events.tsx` (rótulo «Orçamento (€)» → `labels.budget`), `src/components/EventEditModal.tsx`, `src/components/EventFinancialCard.tsx`, `src/components/DashboardBalanceCards.tsx`, `src/components/TransactionRow.tsx`; testes de render em `src/test/issue498-p1b.test.tsx` (novo) com uma empresa PT e uma BR.
- Noutro despacho: BP (P2b), formulários de transação (P2c), relatórios (P1c+), cidades (P3a).
- Fora de âmbito: cálculo de IVA (P2a/P2b), edge functions.

**Prova de ecrã do Pedro (02/11/2026, Fortal BR):** «Orçamento (€)» no Novo Evento; cards «0,00 €». Ambos têm de passar a R$.

**Critérios de aceitação**
1. Empresa BR: Novo/Editar Evento mostra «Orçamento (R$)»; cards do dashboard e do evento mostram «R$ 0,00» (formato pt-BR); linhas de transação mostram R$.
2. Empresa PT: DOM e texto **idênticos** ao actual (teste de snapshot com fixture PT, gerado antes de alterar e não regenerado).
3. Nenhum `if (country === …)` nos componentes alterados; só consumo do resolvedor.
4. tsgo e vitest completos verdes; baseline `issue498-pt-baseline` intacta.

**Não fazer**
- Não tocar em `drizzle/`, `supabase/`, `.lovable/`, `.github/`, `.env`.
- Não alterar `EventForecast.tsx`, `TransactionFormModal.tsx` nem relatórios (despachos seguintes).
- Não alterar números, totais ou regras — só formatação e rótulos.

**Entrega**
- `.executor/resumo.md` com «### Feito» e «### Não feito / lacunas», um predicado por linha. Entrega parcial é aceite se compilar e os testes passarem. Dificuldade, volume ou tempo não são motivo para parar.

---

## Despacho — #498 (tempo 2, P2a: política de IVA por empresa e menu)

**Objetivo (1 frase):** numa empresa BR o IVA deixa de ser proposto (taxa 0, total = base) e o menu «Gestão IVA» e as rotas fiscais PT ficam ocultos; em PT nada muda.

**Plano aprovado:** parte **P2a** de `docs/testes/issue457/plano.md`. `ivaPolicy` e `capabilities.iva` vêm de `src/lib/company-locale.ts` (P1a).

**Âmbito desta tarefa**
- Neste despacho: `src/lib/company-locale.ts` (só se faltar algum campo), `src/hooks/useEventIvaCountry.ts`, `src/hooks/useEventIvaRates.ts`, `src/components/IvaRateSelect.tsx`, `src/components/AppSidebar.tsx`, `src/App.tsx` (rotas fiscais PT atrás da capability), `src/lib/validations.ts`; testes em `src/test/issue498-p2a.test.ts(x)` (novo).
- Noutro despacho: BP (P2b), formulários de transação (P2c).
- Fora de âmbito: SQL defaults 23/6 (continuam; o cliente passa a enviar 0 explícito em BR — garantir nos despachos P2b/P2c), edge functions.

**Regras**
- `ivaPolicy === 'none'` ⇒ `useEventIvaRates` devolve taxa única 0 e `IvaRateSelect` não renderiza (ou renderiza oculto com valor 0); a empresa BR **prevalece** sobre a regra de cidade (PT/ES) e sobre a bilheteira.
- `capabilities.iva === false` ⇒ item «Gestão IVA» não aparece na sidebar e a rota devolve o ecrã «indisponível para esta empresa» (sem 404 nem crash). Permissões de `src/lib/permissions.ts` intactas.
- PT/ES: código e saída idênticos (baseline).

**Prova de ecrã do Pedro (02/11/2026, Fortal BR):** linha de BP nova com IVA 23 % por defeito (1.000 → 1.230); «Gestão IVA» no menu.

**Critérios de aceitação**
1. Empresa BR: taxa proposta 0 em qualquer evento/cidade; total = base; «Gestão IVA» ausente do menu; rota fiscal mostra indisponível.
2. Empresa PT: taxas e menu iguais ao actual (snapshot antes/depois).
3. Nenhum `if (country)` fora de `company-locale.ts`.
4. tsgo e vitest completos verdes.

**Não fazer**
- Não tocar em `drizzle/`, `supabase/`, `.lovable/`, `.github/`, `.env`.
- Não alterar `src/lib/iva.ts` nem `@shared/settlement/iva.ts`.
- Não esconder o campo sem mudar a política (defaults/reset/import têm de consumir `ivaPolicy`).

**Entrega**
- `.executor/resumo.md` com «### Feito» e «### Não feito / lacunas». Entrega parcial aceite se compilar e passar; dificuldade, volume ou tempo não são motivo para parar.

---

## Despacho — #498 (tempo 2, P2b: BP em moeda da empresa, sem IVA em BR)

**Objetivo (1 frase):** o BP (agrupada, grelha, planilha, modal de linha, import XLSX) mostra R$ e não pede IVA numa empresa BR; em PT fica igual.

**Plano aprovado:** parte **P2b** de `docs/testes/issue457/plano.md`. Depende de P1a e P2a em main.

**Âmbito desta tarefa**
- Neste despacho: `src/components/EventForecast.tsx` (cards, colunas «VALOR S/ IVA / IVA (€) / TOTAL (€)» → «Valor (R$) / Total (R$)» e coluna IVA oculta em BR; defaults de taxa via `ivaPolicy`), `src/components/BPGridEditor.tsx`, `src/components/ForecastEditModal.tsx`, `src/pages/admin/BPPlanilha.tsx`, `src/lib/import-pl-xlsx.ts`, `src/components/ui/money-input.tsx` (parser aceita formato pt-BR sem alterar o parsing PT); testes em `src/test/issue498-p2b.test.tsx` (novo).
- Noutro despacho: transações (P2c), pagamentos (P2e), parcelas (P2f).
- Fora de âmbito: motor de fórmulas e cachê (não tocar), edge functions.

**Regras**
- Linha nova em BR grava `iva_rate = 0` explicitamente (o default SQL 23 não pode entrar); total = base.
- PT: defaults, reset e import mantêm o comportamento actual; `calcWithIva` intocado.
- Formatação só pelo resolvedor (`formatMoney`); nada de `€` literal nos ficheiros alterados.

**Prova de ecrã do Pedro (02/11/2026, Fortal BR):** BP com «0,00 €» nos cards, colunas com (€), linha nova a 23 %.

**Critérios de aceitação**
1. Empresa BR: cards e colunas em R$; sem coluna/campo IVA; linha nova de 1.000 grava 1.000 com taxa 0 e mostra «R$ 1.000,00».
2. Empresa PT: 1.000 a 23 % → 1.230,00 € como hoje; DOM igual (snapshot).
3. Import XLSX em BR não aplica 23 %; em PT igual ao actual.
4. tsgo e vitest completos verdes; baselines intactas.

**Não fazer**
- Não tocar em `drizzle/`, `supabase/`, `.lovable/`, `.github/`, `.env`.
- Não alterar `bp-formula.ts`, motor de cachê, `useSyncFormulaForecasts`.
- Não alterar `TransactionFormModal.tsx` (P2c).

**Entrega**
- `.executor/resumo.md` com «### Feito» e «### Não feito / lacunas». Entrega parcial aceite se compilar e passar; dificuldade, volume ou tempo não são motivo para parar.

---

## Despacho — #498 (tempo 2, P2c: criar transação em BRL sem FX)

**Objetivo (1 frase):** numa empresa BR, criar uma receita ou despesa grava o valor directamente em BRL, sem pedir taxa de câmbio nem «valor original», sem IVA, com R$ em todo o formulário; em PT o formulário fica igual.

**Plano aprovado:** parte **P2c** de `docs/testes/issue457/plano.md` (secção 2, parágrafo «percursos legados com FX»). Depende de P1a, P2a, P2b em main.

**Âmbito desta tarefa**
- Neste despacho: `src/components/TransactionFormModal.tsx`, `src/components/CurrencyAmountInput.tsx`, `src/lib/bp-tx-currency.ts`, `src/lib/__tests__/issue468-bp-tx-currency.test.ts` (ajustar fixtures sem enfraquecer PT), testes novos em `src/test/issue498-p2c.test.tsx`.
- Noutro despacho: edição (P2d), pagamentos (P2e), parcelas (P2f).
- Fora de âmbito: CHECKs/RPCs SQL com FX (auditoria R2 separada, ver plano §4) — se um CHECK em base impedir gravar BRL sem FX, **registar em lacunas com o nome exacto da constraint** e não contornar.

**Regras**
- «BRL nativo» = moeda da transação igual à moeda da empresa: não é moeda estrangeira; `CurrencyAmountInput` não exige FX nem deriva EUR; `bp-tx-currency.ts` trata moeda igual à da empresa como nativa para qualquer moeda (não só EUR).
- Moeda diferente da moeda da empresa (ex.: despesa em USD numa empresa PT) mantém o percurso legado actual, intocado.
- IVA: campo oculto e `iva_rate = 0` enviado em BR (política P2a).
- Rótulos NIF/Fatura só mudam em P3b; aqui apenas moeda e IVA.

**Critérios de aceitação**
1. Empresa BR: nova despesa 1.000 grava `amount = 1000`, `currency = 'BRL'`, sem `fx_rate`/`original_amount`, `iva_rate = 0`; formulário mostra R$ e nenhum campo de câmbio.
2. Empresa PT: formulário e payload idênticos ao actual (snapshot + teste de payload); USD em PT continua a pedir FX.
3. `issue468-bp-tx-currency.test.ts` continua a passar para PT; casos BR acrescentados, nenhum caso PT removido ou enfraquecido.
4. tsgo e vitest completos verdes.

**Não fazer**
- Não tocar em `drizzle/`, `supabase/`, `.lovable/`, `.github/`, `.env`.
- Não inventar taxa 1 nem preencher `original_amount` artificial.
- Não alterar `TransactionEditModal.tsx` (P2d) nem pagamentos/parcelas.

**Entrega**
- `.executor/resumo.md` com «### Feito» e «### Não feito / lacunas». Entrega parcial aceite se compilar e passar; dificuldade, volume ou tempo não são motivo para parar.

---

## Despacho — #498 (tempo 2, P3a: cidades do Brasil no selector)

**Objetivo (1 frase):** numa empresa BR o selector de cidade do evento mostra primeiro as cidades do Brasil (capitais + praças previstas, com UF), e fica preparado o complemento idempotente do seed BR para a janela Claude.

**Plano aprovado:** parte **P3a** de `docs/testes/issue457/plano.md`; decisão do Pedro (03/11/2026): opção **A** — capitais e praças já previstas, completando as capitais em falta; sem lista municipal integral.

**Âmbito desta tarefa**
- Neste despacho: `src/components/CityVenueSelector.tsx` (ordenação/prioridade pelo país da empresa; grupo «Brasil» com `Cidade · UF`), `src/lib/country.ts` (mapa ISO→nome inclui BR), `src/lib/__tests__/issue498-cities.test.tsx` (novo), e o ficheiro **inerte** `supabase/manual/issue498-cidades-br.INERTE.sql` com INSERT idempotente por `(country, lower(name), state)` das 27 capitais + praças já previstas no seed existente (`supabase/migrations/20260620221854_…sql`), sem duplicar a «Fortaleza» criada manualmente a 02/11/2026 (comparar por nome e UF, normalizando acentos).
- Noutro despacho: aplicação do SQL (janela Claude, R2 com «Sim»), fornecedores (P3b).
- Fora de âmbito: salas/venues, lista municipal integral.

**Nota de classe:** esta parte toca `supabase/manual/` — a Autorização desta Issue é R1. Antes de gravar este despacho, o 0 grava uma **nova Autorização** idêntica à 6588361767 com `- **Classe:** R2` e `- **Capacidades libertadas:** \`codigo+testes\` = sim, \`ficheiros de migração\` = sim`, e uma Reserva nova se a lista de componentes mudar (libertar a anterior primeiro). Sem isto as travas recusam o caminho.

**Critérios de aceitação**
1. Empresa BR: grupo «Brasil» aparece primeiro, com as cidades existentes na tabela `cities` para `country='BR'`, formato «Fortaleza · CE»; empresa PT: ordem e grupos iguais ao actual.
2. O SQL inerte é idempotente (segunda execução insere 0 linhas) e não cria duplicado de Fortaleza/CE; tem cabeçalho com contagem esperada e rollback comentado.
3. tsgo e vitest completos verdes.

**Não fazer**
- Não aplicar SQL; não tocar em `drizzle/migrations/meta`, `.lovable/`, `.github/`, `.env`.
- Não criar catálogo de cidades paralelo nem alterar o schema de `cities`.

**Entrega**
- `.executor/resumo.md` com «### Feito» e «### Não feito / lacunas». Entrega parcial aceite se compilar e passar; dificuldade, volume ou tempo não são motivo para parar.

---

## Depois de P3a — janela Claude

1. Aplicar `supabase/manual/issue498-cidades-br.INERTE.sql` em homolog e em Live com «Sim» (PROC-promocao); aplicar a 0302 (#403b) se o P3b for seguir.
2. Publish do ERP com «Sim».
3. Pedro testa na Social Artists; defeitos → corretivos P0 na #498.
4. Restantes partes do plano (P1c–P1j, P2d–P2g, P3b–P3c, P4a–P4d) pela ordem do plano, um despacho de cada vez, com o mesmo modelo destes.

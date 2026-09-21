# PROC — Captação de vendas Onebox (H&K Madrid)

Desde **21/09/2026** a captação corre **no servidor**, sozinha, sem o Chrome do Pedro.
A fonte é a edge function `fetch-onebox-dashboard` com o cron `onebox-sync-hourly`.
O método pelo Chrome está no fim deste ficheiro, marcado como **histórico** — é recurso
morto, não é fonte.

## Contexto que não se reinvestiga

- Painel: `https://dash.oneboxtds.com/superset/dashboard/43/` (Apache Superset).
- Evento: **H&K Madrid**, `bf9ce2d8-754e-4485-8427-e2d486c39919`.
- Bilheteira: conta **ECI (El Corte Inglés)** `00687bfd-8dd7-475a-a530-615605e9d135`, tipo `ticket_office`.
- Company MP: `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`.
- Datasource `33`, dashboard `43`. Charts: `180` (Ventas por Sesion), `186` (Resumen Periodo), `1723` (Resumen Economico v2).
- **O `dash.oneboxtds.com` deixa passar o IP das edge functions.** `tickets.oneboxtds.com` dá 403 a servidores e a Fever dá 401 — não confundir domínios.
- **Não é preciso API da GTS.** O login de formulário do Superset funciona a partir do servidor: `GET /login/` para o `csrf_token`, `POST /login/` → 302, `/api/v1/me/` → 200, `/api/v1/dashboard/43` → 200. Provado a 20–21/09/2026.
- A marca `on_sale` existe porque o lançamento das sessões é faseado por decisão comercial: sessões retidas nunca se leem como fraqueza de vendas.

## ARMADILHA — `dry_run` é o default

**A `fetch-onebox-dashboard` assume `dry_run` quando o parâmetro NÃO é enviado.**
O primeiro cron foi criado sem ele e teria corrido de hora a hora a dar sucesso sem
gravar nada. O corpo do pedido **TEM de levar `"dry_run": false` explícito.**

Corpo correcto do cron:

```json
{"mode":"hourly_edge","dry_run":false}
```

Quem vir corridas com `success` e os números parados verifica **primeiro** isto.

## O modelo

- **`ticket_sales`** guarda o **acumulado actual** — uma linha por sessão × canal, `source = 'onebox_import'`. Cada corrida **substitui** o conjunto todo.
- **`onebox_daily_sales`** guarda o **histórico diário** — uma linha por evento por dia. É daqui que sai a análise de 7 dias e de mês.
- **`onebox_sync_runs`** guarda cada corrida, com ou sem sucesso; é dela que sai a hora da última captação mostrada no ecrã da bilheteira.

**As vendas do dia lêem-se pela data de compra (`fechahoracompra`), não por diferença
entre capturas.** Por isso a série diária é exacta, imune a falhas e reconstruível em
retroactivo: cada corrida reescreve a série inteira.

## Como corre

1. **Login próprio.** Secrets `ONEBOX_DASH_USER` e `ONEBOX_DASH_PASSWORD`. `GET /login/` → `csrf_token` do input escondido; `POST /login/` → 302; confirmação em `/api/v1/me/` (200). Sessão expirada devolve 401 — **nunca repetir o POST**, a corrida termina e regista.
2. **Descoberta dinâmica dos gráficos.** `GET /api/v1/dashboard/43/charts` dá o `form_data` de cada chart (as métricas são objectos, não nomes) e `GET /api/v1/dashboard/43/filter_state/<key>` (sem barra final) dá os filtros nativos. Nada é hardcoded para além dos números dos slices.
3. **Leitura dos dados.** `POST /api/v1/chart/data` com header `X-CSRFToken` e **`dashboardId: 43`** no `form_data` — sem ele dá 403 `DATASOURCE_SECURITY_ACCESS_ERROR`, porque a conta só tem acesso por contexto de dashboard. Três leituras seguidas, na mesma sessão:
   - grelha por sessão × canal (chart 180);
   - série por data de compra (chart 180, `to_char(fechahoracompra,'YYYY-MM-DD')`);
   - resumo do painel (charts 186 e 1723).
4. **Conferência tripla — é a trava de escrita.** Grelha = série = resumo, ao cêntimo, em entradas e facturación. **Se não baterem, a corrida não escreve nada**, registando falha em `onebox_sync_runs`. O lote anterior fica intacto. As três leituras fazem-se seguidas para não apanharem estados diferentes — diferenças de poucos bilhetes entre leituras separadas no tempo são vendas reais, não erro.
5. **Escrita.** Só depois da conferência, e só com `dry_run: false`:
   - `ticket_sales`: `delete` + `insert` numa só instrução (CTE), para não ficar meio aplicado;
   - `total_value` guarda **só a Facturación**, nunca o Total ingresos — a taxa de conveniência não é receita de bilheteira;
   - `unit_price` = facturación ÷ entradas, a 2 casas;
   - zona por sessão (`DD/MM/AAAA HH:MM`, por `zone_id`), lote por zona com **`iva_rate = 10`** — o default da coluna é 6 e daria líquido inflacionado;
   - canal em `notes`: `Onebox • <nome do canal>`;
   - `financial_account_id` da conta **ECI** e `company_id` explícito;
   - linhas com 0 entradas ignoradas (dariam divisão por zero no `unit_price`);
   - upsert em `onebox_daily_sales` por `(event_id, sale_date)` de **todos os dias da série**.
6. **Invariante final:** soma de `onebox_daily_sales` = acumulado de `ticket_sales`. Um dia negativo é legítimo (devoluções) e assinala-se no `import_audit`.

**Nota sobre "Datos actualizados".** O chart 1149 (Fecha Actualización) assenta noutro
datasource e devolve 403 por esta via; o campo fica `null` no `import_audit`. Não é falha.

## Cadência

Cron **`onebox-sync-hourly`**, jobid **349**, `35 * * * *`, **24 horas por dia**, no mesmo
molde do BOL (`:25`) e da Ticketline (`:05` e `:15`). Corre com o Mac do Pedro desligado.
Modos: `hourly_edge` e `daily_edge`.

Primeira corrida real com o cron criado, 14:07 de Madrid de 21/09/2026: **1.271 bilhetes e
65.581,75 €**, contra os 1.257 e 64.366,75 € que a captação pelo Chrome tinha deixado.

## Canais

A 15/09/2026, quatro: `Centros Comerciales - El Corte Inglés`, `MB Teatro Albéniz`,
`Web – El Corte Inglés` (travessão longo), `MyEntrada Taquilla`. Canais e sessões novos
aparecem sozinhos. **A MyEntrada tem recargo de 10%**, como os outros; é o canal de vendas
a grupos e as vendas chegam em blocos grandes num só dia — não confundir com aceleração
da procura.

## Sessões à venda (passo independente)

Corre à parte da captação de vendas e lê uma página pública, sem credenciais:
`https://checkoutentradas2.elcorteingles.es/elcorteingles/events/59508`.
`on_sale = true` nas zonas cujo nome (`DD/MM/AAAA HH:MM`) corresponda a uma sessão
listada, `false` nas restantes. **Menos de 5 sessões lidas → não escrever nada.** Sessão
na página que não exista no ERP: não criar, assinalar ao Pedro. Registar no `import_audit`
quantas listadas, quantas `true`/`false` e **quais mudaram de estado**.

---

## HISTÓRICO — captação pelo Chrome do Pedro (08/09 a 21/09/2026)

Guardado só para leitura de registos antigos. **Não é fonte e não se repõe.**

Duas tarefas agendadas do Claude dependiam do Chrome do Pedro: uma lia o painel com a
sessão dele, outra existia só para manter essa sessão viva. Falhava sempre que o Mac
estava desligado e a sessão da Superset expirava em poucas horas (viva às 18h, morta às
21h, verificado a 08/09). Na manhã de 21/09 falhou cinco vezes (01:09, 10:09, 11:08,
12:09, 13:09), todas com "sessão da Superset expirada, 401 em `/api/v1/me/`", deixando os
números parados desde a meia-noite.

Regras do método antigo, para contexto: escolher o Chrome pelo **deviceId
`48348171-37fc-4f97-8430-8de25f66ee78`** e nunca pelo nome; **nunca navegar para
`/login/`**, porque destruía a sessão do Pedro; confirmar `GET /api/v1/me/` a 200 antes de
ler; ler pela API interna do dashboard e não pelo DOM, que deixou de renderizar de forma
fiável a 14–15/09. A cadência era `0 8-23 * * *` em UTC, mais uma diária.

O que se assumia e deixou de ser verdade: que a Onebox não dava acesso programático
porque `POST /api/v1/security/login` devolvia 401. O caminho certo era o **login de
formulário** (`POST /login/` com `csrf_token`), não o endpoint de API.

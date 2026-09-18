# PROC — Captação de vendas Onebox (H&K Madrid)

Corre sempre igual. Cada corrida é uma sessão nova sem memória das anteriores — tudo o que é preciso está aqui.

## Contexto que não se reinvestiga

A Onebox (Apache Superset) **não dá acesso de API à nossa conta**: `POST /api/v1/security/login` devolve 401 "Not authorized" e o provider `ldap` não é permitido. Testado a 08/09/2026. A captação **passa obrigatoriamente pelo Chrome do Pedro**, com a sessão do painel já autenticada — é dela que vêm os cookies.

O que mudou a 15/09/2026: dentro dessa sessão autenticada, **a API interna do dashboard responde**. Deixou de ser preciso depender do DOM. Ver o passo 4.

- Painel: `https://dash.oneboxtds.com/superset/dashboard/43/?native_filters_key=YAu04AgWBog&show_filters=0`
- Evento: **H&K Madrid**, `bf9ce2d8-754e-4485-8427-e2d486c39919`
- Bilheteira: conta **ECI (El Corte Inglés)** `00687bfd-8dd7-475a-a530-615605e9d135`, tipo `ticket_office`
- Company MP: `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`
- Datasource da Superset: `33`. Dashboard: `43`. Charts que interessam: `180` (Ventas por Sesion), `186` (Resumen Periodo), `1723` (Resumen Economico v2).
- A marca `on_sale` existe porque o lançamento das sessões é faseado por decisão comercial: as sessões retidas nunca devem ser lidas como fraqueza de vendas.

**Dois Chrome ligados à conta.** A ferramenta de browser pede para escolher qual. O que tem a sessão do Pedro é o **deviceId `48348171-37fc-4f97-8430-8de25f66ee78`**. Os nomes "Browser 1" e "Browser 2" **trocam entre corridas** — nunca escolher pelo nome, só pelo deviceId. Confirmar com `GET /api/v1/me/` (200 = sessão viva) antes de ler seja o que for.

**A sessão da Superset expira em poucas horas.** Verificado a 08/09/2026: viva às 18h, morta às 21h. A captação de hora a hora só funciona nas horas em que o Pedro tiver estado no painel. A hora da última captação no ecrã da bilheteira é o que revela isso. Uma sincronização verdadeiramente autónoma só existe com acesso de API da GTS.

## O modelo

Duas coisas diferentes, e é essencial não as confundir:

- **`ticket_sales`** guarda o **acumulado actual** — uma linha por sessão × canal, `source = 'onebox_import'`. Cada corrida **substitui** o conjunto todo.
- **`onebox_daily_sales`** guarda o **histórico diário** — uma linha por evento por dia. É daqui que sai a análise de 7 dias e de mês.

**As vendas do dia lêem-se pela data de compra (`fechahoracompra`), não por diferença entre capturas.** Foi assim que passou a ser a 15/09/2026. Antes calculava-se por subtracção de acumulados, o que atribuía ao dia seguinte tudo o que se vendesse depois da última captura — e quando uma corrida falhava, o erro espalhava-se por vários dias. A reconstrução de 15/09/2026 corrigiu seis dos dezasseis dias: 11/09 estava em 65 entradas quando eram 78, e 12/09 em 62 quando eram 51.

Consequência: a série diária é **exacta, imune a falhas de sessão e reconstruível em retroactivo a qualquer momento**. Não há distorção das 23h. Não há dia de arranque sem linha.

## Passos

**1. Abrir o painel**
Seleccionar o Chrome pelo deviceId `48348171-37fc-4f97-8430-8de25f66ee78`. Abrir uma aba nova apontada directamente ao dashboard. **Nunca navegar para `/login/`** — isso destrói a sessão do Pedro. Nunca submeter o formulário de login.

**2. Recarregar e confirmar que a sessão está viva**
`location.reload()`. Depois, duas verificações:
- Se `location.pathname` contiver `/login`, **a sessão expirou e a corrida termina aqui**: não extrai, não escreve, regista falha em `onebox_sync_runs` com o motivo "sessão da Superset expirada". Só o Pedro pode reactivar, entrando no painel.
- `GET /api/v1/me/` tem de devolver 200.

Não esperar pelo DOM. Ver o passo 4.

**3. Atualizar que sessões estão à venda**

Independente da captação de vendas, corre **sempre**, mesmo com a sessão da Superset expirada. Lê uma página pública, sem credenciais.

Página: `https://checkoutentradas2.elcorteingles.es/elcorteingles/events/59508` — a mesma a que se chega pelo botão COMPRAR em `https://www.elcorteingles.es/entradas/teatro/entradas-ilusion-show-madrid/`

Como ler, verificado a 09/09/2026:
- Abrir num separador **novo**. Nunca no separador da Superset.
- Banner de cookies: **"Rechazar todas"**, nunca aceitar.
- Separador **SESSÕES**, depois **"Mostrar mais"** repetidamente até desaparecer. A 09/09 foram precisos 6 cliques para 19 sessões.
- **Armadilha:** o Chrome pode traduzir a página. Quando traduz, as horas aparecem como `17:00` e como `20h00`, e "Mostrar mais" fica dentro de um `FONT` injectado pelo tradutor — clicar nesse elemento não faz nada, é preciso subir ao antecessor clicável.

Escrita:
- `on_sale = true` nas zonas de `event_ticket_zones` do evento cujo nome (`DD/MM/AAAA HH:MM`) corresponda a uma sessão listada; `false` nas restantes.
- Se a página não abrir, não renderizar, ou devolver **menos de 5 sessões**, **não escrever nada**. Vale mais a marca de ontem do que apagar tudo por um erro de leitura.
- Sessão na página que não exista no ERP: **não criar**. Registar e assinalar ao Pedro.
- Registar em `import_audit`: quantas listadas, quantas `true`, quantas `false`, e **quais mudaram de estado**. As mudanças são o que interessa.

Estado a 09/09/2026: 19 à venda, de 21/11 a 13/12; 20 não lançadas, de 18/12 a 10/01. Nenhuma esgotada.

**4. Extrair — pela API do dashboard**

O DOM da grelha **deixou de renderizar de forma fiável**: nas corridas de 14 e 15/09/2026 devolveu 0 tabelas e um body de 44 caracteres, com a sessão viva, mesmo depois de dois `location.reload()` e mais de um minuto de espera. A rota normal é a API. Ler o DOM é o plano B, não o A.

A receita, por esta ordem:

1. Ler o CSRF do input escondido no HTML: `GET /superset/dashboard/43/`, apanhar `name="csrf_token" id="csrf_token" value="..."`. **O endpoint `/api/v1/security/csrf_token/` devolve 403 e não serve.**
2. `GET /api/v1/dashboard/43/charts` — dá o `form_data` de cada chart, incluindo as métricas, que são objectos e não nomes.
3. `GET /api/v1/dashboard/43/filter_state/YAu04AgWBog` — **sem barra final**; com barra dá 404. Dá os filtros nativos: `nombregestorrecinto`, `nombrerecinto`, `nombreevento`, `estado_evento`.
4. `POST /api/v1/chart/data` com header `X-CSRFToken` e, no `form_data`, **`dashboardId: 43`**. Sem o `dashboardId` devolve 403 `DATASOURCE_SECURITY_ACCESS_ERROR` — a conta não tem acesso directo ao datasource 33, só por contexto de dashboard. Juntar aos filtros nativos o `evento_futuro IN (0)`, que é adhoc do chart 180.

Três leituras, feitas **na mesma sessão e com segundos de intervalo** para não apanharem estados diferentes:

- **Grelha por sessão × canal** — chart 180, colunas `nombresesion || ' ' || horariosesion_mi` e `nombrecanal`, métricas `sum_ventas`, `FACTURACIÓN`, `RECARGOS`, `TOTAL INGRESOS`.
- **Série por data de compra** — mesmo chart, coluna `to_char(fechahoracompra,'YYYY-MM-DD')`, métricas `sum_ventas` e `FACTURACIÓN`.
- **Resumo do painel** — charts 186 e 1723.

**5. Conferir — e é aqui que a corrida se decide**

As três leituras têm de bater **ao cêntimo** entre si, em entradas e facturación: soma da grelha = soma da série diária = resumo do painel.

**Se não baterem, a corrida termina aqui.** Não escreve nada. Regista falha em `onebox_sync_runs` com o motivo. O lote anterior fica intacto. Vale mais ficar com dados de ontem do que escrever dados errados hoje.

**Antes de declarar discrepância, verificar se não foi só tempo a passar.** A 15/09/2026 apareceram 3 entradas de diferença entre duas leituras separadas por meia hora: não era erro, eram 3 bilhetes vendidos no intervalo. Por isso as três leituras se fazem seguidas. Se mesmo assim não baterem, é falha a sério.

Motivos típicos de falha: computador desligado, Chrome fechado, sessão da Superset expirada, browser errado escolhido.

**6. Substituir o acumulado**

Apagar as linhas de `ticket_sales` do evento com `source = 'onebox_import'` e inserir as novas **numa só instrução** (CTE com `delete` e `insert`), para não poder ficar meio aplicado.

Regras da escrita, que não mudam:
- `total_value` guarda **só a Facturación** — nunca o Total ingresos. A taxa de conveniência não é receita de bilheteira.
- `unit_price` = facturación ÷ entradas, arredondado a 2 casas.
- Zona por sessão, nome `DD/MM/AAAA HH:MM`, ligada por `zone_id`; lote por zona com **`iva_rate = 10`** — o default da coluna é 6 e daria líquido inflacionado.
- Canal em `notes`: `Onebox • <nome do canal>`.
- `financial_account_id` da conta **ECI** — sem isto as vendas nunca entram num fecho.
- `company_id` explícito, nunca a depender do default.
- **Ignorar as linhas com 0 entradas** — existem (canal com reserva e sem venda) e dariam divisão por zero no `unit_price`.

Canais a 15/09/2026, quatro: `Centros Comerciales - El Corte Inglés`, `MB Teatro Albéniz`, `Web – El Corte Inglés`, `MyEntrada Taquilla`. Atenção ao travessão longo no canal Web. Canais e sessões novos aparecem sozinhos.

**A MyEntrada tem recargo de 10%, como os outros canais.** A versão anterior deste PROC dizia que entraria com recargo zero — estava errado. Confirmado a 15/09/2026: 2.145,00 € de facturación com 214,50 € de recargo. É o canal de **vendas a grupos**: a primeira venda foram 55 lugares de uma vez na sessão de 21/11 20:00, a 39,00 € por bilhete, abaixo dos ~52 € médios dos outros canais na mesma sessão, e nasceu de uma reserva criada a 09/09 que só converteu a 15/09. Vendas deste canal chegam em blocos grandes e num só dia — não confundir com aceleração da procura.

**7. Gravar o histórico diário**

Fazer upsert em `onebox_daily_sales` por `(event_id, sale_date)` de **todos os dias da série**, não só o de hoje. A série vem inteira da leitura por data de compra, por isso reescrever tudo é barato e corrige retroactivamente qualquer dia que tenha ficado mal.

Verificar sempre a invariante: **soma de `onebox_daily_sales` = acumulado de `ticket_sales`**. Se não fechar, há erro — investigar antes de dar a corrida por boa.

Uma diferença negativa num dia é possível e legítima — há devoluções. Grava-se na mesma e assinala-se no `import_audit`.

**8. Registar a corrida**

Escrever sempre em `onebox_sync_runs`, com sucesso ou sem ele: `status`, `mode` (`hourly` ou `daily`), `triggered_by`, `error_message` quando falha, e no `import_audit` o que foi extraído, o resultado da conferência tripla, o acumulado, a série diária e o que mudou desde a corrida anterior.

É desta tabela que sai a hora da última captação mostrada no ecrã da bilheteira. Sem ela, ninguém sabe se está a olhar para números de agora ou da semana passada.

**Nota sobre "Datos actualizados".** O chart 1149 (Fecha Actualización) assenta noutro datasource e devolve 403 por esta via; a célula do painel aparece vazia. O campo fica `null` no `import_audit`. Não é motivo de falha — a detecção de alteração faz-se pelo acumulado.

## Cadência

De hora a hora, na tarefa agendada do Claude com `0 8-23 * * *` em UTC — no verão (UTC+1) corre das 9h às 00h de Lisboa, no inverno (UTC+0) das 8h às 23h. A janela é deliberadamente uma hora mais larga do que o necessário para que **a corrida das 23h, que fecha o dia de vendas, fique coberta em qualquer regime horário sem se tocar no cron duas vezes por ano** (#140, 18/09/2026). Mais a diária. Só corre com o computador do Pedro ligado e o Chrome aberto — quando não estiver, a corrida falha, regista e não estraga nada. Como a série diária passou a vir da data de compra, **falhar horas já não corrompe o histórico**: a corrida seguinte reconstrói tudo.


## Quando a GTS destravar

Se a Onebox der acesso programático à nossa conta, todo o desenho passa para dentro de uma edge function com cron do Supabase: mudam os passos 1, 2 e 4, tudo o resto fica igual. O pedido concreto à GTS não é "uma API" — é acesso programático para a nossa conta, ou um utilizador de serviço com leitura no dashboard 43.

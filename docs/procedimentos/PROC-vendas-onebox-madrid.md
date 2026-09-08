# PROC — Captação de vendas Onebox (H&K Madrid)

Corre sempre igual. Cada corrida é uma sessão nova sem memória das anteriores — tudo o que é preciso está aqui.

## Contexto que não se reinvestiga

A Onebox (Apache Superset) **não tem acesso programático** para a nossa conta: o login por formulário funciona (302), mas `POST /api/v1/security/login` devolve 401 "Not authorized" e o provider `ldap` não é permitido. Testado a 08/09/2026. Por isso a captação **passa obrigatoriamente pelo Chrome do Pedro**, com a sessão do painel já autenticada. Não há alternativa sem browser até a GTS dar acesso de API.

- Painel: `https://dash.oneboxtds.com/superset/dashboard/43/?native_filters_key=YAu04AgWBog&show_filters=0`
- Evento: **H&K Madrid**, `bf9ce2d8-754e-4485-8427-e2d486c39919`
- Bilheteira: conta **ECI (El Corte Inglés)**, tipo `ticket_office`
- Company MP: `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`

**A sessão da Superset expira em poucas horas.** Verificado a 08/09/2026: viva às 18h, morta às 21h. Consequência prática: a captação de hora a hora só funciona nas horas em que o Pedro tiver estado no painel, e falha silenciosamente nas restantes. A hora da última captação no ecrã da bilheteira é o que revela isso — se estiver parada, a sessão precisa de ser reactivada à mão. Uma sincronização fiável só existe com acesso de API da GTS.

## O modelo

Duas coisas diferentes, e é essencial não as confundir:

- **`ticket_sales`** guarda o **acumulado actual** — uma linha por sessão × canal, `source = 'onebox_import'`. Cada corrida **substitui** o conjunto todo.
- **`onebox_daily_sales`** guarda o **histórico diário** — uma linha por evento por dia, com o que se vendeu nesse dia. É daqui que sai a análise de 7 dias e de mês.

O painel só dá acumulado. As vendas do dia obtêm-se por **diferença entre capturas**: acumulado de agora menos o acumulado da última corrida com sucesso do dia anterior.

**A captura das 23h fecha o dia.** O que se vender entre as 23h e as 9h da manhã seguinte conta no dia seguinte. É uma distorção pequena e constante, assumida de propósito.

## Passos

**1. Abrir o painel**
Usar uma aba do Chrome do Pedro com a sessão já iniciada. Não navegar para `/login/` — isso destrói a sessão dele.

**2. Extrair**
A tabela de vendas é a 7.ª `<table>` da página (índice 6). Colunas por linha de canal: `0` canal, `1` entradas, `7` facturación, `8` recargos, `9` total ingresos. As linhas de sessão são as que têm `Subtotal` na 2.ª célula e a data no formato `DD/MM/AAAA HH:MM` na 1.ª.

Extrair também o resumo do painel: a 4.ª tabela (índice 3) dá as entradas, a 6.ª (índice 5) dá Facturación, Recargo promotor, Costes canal, Descuentos e Total ingresos.

**Ignorar a última linha da tabela**, que é o total geral e não uma sessão.

**3. Conferir — e é aqui que a corrida se decide**
A soma das linhas extraídas tem de bater **ao cêntimo** com o resumo do painel, em entradas, facturación, recargos e total.

**Se não bater, a corrida termina aqui.** Não escreve nada em `ticket_sales` nem em `onebox_daily_sales`. Regista em `onebox_sync_runs` com `status` de falha e o motivo. O lote anterior fica intacto. Vale mais ficar com dados de ontem do que escrever dados errados hoje.

Motivos típicos de falha: computador desligado, Chrome fechado, sessão da Superset expirada, tabela ainda por renderizar.

**4. Substituir o acumulado**
Apagar as linhas de `ticket_sales` do evento com `source = 'onebox_import'` e inserir as novas, **numa só instrução**, para não poder ficar meio aplicado.

Regras da escrita, que não mudam:
- `total_value` guarda **só a Facturación** — nunca o Total ingresos. A taxa de conveniência não é receita de bilheteira.
- `unit_price` = facturación ÷ entradas, arredondado a 2 casas.
- Zona por sessão, nome `DD/MM/AAAA HH:MM`, ligada por `session_id`.
- Lote por zona com **`iva_rate = 10`** — o default da coluna é 6 e daria líquido inflacionado.
- Canal em `notes`: `Onebox • <nome do canal>`.
- `financial_account_id` da conta **ECI (El Corte Inglés)** — sem isto as vendas nunca entram num fecho.
- `company_id` explícito, nunca a depender do default.
- Sessões novas ganham zona e lote automaticamente. Canais novos aparecem sozinhos — quando a MyEntrada começar a vender será um terceiro canal, com recargo zero.

**5. Gravar o dia**
Calcular o acumulado de agora (entradas e facturación) e subtrair o acumulado registado na última corrida com sucesso do dia anterior, que está no `import_audit` dessa corrida.

Fazer upsert em `onebox_daily_sales` por `(event_id, sale_date)` com a data de hoje. **Upsert, nunca insert** — de 9h às 23h a mesma linha é reescrita quinze vezes com o acumulado do dia até àquele momento.

Na primeira corrida de sempre não há dia anterior: não se escreve linha diária nenhuma, só se regista o acumulado de partida. A contagem diária começa no dia seguinte.

Uma diferença negativa é possível e legítima — há devoluções. Grava-se na mesma e assinala-se no `import_audit`.

**6. Registar a corrida**
Escrever sempre em `onebox_sync_runs`, com sucesso ou sem ele: `status`, `mode` (`hourly` ou `daily`), `triggered_by`, `error_message` quando falha, e no `import_audit` o que foi extraído, o resultado da conferência, o acumulado e a diferença do dia.

É desta tabela que sai a hora da última captação mostrada no ecrã da bilheteira. Sem ela, ninguém sabe se está a olhar para números de agora ou da semana passada.

## Cadência

De hora a hora entre as **9h e as 23h**, mais a diária. Só corre com o computador do Pedro ligado e o Chrome aberto — quando não estiver, a corrida falha, regista e não estraga nada.

## Quando a GTS destravar

Se a Onebox der acesso de API, todo o desenho acima passa para dentro de uma edge function com cron do Supabase, sem se repensar nada: mudam os passos 1 e 2, tudo o resto fica igual. O pedido concreto à GTS não é "uma API" — é acesso programático para a nossa conta, ou um utilizador de serviço com leitura no dashboard 43.

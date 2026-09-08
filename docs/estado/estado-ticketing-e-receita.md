# ESTADO — Ticketing & Receita

Atualizado: 2026-09-08 · Issues: #73, #78, #128, #129, #130

## Em que pé está

- **Sync de vendas a funcionar** — Ticketline (`fetch-ticketline-reports`, cron horário), BOL (`fetch-bol-reports`) e Fever. `ticket_sales` tem 4.284 registos de sete origens distintas. A bilheteira é a principal fonte de receita e está em nome da MP.
- **O fluxo de fecho de bilheteira está construído há muito e nunca tinha sido usado.** Página `/bilheteiras`, cinco abas por bilheteira. Aba Fechos: wizard de seis passos (evento · bruto calculado de `ticket_sales` com override justificado · deduções por seleção de despesas reais · adiantamentos a abater · transferência para o banco · comprovativo), com `draft` → `confirmed` → `reversed` e estorno que desfaz tudo. Aba Adiantamentos: CRUD completo com transferência bancária opcional no mesmo gesto. Zero adiantamentos e dois fechos em Live, ambos do H&K de abril e ambos sem a transferência lançada.
- **Fonte única do saldo (07-08/09).** `src/lib/ticket-office-balance.ts` — `computeTicketOfficeBalance` devolve total e saldo por evento. Substituiu três fórmulas divergentes em `TicketOffices.tsx`, `TicketOfficeBalancePanel.tsx` e `ReportTicketOfficeAudit.tsx`. Regras: vendas por `ticketSaleRevenue()` com `financial_account_id` estrito; transações da conta com `status` em {approved, paid}, `reversed_at` nulo, `is_hidden` falso, sempre por `paid_amount`; income soma, expense e **transfer** subtraem; adiantamentos só os que têm `transaction_id` e `settlement_id` nulos, mesma regra no total e por evento.
- **Indicador de retenção.** Coluna nova `financial_accounts.advance_retention_pct` (Ticketline a 15, as outras a null). O painel mostra saldo esperado = pct × vendas dos eventos sem fecho confirmado, o desvio, e um aviso acima de 5%.
- **Auditoria reconciliável.** O relatório sintético e a exportação (Excel e PDF) fecham nos dois níveis: (vendas + income) − despesas − transferências − adiantamentos = saldo. Saiu o rateio de comissões por regex `/comiss[ãa]o/i`.
- **Três defeitos corrigidos a 08/09:** o "Registar Venda" gravava vendas sem `financial_account_id`, que nunca entravam num fecho; `is_conciliated` escondia o botão de abrir o fecho; e `EventTicketOfficesTab.tsx` era um gémeo morto de uma secção de `EventTicketing.tsx` — apagado.

## A trabalhar agora

Nada em execução.

## Próximo passo concreto

Registar o fecho da Ticketline para a Anitta, com os números do apuramento 2558/2026 — é o primeiro uso a sério do wizard. Ver "Factos" para os valores. Em paralelo, no H&K Madrid: aguardar a resposta da GTS sobre API antes de desenhar o cron; a carga manual repete-se por extração do dashboard enquanto isso.

## Bloqueios

- **#78** — o import da Ticketline não limpa a série antiga quando o formato muda.
- **#73** — corte por tipo de bilhete.

## Factos que não se reinvestigam

**`ticket_sales` é agregada** — sem comprador individual, email ou gclid. Liga-se ao evento por `zone_id → event_ticket_zones.event_id`; **não há `event_id` direto**. IVA da bilheteira depende da praça: **Portugal 6%, Espanha 10%**. O default da coluna `event_ticket_lots.iva_rate` é **6** — lotes de eventos espanhóis têm de ser criados com `iva_rate = 10` explicitamente, senão o líquido sai inflacionado.

**A transferência quinzenal não se rateia.** A Ticketline transfere 85% das vendas de todos os eventos em venda, em valores arredondados. Quem sabe quanto de cada transferência pertence a cada evento é a Ticketline, e só o diz no apuramento. Por isso: a quinzena entra como uma transferência sem evento; a alocação por evento nasce no fecho, como adiantamentos com `transaction_id` a apontar à transferência de origem (o campo não tem restrição de unicidade, vários eventos podem apontar à mesma). O arredondamento nunca precisa de lançamento de ajuste — desaparece no fecho.

**Três regimes de adiantamento, e o modelo aguenta os três.** Pool quinzenal cross-event (Ticketline); adiantamento por demanda já com evento (foi assim a Anitta, com pedidos à peça); e nenhum adiantamento, só o fecho. A regra que os separa: **o adiantamento só nasce quando se sabe o evento.**

**O saldo fecha em zero porque conta as saídas todas.** Uma transferência entre contas é um par `expense` + `income` na rubrica `10.3`, nunca uma transação de tipo `transfer` — o `transactions_type_check` só aceita `income` e `expense`. Enquanto os ecrãs só contavam despesas com evento, o saldo nunca descia após um fecho. Não é preciso a fórmula ler `ticket_office_settlements`; os fechos só são lidos para o indicador de retenção.

**O passo da transferência no wizard de fecho nunca funcionou.** O insert usa `type: 'transfer'`, que viola o CHECK, e dois campos inexistentes em `transactions` (`target_account_id`, `expected_date`); o erro é engolido sem throw. É por isso que os dois fechos do H&K de abril têm `net_transferred = 0` e nenhuma transferência associada, apesar de estarem confirmados. Issue #132.

**Apuramento 2558/2026 — Ticketline × Anitta, conferido a 07/09.** Bruto 2.424.200,00 (27.047 bilhetes: internet 2.211.170,00 / 24.544 · postos TL 213.030,00 / 2.503, valor que bate ao cêntimo com `ticket_sales`). Deduções 12.863,83: FT FA.2026/2744 de 21/07 (comissão 2% dos postos físicos 4.019,43 + dez caixas de pulseiras 1.400,00) e FT FA.2026/2809 de 29/07 (campanha 2.905,30 + comissionamento das vendas geradas 2.133,67). Onze adiantamentos entre 24/02 e 07/08, 1.103.500,00. Saldo 1.307.836,17, pago a 04/09: **905.000,00 para a EIN** por instrução da MP e **402.836,17 para a MP** (comprovativo Millennium, operação 1889514698). **Não há comissão sobre vendas de internet** — é por isso que o revenue share corre no sentido inverso, da Ticketline para a MP: 5% sobre 2.211.170,00 = 110.558,50 + IVA = 135.986,96, faturado pela MP em 07/09 (FT 2026 101), de que 4% entram como receita do evento e 1% fica como ativo exclusivo MP+EIN.

**As quatro despesas das faturas da Ticketline já estão no BP da Anitta**, cada uma com a sua linha: 2.6.07 Comissão bilhetes 4.019,43 · 4.1.09 Pulseiras Open Bar 980,00 · 4.1.09 Pulseiras Staff 420,00 · 3.2.01 Tráfego Pago Via Bilheteira 5.038,97. Como o evento fecha pelo BP, o custo já lá está; falta-lhes só a liquidação, que o fecho da bilheteira converte de previsto em realizado sem tocar no resultado.

**`is_conciliated` é um carimbo manual, agora ligado ao fecho.** Confirmar um fecho marca-o; estornar desmarca-o. O botão manual em `EventTicketing.tsx` continua a existir. Deixou de esconder o botão de abrir o fecho.

**O estorno de um fecho apaga a transferência criada**, mesmo que o crédito já tenha sido confirmado como liquidado. Comportamento anterior, mantido — mas discutível depois de o dinheiro ter entrado.

**A economia da bilheteira do H&K Madrid (Onebox/GTS, confirmada pela Lorena Zambrano a 08/09).** A *Facturación* do painel é o preço do bilhete e **já leva os 10% de IVA dentro** — não é base tributável. O *Recargo promotor* é a **taxa de conveniência** cobrada ao público por cima do bilhete, 10% arredondado ao cêntimo por bilhete (daí o agregado dar 10,0047% e não 10% exatos; um bilhete de 48,75 € gera 4,88 € de taxa, não 4,875 €). Dessa taxa, **3 pontos percentuais são revenue share da MP e 7 ficam no El Corte Inglés** — o painel dá o valor real do lado do canal na coluna *Costes canal*, que é a que se usa, nunca a percentagem teórica. No fecho final o **Teatro fica com 10% do líquido do bilhete (s/IVA)**. O revenue share e a comissão do Teatro **nascem no fecho da bilheteira, com o apuramento na mão — nunca por estimativa sobre o snapshot de vendas**, tal como o revenue share da Ticketline na Anitta. A coluna *Descuentos* do painel é a **promoção 4x3 do Patio de Butacas**, válida até 20/09 — quatro bilhetes ao preço de três, 25% de desconto. A *Facturación* **já está líquida dela**: o painel mostra o valor cobrado, não o de tabela. Confirma-se pela própria taxa de conveniência, que é 10% da facturación e não do preço de tabela. A 08/09 o desconto acumulado era de 3.779,25 €, ou seja 16,7% da bilheteira potencial de 22.595,00 €.

**Tabela de preços do H&K Madrid (site ECI, verificada a 08/09).** Os preços mostrados ao público **já incluem a taxa de conveniência de 10%** — a facturación que chega ao painel é o preço do site dividido por 1,10. Patio de Butacas Zona A 71,50 € (4x3: 53,63 €) · Patio de Butacas Zona B 66,00 € (4x3: 49,50 €) · Anfiteatro Zona A 60,50 € · Anfiteatro Zona B 49,50 € · Anfiteatro Zona C 38,50 € · PMR e acompanhante 38,50 €. O 4x3 só se aplica ao Patio de Butacas. Links: venda ECI `https://www.elcorteingles.es/entradas/teatro/entradas-ilusion-show-madrid/` e marca branca `https://tickets.oneboxtds.com/eci_teatroalbeniz/events/59508`. Recinto: Umusic Hotel Teatro Albéniz, 21/11 a 13/12/2026.

**Carga manual das vendas do H&K Madrid (08/09).** O painel Onebox é Apache Superset (`dash.oneboxtds.com/superset/dashboard/43`) e a conta da MP lê o dashboard mas **não tem permissão no datasource**, pelo que não há API nem endpoint de dados — a extração foi feita da tabela renderizada. Modelo no ERP: **uma zona por sessão** (nome `DD/MM/AAAA HH:MM`, `session_id` preenchido, capacidade 893), **um lote por zona** com `iva_rate = 10`, e **uma linha de `ticket_sales` por sessão × canal**, com o canal em `notes` (`Onebox • MB Teatro Albéniz` / `Onebox • Web – El Corte Inglés`) e `source = 'onebox_import'`. `total_value` guarda **só a Facturación**, nunca o Total ingresos — a taxa de conveniência não é receita de bilheteira. Toda a carga partilha `import_batch_id = 0be00b09-0809-4e26-9f01-000000000001` e reverte-se num único `delete`. Estado a 08/09: 39 zonas, 16 lotes, 29 vendas, 359 bilhetes, 18.815,75 € de facturación. A automação por cron está **bloqueada** à espera da resposta da GTS sobre API; a Lorena já avisou que provavelmente não será possível porque parte das vendas entra pelo El Corte Inglés. A conta de bilheteira em Live é ECI (El Corte Inglés), tipo ticket_office, e as 29 linhas apontam para ela por financial_account_id — sem isso apareciam agrupadas como "Outras" e nunca entrariam num fecho.

## Onde ler mais

- `.lovable/memory/features/bilheteira-sync.md`, `bol-sync.md`, `venue-retained-door-sales.md`, `ticketline-dashboard-daily-fallback.md`
- `src/lib/ticket-office-balance.ts`, `src/lib/ticket-sales-revenue.ts`, `src/lib/ticket-office-settlement-calc.ts`
- `docs/DECISIONS.md` — D-ERP15
- Issues #73, #78, #128, #129, #130

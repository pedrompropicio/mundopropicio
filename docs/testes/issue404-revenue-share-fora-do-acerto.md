# #404 — Revenue Share fora do acerto do sócio

## Medição antes do Passo 1

Data/hora UTC: 2026-10-31 21:18:11.780 UTC.
HEAD medido: `e577988c461aef18b55b84f71e502cafc452dc01` (HEAD requerido confirmado).
Issue #404 lida pela API GitHub em 31/10/2026; título: “Receita fora do acerto do sócio, dentro do resultado (marca por linha) — caso Revenue Share da Turnê Simone Mendes 2026”.
Regras consultadas: `.lovable/memory/features/partner-settlement.md` (g5, g15-c, g17) e `event-settlements.md` (c, g1, g3, g4). A g15-c está em partner-settlement.md.

Evento raiz: `5e56f568-506f-4469-8802-050182c6d479` — Turnê Simone Mendes 2026.
Fechamento: `0f1f7f67-50cf-4f14-ba6b-8f1ba7e31017` — Fechamento do evento.
Sócio: RSS 2011 BR LTDA, supplier `cc61a57c-6322-4590-93e7-24dd7129bcd2`.
Critério lido da BD: `net_result_gross_expenses`, `committed`, overhead ligado. RSS `settles` 25%; casa `settles` 75/75; sem selo.

### Método e limites

Script exclusivamente temporário: `/tmp/issue404/measure.ts`. Cliente de leitura com a sessão do próprio Pedro obtida pelo mecanismo usado por `scripts/prove-settlement-engine.ts`; nenhum segredo gravado no relatório. Leituras paginadas do carregador existente; sem SQL, DDL, DML, migração, deploy ou Publish.

Uma chamada a `loadStatementBundle` para a família na corrida final; o mesmo bundle alimenta HOJE e SEM AS 4 LINHAS. Na segunda medição só os arrays `transactions` e `forecasts` são filtrados, por IDs exatos; todos os restantes dados permanecem iguais. Chamadas exclusivamente aos módulos existentes `computeStatementEngine` e `buildPartnerStatement`, sem reescrever fórmulas. Valores e diferenças apresentados com `roundCents` do módulo partilhado `iva.ts`.

Esta simulação REMOVE receitas do bundle: por isso reduz também o resultado do evento. NÃO simula a futura marca `excluded_from_partner_settlement`, que deverá manter o resultado do evento intacto. Não constitui execução do Passo 1 nem autoriza alterações seguintes.

### Origem dos números

Todos os caminhos abaixo partem de `supabase/functions/_shared/settlement/statement-service.ts`:
- Receita s/IVA e despesas s/IVA/c/IVA: `computeStatementEngine(bundle)` → nó raiz `perimeter.revenueNet`, `perimeter.expensesNet`, `perimeter.expensesGross`; montagem dos totais delegada a `computeEventSettlementTotals` em `event-settlement-inputs.ts`.
- Resultado do evento nas duas bases: nó raiz `resultNet` e `resultGross`. Âncora g15-c: `engine.eventNetResult` (coincide aqui com `resultNet`).
- Resultado do nó/base de cálculo: nó `0f1f7f67…`, `resultGross`, porque `nodeUsesGrossExpenses=true`.
- Parte RSS: participante `settles` identificado pelo supplier no bundle e pelo `participantId` no nó → `share`; coincide com `buildPartnerStatement(bundle, supplierId).block.account.share`.
- Casa declarada e residual MP: `engine.house.declared` e `engine.house.residual`.
- C1 e C2: `engine.c1.value`, `engine.c2.value`.
- Base a transferir g5: `buildPartnerStatement(bundle, supplierId).block.account.transferBase`.

### Medições (EUR)

| Medida | (1) HOJE | (2) SEM AS 4 LINHAS | (2) − (1) |
|---|---:|---:|---:|
| Receita s/IVA do evento | 448.531,51 | 439.051,89 | −9.479,62 |
| Despesa s/IVA | 444.288,23 | 444.288,23 | 0,00 |
| Despesa c/IVA | 483.671,80 | 483.671,80 | 0,00 |
| Resultado do evento s/IVA | 4.243,28 | −5.236,34 | −9.479,62 |
| Resultado do evento c/IVA | −35.140,29 | −44.619,91 | −9.479,62 |
| Âncora g15-c (`eventNetResult`) | 4.243,28 | −5.236,34 | −9.479,62 |
| Resultado do nó/base de cálculo | −35.140,29 | −44.619,91 | −9.479,62 |
| Parte da RSS (25%) | −8.785,07 | −11.154,98 | −2.369,91 |
| Parte declarada da casa (75%) | −26.355,22 | −33.464,93 | −7.109,71 |
| Residual da MP | 13.028,35 | 5.918,64 | −7.109,71 |
| C1 | 0,00 | 0,00 | 0,00 |
| C2 | 0,00 | 0,00 | 0,00 |
| Base a transferir RSS (g5) | −8.785,07 | −11.154,98 | −2.369,91 |

Nos dois casos: `errors=[]`, C1 e C2 `ok=true`. Decomposição residual: IVA dedutível 39.383,57; nominal gap 0,00; resto 0,00. Não se corrigiu nenhum número para fechar.
Linha g5 RSS nos dois casos: desembolso 0,00; ajustes 0,00; receitas em poder 0,00; extras 0,00; financiamento a devolver 0,00; repasse com IVA desligado. Assim, a base a transferir coincide com a parte da RSS.

### Por cidade — efeito marginal medido pelo mesmo motor

Lisboa e Porto não têm fechamento próprio no carregador; não se inventaram nós nem resultados locais. Para decompor o efeito, correu-se o mesmo motor sobre o bundle da família, retirando só o par TX/BP de cada cidade. A tabela mede diferenças perante HOJE, não totais autónomos das cidades.

| Origem retirada | Receita/base do nó | Parte RSS/g5 | Casa declarada/residual MP | Despesas s/IVA e c/IVA | C1/C2 |
|---|---:|---:|---:|---:|---:|
| SM - Lisboa (`95051bc2-8580-405c-a1ad-f2526ddf9bd4`) | −4.200,75 | −1.050,19 | −3.150,56 | 0,00 | 0,00 |
| SM - Porto (`56e431e8-adcc-4f87-99fd-545c9bb1aefa`) | −5.278,87 | −1.319,72 | −3.959,15 | 0,00 | 0,00 |
| Master (`5e56f568-506f-4469-8802-050182c6d479`) | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| Total | −9.479,62 | −2.369,91 | −7.109,71 | 0,00 | 0,00 |

### Quatro linhas confirmadas no bundle

- TX `bb8641b0-9488-474e-ac9a-db929d7c3862`: Lisboa, 4.200,75, IVA 23%, paid, `event_settlement_id=null`.
- TX `bcf33eae-911a-49d8-9931-202ae220d535`: Porto, 5.278,87, IVA 23%, paid, `event_settlement_id=null`.
- BP `e7fb595a-8e95-4747-ae1b-91916d0eb401`: Lisboa, 4.200,75, IVA 23%, ligada à TX bb8641b0…, `event_settlement_id=null`.
- BP `3ff5e3e0-4a54-42bc-ae2c-b8b61513d98c`: Porto, valor cru 5.278,875, IVA 23%, ligada à TX bcf33eae…, `event_settlement_id=null`.

O valor cru do BP Porto tem meio cêntimo adicional; não altera esta medição: no bucket com receita real o motor usa a TX 5.278,87, não soma a linha do BP novamente.

### Conferência e fecho deste recorte

Expectativa do Pedro: diferença de receita/base −9.479,62 e parte RSS −2.369,91. Medido: exatamente esses valores; desvio 0,00 em ambos. Lisboa −1.050,19 e Porto −1.319,72 também coincidem com a Issue.

Questões/decisões em aberto nesta medição: nenhuma. Passos 1–3, Publish e DML continuam fora deste recorte, sujeitos às autorizações já descritas na Issue e no QUADRO.

## Passo 3

31/10/2026 21:46 UTC. Base de trabalho: `5915adf2665afbe1ddf8c6f65c8c184ddd4192a6`.

Leituras prévias: `.lovable/memory/features/partner-settlement.md`, `event-settlements.md` (c, g1, g3, g15-c), `fecho-filter-parity.md`, `event-cost-basis.md`, `event-revenue-basis.md`, `master-revenue-split.md`; este relatório; `drizzle/migrations/0296_issue404_excluded_from_partner_settlement.sql`.

Motor: partição única de receita repartível/receita só da MP; a presença de TX real marcada continua a impedir fallback BP no mesmo bucket (opção escolhida para preservar o resultado e não duplicar receita). Filhos recebem quota da base sem a receita exclusiva da MP. Fatias do Master herdam a marca. Documento do sócio omite as linhas, cards conservam o resultado completo; PDF interno apresenta receita só MP no resumo e no residual. Editor da TX grava a marca separadamente, numa única escrita autenticada para mãe/filhas, pois a allowlist de update-transaction não aceita o campo e está fora do âmbito. Alterações simultâneas exigem gravação separada, explicitada no erro. Não se executou este fluxo contra dados reais.

Fixture SM agregada, não um novo snapshot Live: receita evento 448.531,51; base sócios 439.051,89; despesa s/IVA 444.288,23 e c/IVA 483.671,80; evento s/IVA 4.243,28 e c/IVA −35.140,29; nó −44.619,91; RSS −11.154,98 (antes −8.785,07); residual MP 15.398,26 (antes 13.028,35); C1/C2 0,00. Testes chamam computeStatementEngine/buildPartnerStatement, sem SQL/HTTP/DML.

Testes novos: issue404-house-only-revenue.test.ts (12) e issue404-exclusion-switch.test.tsx (6). Suíte completa: antes 3057 PASS, 1 FAIL, 6 skipped, 11 todo; depois 3075 PASS, 1 FAIL, 6 skipped, 11 todo. Mesma falha prévia em memory-index: partner-aporte-mirror ausente do índice, não corrigida. Testes existentes de proração/paridade passam; não foi criada uma comparação integral antes/depois dos seis bundles de referência — limite ainda aberto. Tipos: verificação automática tsgo/build OK, sem execução manual de tsc/tsgo.

Journal: idx296, version7, when1793481915441, tag0296_issue404_excluded_from_partner_settlement, breakpoints=true. Snapshot deliberadamente de fora. Tipos gerados já apresentam a coluna nas seis posições Row/Insert/Update, não foram editados manualmente.

RPCs intocadas. get_partner_bp_realized é realizado BP/evento e deve manter a receita. get_partner_event_tx_aggregates é resumo do evento: não deve subtrair a receita; se o portal usar o agregado como base do sócio, precisará expor total repartível separado numa futura alteração autorizada. O documento e a financial-position recebem a regra pelo motor partilhado; nenhum deploy manual ou Publish.

Limites: nenhuma homologação visual nem gravação real (DML proibido), CI remoto por confirmar, suite não totalmente verde devido à falha prévia; não declarar pronto para Publish antes da conferência do 0.

Ficheiros desta frente: memórias partner-settlement/event-settlements; AGENTS.md, roadmap.md, journal; EventFecho, EventForecast, ForecastEditModal, PartnerSettlementExclusionSwitch, PartnerSettlementTab, ReportPartnerSettlement, TransactionEdit/FormModal, TransactionRow, EventDetail; useEventContractResult/useEventSettlementEngine; event-revenue-basis (só selects), partner-settlement-report, export-partner-settlement-internal-pdf; oito módulos settlement partilhados e os dois testes #404; este relatório e QUADRO.

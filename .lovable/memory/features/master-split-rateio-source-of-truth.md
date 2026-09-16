---
name: Master/Split rateio source of truth
description: Define a fonte de verdade atual do rateio Master/Split: BP promovido ao Master usa filhos virtuais, enquanto o vínculo real obrigatório está nas transações parent/child.
type: feature
---
- **Regra de uso interno**: esta fonte de verdade deve ser consultada obrigatoriamente antes de qualquer implementação crítica, auditoria de dados, correção manual ou novo bloqueio de integridade relacionado com Master/Split.
- **Modelo atual válido**: quando uma despesa comum é promovida ao **Master**, o sistema cria/atualiza a linha no `event_forecasts` do Master e remove as cópias físicas equivalentes dos subeventos. Portanto, a ausência de linhas-filhas físicas no BP **não é, por si só, erro**.
- **Invariante real do negócio hoje**: o que precisa permanecer íntegro é o vínculo do **Master forecast** com a sua **transação Master** (`event_forecasts.transaction_id`) e o encadeamento das **transações-filhas** nos subeventos via `transactions.parent_transaction_id`.
- **Conclusão operacional**: auditorias de Master/Split não devem exigir `event_forecasts.master_forecast_id` em rateios promovidos ao Master, exceto em fluxos específicos de adoção/manual linkage. Para rateio consolidado, o par obrigatório é: `forecast Master -> transaction Master -> transactions filhas`.
- **Sintoma real confirmado no caso Mágicos Henry&Klaus (Live, 2026-04)**: houve linhas Master com `transaction_id` nulo apesar de existirem transações-filhas corretas nos subeventos. A correção de dados restaurou apenas esse vínculo do Master; não recriou filhos físicos de BP.
- **Uso de `master_forecast_id`**: continua existente no schema e no código para fluxos como adoção de forecasts, órfãs e alguns vínculos manuais, mas **não deve ser tratado como invariante universal** do rateio Master promovido.
- **Regra de segurança**: qualquer proteção no banco deve bloquear somente a perda do `transaction_id` do Master quando já existirem transações-filhas reais; não deve bloquear a lógica atual de filhos virtuais no BP.
- **Regra de atualização contínua**: se a fonte de verdade mudar, a documentação deve ser atualizada antes ou junto da implementação; a mudança não deve ser considerada completa enquanto esta referência não refletir o novo comportamento.

## Fase 2 do rateio — linha de BP por perna (D-ERP73, 16/09/2026)

- **Cada perna do rateio multi-evento leva a linha de BP do SEU evento.** O painel (`src/components/TransactionSplitConfig.tsx`) tem um selector "Linha do BP" por perna, com as linhas daquele evento na rubrica escolhida e o respectivo previsto/disponível. `SplitEntry.forecast_id` é o que desce à filha na gravação — nunca mais a comparação com a linha selecionada no topo do formulário.
- **A mãe do rateio nunca leva `forecast_id`.** É agregado e não consome verba; a verba é consumida pelas filhas, cada uma na sua linha.
- **Perna sem linha nasce `pending`.** O painel não cria linhas de BP: a linha cria-se na APROVAÇÃO (D1), no diálogo "Criar, vincular e aprovar".
- **Verba medida por LINHA quando a perna tem linha escolhida**; sem linha, mantém-se a medição por rubrica (L3).
- **A guarda "Categoria bloqueada para rateio — já existe no BP do Master" passou a AVISO, nunca trava.** A mesma rubrica pode legitimamente ter linha no Master e nas cidades: no Deive, a 2.2.02 Hospedagem tem cinco linhas em três eventos (Master "Rateio dayoffs" 2.000,00; Braga 1.040,09 + 24,00; Lisboa 406,89 + 60,00), todas em uso e todas certas — o que é do circuito vive no Master, o que cada cidade dormiu vive na cidade. A 2.2.03 repete o padrão.
- **A isenção `splitAutoConfigured` caiu.** Era ela que deixava o rateio automático do Master passar por cima da guarda (que existe desde 11/04/2026) — foi por aí que entrou a fatura 113-XP a 04/08/2026. Pergunta fechada.
- **Diálogo a partir de um sub-evento:** a pergunta mantém-se; a resposta mudou. Passa a oferecer "Custo da tour — lançar no Master" (transação única no Master, na linha do Master, com repartição virtual pelas cidades no relatório) em vez de rebentar em rateio pelas cidades.
- **Por fazer (R3):** a trava ainda isenta as filhas por `parent_transaction_id`. Fechar essa isenção (deixando-a só para parcelas, `installment_group_id IS NOT NULL`) só depois de tratadas as 74 pernas antigas sem linha de BP (126.232,99 €), todas vindas do painel/diálogo — nenhuma do `ads-invoice-apply`.

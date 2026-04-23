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

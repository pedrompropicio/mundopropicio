---
name: Master/Split implementation guardrails
description: Guardrails internos para evitar regressões ao mexer em BP Master/Split, rateio, promoção ao Master e auditorias de produção.
type: constraint
---
- **Regra operacional obrigatória**: toda implementação crítica que toque BP, transações, rateio Master/Split, auditoria, triggers, relatórios financeiros ou correções de base deve consultar este material e os documentos críticos relacionados antes de alterar código, queries ou dados.
- **Regra de manutenção obrigatória**: sempre que uma mudança importante alterar comportamento, invariantes, auditoria, trigger, fluxo operacional ou interpretação de dados, a documentação interna correspondente deve ser atualizada na mesma entrega antes da tarefa ser considerada concluída.
- **Não assumir filhos físicos de BP** ao analisar rateio Master/Split. Primeiro confirmar se a funcionalidade em causa usa modelo virtual (promoção ao Master) ou vínculo físico (`master_forecast_id`).
- **Antes de concluir que há bug de dados**, validar no código a regra vigente do fluxo específico: promoção ao Master, adoção de forecast, reforço local, órfãs, relatórios ou reconciliação.
- **Auditoria correta para produção/live** em rateio Master:
  1. o evento Master tem subeventos;
  2. o `event_forecasts` do Master mantém `transaction_id` quando existe rateio real;
  3. a transação Master tem filhas em `transactions.parent_transaction_id` nos subeventos.
- **Auditoria incorreta** para o modelo atual: exigir que toda linha Master tenha linhas-filhas físicas em `event_forecasts` nos subeventos.
- **Qualquer mudança futura de modelo** (de virtual para físico) deve ser tratada explicitamente como migração de regra de negócio, com backfill, revisão de relatórios, revisão de triggers e atualização de memória antes de considerar a mudança concluída.
- **Sempre que um ajuste tocar Master/Split**, rodar checagens em Live para distinguir:
  - `children_exist_but_unlinked` (há estrutura real mas vínculo quebrou)
  - `no_matching_children_found` (não existe par físico — pode ser esperado no modelo virtual)

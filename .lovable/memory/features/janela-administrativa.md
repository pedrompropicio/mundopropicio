---
name: Janela administrativa (trava real, #264)
description: Conta do grupo 10 marcada + data do documento na janela de um evento → a base obriga a esse evento; excepção admin_cost_override com justificação; janelas contíguas; 10.1/10.2/10.3/10.12 bloqueadas
type: feature
---

# Regra (D-ERP150, 30/09/2026) — substitui a absorção virtual no DRE (obsoleta, removida)
Conta L3 do grupo 10 com `allocate_to_active_event` + `transactions.date` dentro da
janela de um evento que absorve (`absorbs_admin_costs`) → a transação TEM de ter
`event_id` = esse evento. Despesa e receita. Trigger `trg_enforce_admin_window_event`
(BEFORE INSERT OR UPDATE OF event_id, category_id, date, company_id, type); UPDATE
que não muda nenhuma destas chaves sai logo → pagar, mudar estado ou valor nunca dispara.

## Data de referência
Sempre `transactions.date` (data do documento), nunca `payment_date`. O evento
decide-se no lançamento e não muda ao pagar.

## Contas bloqueadas
10.1.*, 10.2.*, 10.3.*, 10.12.* nunca podem ser marcadas (`validate_category_allocate_flag`;
ecrã bloqueia com tooltip). As restantes L3 do grupo 10 são configuráveis por empresa
(o IRC, 10.5.03, continua marcado e recebe evento pela janela, para o DRE por evento; mas desde 10/10/2026 não entra no resultado do evento — adenda D-ERP151).

## Janelas
- Início obrigatório; fim NULL = em aberto. Só Master/Single.
- Por empresa, contíguas: ordenadas por início, cada início = fim anterior + 1 dia;
  no máximo uma em aberto e tem de ser a última (`check_admin_windows_contiguous`,
  trigger AFTER em events). Buraco/sobreposição → erro pt-PT com eventos e datas.
- Ligar uma janela depois de outra em aberto fecha a anterior no dia antes (automático).
- `admin_window_event_for(empresa, data)` → evento único (service_role);
  `admin_window_event_lookup` para o ecrã (authenticated, RLS).

## Excepção
Permissão `admin_cost_override` (role_permissions: admin, manager; concedível por
user_permissions). Justificação em `mp.admin_cost_override_reason`, que só vive dentro
da transacção — por isso a RPC `admin_cost_override_write(p_reason, p_row, p_transaction_id)`
faz a própria escrita (INSERT de p_row, ou UPDATE de event_id/forecast_id/category_id/date).
Grava `system_audit_log` action `admin_cost_override`, metadata {evento_da_janela,
evento_escolhido, justificacao}. Sem uid (service_role, crons, edge functions) → sem excepção.

## Resoluções do Pedro (30/09/2026)
1. Sync Coala: sem isenção. A do Coala 2026 fica selada e desligada; a de 2027 grava
   com o evento 2027 e passa.
2. Restauros: sem isenção; transação histórica na janela sem o evento da janela é
   recusada (restauro atómico falha inteiro); resolve-se à mão.
3. Filhas de rateio e parcelas (`parent_transaction_id`) isentas; a regra aplica-se à mãe:
   mãe do grupo 10 sem evento dentro da janela só passa com a excepção.

## Ecrã
- TransactionFormModal: evento pré-preenchido com o da janela; outro/sem evento abre
  `AdminCostOverrideDialog` (justificação; sem permissão só explica); inserts da mãe,
  principal, parcelas-irmãs e pernas passam por `makeTxInsert` → RPC quando há excepção.
- TransactionEditModal: se a edição muda evento/conta/data para fora da janela, pede
  excepção e grava as chaves pela RPC antes do update-transaction (que é service_role).
- EditarEvento: fim em aberto por defeito, mostra janelas da empresa; erros vêm da base.
- Restantes formulários (banco, cartão, camarim, reembolsos…): só a mensagem da base.

## Configuração
Marcar contas e ligar a janela do Coala 2027 = frente 5, só depois disto em produção.

## Mais de um evento na empresa (adenda D-ERP150, 10/10/2026)
100% ao evento que absorve; outro evento da mesma empresa (ex.: Djavan 2027 na Coala) só por `admin_cost_override` com justificação. Sem rateio automático. Configura-se em Editar Evento + Plano de Contas. O Caetano Veloso Porto 2026 é da Mundo Propício, não da Coala.

# P3 — Contratos de pagamento por sócio (congelado)

## Lido
- .lovable/memory/features/cache-payment-contracts.md, .lovable/memory/features/event-settlements.md, docs/INDEX.md
- Live (definições e md5): create_cache_payment_contract (a515c227), update_cache_payment_contract (493e7eb7), _cache_create_contract (f818d3d3), _cache_cancel_contract (6fdeb89e), attach_cache_advance_to_contract (64cf5485), add_cache_contract_advance (e14fb6e8), cache_max_contracts, _cache_assert_actor, delete_transaction_cascade (e167a98a), force_transitory_for_capital_branch (cf9e97d1, trigger trg_force_transitory_capital em transactions), freeze_settlement_participant (24515ee8), unfreeze_settlement_participant (3e92484c)
- Tabelas: cache_payment_contracts (24 col.), cache_payment_contract_cities (11 col.); políticas: só SELECT `company_id = current_company_id() OR is_platform_admin()`, escrita só por RPC
- Rubricas MP: 10.1.03 Distribuição de Resultado a Sócios (b9044828…), 10.1.06 não existe ainda
- Escritores de 10.1.%: só o cliente (TransactionFormModal/EditModal/PaymentModal, src/lib/capital-branch.ts, partner-capital.ts, mirror-partner-account.ts); nenhuma RPC

## Factos verificados
- 0 sócios congelados em Live: a chave de "parte congelada" em frozen_values não pode ser confirmada por dados (decisão 3A deixou o objeto livre). Ver questão 1.
- trg_force_transitory_capital força is_transitory=true em 10.1.* mas grava transitory_reason='aporte_socio' também para 10.1.03 (só 10.1.04 tem motivo próprio). Ver questão 2.
- Cachê: o contrato não tem marca "pago pelo sócio"; o cancelamento só apaga partner_paid_expenses ligadas. Limitação registada; Cachê não muda.
- Selo/fecho: seal_event_settlement não lê contratos; a ordem "congelar → contratos → selar" não é exigida por ninguém. Só passa a importar porque o unfreeze recusará com contratos ativos e a guarda recusa mexer com selo.

## O que descarto do Cachê (e porquê)
- Divisão por cidades, absorvedor de cêntimos, tecto por linha BP 2.1.01, re-ancorar BP: o sócio tem uma só parte por fechamento, sem linha de BP.
- Mãe de retenção para "MINISTÉRIO DAS FINANÇAS - IRS": mantenho só se retenção = Sim (2 transações: saldo ao sócio + retenção ao Estado, ambas 10.1.03 com evento). Sem mães/filhas.
- _cache_event_in_closing (adiantamentos antigos só em fecho): não se aplica; adiantamento livre = transação 10.1.03 do evento, para o fornecedor do sócio, sem contrato.

## Modelo
```text
event_settlement_participants (congelado, settles)
   └─ partner_payment_contracts (≤4 ativos; gross, retenção opcional, vencimento, beneficiário)
         ├─ transação saldo   10.1.03, saída, approved, sem conta, evento, = gross − retenção − adiantamentos
         ├─ transação retenção 10.1.03 (só se Sim)
         └─ adiantamentos ligados (transactions.partner_contract_id)
```
Desenho preparado para P4: coluna `direction` ('out' = 10.1.03 | 'in' = 10.1.06), CHECK só aceita 'out' agora.

## Passos (um «Sim» de cada vez)

### 1 — 0271_p3_partner_contracts_tables
Tabela `partner_payment_contracts`: id, company_id, settlement_id, participant_id, event_id, direction text default 'out' CHECK (='out'), beneficiary_supplier_id, gross numeric(14,2) >0, withholding_applies boolean NOT NULL (sem default — obriga resposta), withholding_rate, withholding_amount, withholding_due_date, due_date NOT NULL, advances_amount default 0, balance_tx_id, withholding_tx_id, label, idempotency_key UNIQUE(company_id,key), created_at/by, cancelled_at/by, cancel_reason, replaced_by.
`ALTER TABLE transactions ADD COLUMN partner_contract_id uuid NULL, partner_contract_role text NULL` (nullable, sem default).
GRANT SELECT a authenticated, ALL a service_role; RLS com SELECT igual ao Cachê; sem políticas de escrita.
Rollback: DROP TABLE + DROP COLUMN ×2 (ficheiro manual, não aplicado).
Live: tabelas/colunas existem, 0 linhas, transactions mesma contagem, md5 das funções acima iguais.

### 2 — 0272_p3_partner_contract_rpcs
- `_partner_contract_share(participant)` → parte congelada (chave da questão 1); erro se ausente.
- `create_partner_payment_contract(_participant_id, _beneficiary, _gross, _wh_applies, _wh_rate, _wh_due, _due, _advance_ids uuid[], _label, _key)`; `update_partner_payment_contract(_contract_id, …)` = cancelar + recriar (replaced_by), como no Cachê; `cancel_partner_payment_contract(_contract_id, _reason)`; `attach_partner_advance_to_contract(_contract_id, _advance_tx_id, _confirm_beneficiary)`; `partner_contract_status(_participant_id)` (leitura para P7: parte, contratado, restante, contratos, adiantamentos livres).
- Regras: admin/manager/manage_bp; current_company_id(); participante congelado + settles; fechamento não selado; ≤4 ativos; Σgross ≤ parte; valor da transação de saldo ≥0 e ≤ saldo do contrato; transações nascem approved, sem financial_account_id, categoria 10.1.03 da empresa, event_id do fechamento, IVA 0.
- Cancelar: cópia de _cache_cancel_contract (mesma verificação de pagamento/lista aprovada, Lixo 30 dias, limpeza de dependências de delete_transaction_cascade, auditoria por transação), sem a parte de BP/cache_payments.
- Auditoria system_audit_log: partner_contract_created / _updated / _cancelled / _advance_attached.
- ACL: REVOKE PUBLIC, anon; GRANT EXECUTE authenticated, service_role.
Rollback: DROP FUNCTION ×6.

### 3 — 0273_p3_partner_contract_guards
Trigger BEFORE INSERT/UPDATE em partner_payment_contracts (fora das RPCs via set_config local) que revalida: congelado, settles, não selado, ≤4, Σ ≤ parte. Trigger em transactions: linha com partner_contract_id não pode mudar valor/categoria/evento fora da RPC (pagar continua livre).
Rollback: DROP TRIGGER ×2 + DROP FUNCTION ×2.

### 4 — 0274_p3_unfreeze_requires_no_contracts
CREATE OR REPLACE de unfreeze_settlement_participant a partir do texto Live (md5 3e92484c confirmado antes), acrescentando só, após "não está congelado":
`IF EXISTS (SELECT 1 FROM partner_payment_contracts WHERE participant_id=_participant_id AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'Sócio com contratos de pagamento ativos: cancele-os primeiro'; END IF;`
Rollback: texto Live atual byte a byte.

## Testes (por passo, PGlite, sem emails/notificações)
src/test/p3-partner-contracts.test.ts: permissões, outra empresa, nominal recusado, não congelado recusado, selado recusado, 5.º contrato recusado, soma > parte, € e % (2 casas), retenção sem resposta recusada, transações 10.1.03 approved sem conta e is_transitory=true, cancelar com pagamento/lista aprovada recusado, cancelar vai para Lixo, adiantamento indivisível e saldo negativo recusado, unfreeze recusado com contratos, auditoria. Teste de invariância: resultado/partes Anitta (418.598,65 / 59.799,81 / 760.576,69) iguais com contratos criados. Vitest completo + tsgo.

## Verificação Live (só leitura, cada passo)
Estrutura, prosecdef/proconfig/proacl, md5 das funções existentes, contagens de transactions e participantes iguais, 0 contratos.

## Fica por aplicar / P7 precisa de ler
- Fica: P4 (10.1.06 + direction 'in'), P7 (ecrã), confirmação Anitta só depois de congelar via ecrã.
- P7 lê: partner_contract_status, partner_payment_contracts, transactions.partner_contract_id/role, chave de parte em frozen_values (tem de a gravar no congelar).

## Questões em aberto
1. Chave da parte congelada em frozen_values (não há dados): A) fixar `frozen_values->>'share_amount'` e a RPC recusa se faltar; P7 grava-a (RECOMENDADA) B) recalcular a parte no servidor.
2. 10.1.03 fica com transitory_reason 'aporte_socio' pelo trigger: A) aceitar agora e corrigir no P4 (RECOMENDADA) B) passo extra que dá motivo próprio a 10.1.03.
3. Retenção: A) 2 transações (sócio + Finanças), ambas 10.1.03 (RECOMENDADA) B) retenção em 10.1.03 só no sócio, Finanças à parte.
4. OK para o passo 1?

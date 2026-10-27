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

### 2 — 0272_p3_transitory_reason_10_1_03 (APLICADO e verificado pelo Pedro)
- Uma transação BEGIN/COMMIT: primeiro DROP/ADD do CHECK transactions_transitory_reason_domain com os oito valores Live + distribuicao_resultado; depois CREATE OR REPLACE da função Live, acrescentando apenas o ramo 10.1.03. Não tocar no CHECK required, sem backfill.
- Rollback comentado atómico: função Live cf9e97d154a437ea66139ce0b04873ed byte a byte e CHECK original de oito valores. Se houver motivos novos, o rollback falha inteiro sem alterar dados.
- P7: acrescentar etiqueta em src/lib/transitory-reason.ts e opção derivada no seletor TransactionEditModal; limitação visual mantida até essa fase.
- Verificação 23:18 UTC: modal inicializa o motivo armazenado sem normalização e reenvia-o nos dois ramos de gravação. Live issue335_guard compara NEW/OLD.transitory_reason em documentos de encontros ativos: valor igual passa nessa comparação; alteração recusa com reverse_entire_group. A função derivadora só recalcula no INSERT ou na mudança de category_id; editar a mesma rubrica preserva o valor reenviado. Nenhum ecrã/guarda alterado.
- PGlite local: 13/13, CHECK real estendido, oito motivos preservados, required intacto, edição com mesma rubrica, rollback byte-idêntico e rollback recusado atomicamente quando já existem motivos novos.
- 0272 aplicado: CHECK de nove valores e função md5 4ad969384f310b6464c010064f89d3ff; passos 3–5 dependem de novo Sim específico.

### 3 — RPCs de contratos (0273 PREPARADO, NÃO aplicado)
- `_partner_contract_share(participant)` → parte congelada (chave da questão 1); erro se ausente.
- `create_partner_payment_contract(_participant_id, _beneficiary, _gross, _wh_applies, _wh_rate, _wh_due, _due, _advance_ids uuid[], _label, _key)`; `update_partner_payment_contract(_contract_id, …)` = cancelar + recriar (replaced_by), como no Cachê; `cancel_partner_payment_contract(_contract_id, _reason)`; `attach_partner_advance_to_contract(_contract_id, _advance_tx_id, _confirm_beneficiary)`; `partner_contract_status(_participant_id)` (leitura para P7: parte, contratado, restante, contratos, adiantamentos livres).
- Regras: admin/manager/manage_bp; current_company_id(); participante congelado + settles; fechamento não selado; ≤4 ativos; Σgross ≤ parte; valor da transação de saldo ≥0 e ≤ saldo do contrato; transações nascem approved, sem financial_account_id, categoria 10.1.03 da empresa, event_id do fechamento, IVA 0.
- Cancelar: cópia de _cache_cancel_contract (mesma verificação de pagamento/lista aprovada, Lixo 30 dias, limpeza de dependências de delete_transaction_cascade, auditoria por transação), sem a parte de BP/cache_payments.
- Auditoria system_audit_log: partner_contract_created / _updated / _cancelled / _advance_attached.
- ACL: REVOKE PUBLIC, anon; GRANT EXECUTE authenticated, service_role.
Rollback comentado: DROP FUNCTION ×8, sem CASCADE, sem eliminar dados.
- Nomes completos confirmados pelo Pedro às 23:45; sem aliases. SQL manual sem BEGIN/COMMIT; aplicação futura numa transação gerida pela ferramenta.
- Três helpers privados (parte/autorização/locks, recusa de pagamento/conciliação/encontro, elegibilidade de adiantamento) e cinco RPCs públicas; helpers sem EXECUTE externo.
- Atualizar segue cancelar + recriar com os parâmetros permitidos, incluindo a lista explícita de adiantamentos; os não reescolhidos ficam livres (igual ao Cachê). Não altera identidade do sócio/empresa/evento nem o bruto anterior.
- Soma de pago inclui pagamentos efetivos das três roles, incluindo adiantamentos pagos uma única vez; ligação por si não conta como pagamento. Adiantamentos já pagos podem ser ligados (Cachê), mas cancelamento/alteração recusam se qualquer transação do contrato tiver pagamento, inclusive adiantamento.
- Saldo inicial zero não gera transação; attach que esgota exatamente o saldo conserva linha de saldo zero (limite >=0), sem apagar documentos fora do cancelamento. Retenção arredondada a zero não gera transação de zero, como no Cachê.
- Idempotência compara parâmetros e lista canónica de adiantamentos; chave de contrato cancelado ou payload diferente recusa sem efeitos. Após alterar as ligações, repetir o pedido original de criação já não é idêntico.
- Cancelamento copia Lixo 30d/auditoria/limpeza, mas não chama delete_transaction_cascade (essa RPC não aceita manage_bp sozinho e pode ampliar grupo-fatura). Limpa as duas FK e marcas antes de DELETE; dependências inesperadas em BP/bilheteira, filhos/grupo de fatura ou root de outro contrato recusam. Não apaga provas de encontros, mesmo revertidos; issue335_guard inalterado.
- Testes locais PGlite: 45/45 no 0273; 68/68 nos passos 1–3. Harness focado com 0271/0272 reais e dependências restritivas; não é cópia integral dos triggers/RLS Live nem prova de concorrência multi-sessão. Guardas diretas/unfreeze permanecem nos passos 4/5; guarda de selo só com P7.

### 4 — Guardas de contratos (passo por preparar)
Trigger BEFORE INSERT/UPDATE em partner_payment_contracts (fora das RPCs via set_config local) que revalida: congelado, settles, não selado, ≤4, Σ ≤ parte. Trigger em transactions: linha com partner_contract_id não pode mudar valor/categoria/evento fora da RPC (pagar continua livre).
Rollback: DROP TRIGGER ×2 + DROP FUNCTION ×2.

### 5 — Unfreeze sem contratos (passo por preparar)
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

## Decisões do Pedro (26/10, 22:51 UTC)
1. A — parte = `frozen_values->>'share_amount'`; a RPC recusa se faltar. O P7 tem de a gravar no congelar. Limitação: o congelar recebe valores do cliente (como no Cachê); não há recálculo no servidor (motor em TS; get_partner_settlement_summary depende de auth.uid).
2. B — 10.1.03 ganha motivo próprio ('distribuicao_resultado') em force_transitory_for_capital_branch antes de existir qualquer contrato (10.1.03 tem 0 transações; sem backfill). Antes do SQL: verificar CHECK/enum em transactions.transitory_reason, leitores em src/ e supabase/functions/, md5 Live (cf9e97d1).
3. A — duas transações (sócio + Finanças), ambas 10.1.03, só com retenção = Sim. Classificação co-produção vs cachê por decidir pelo Pedro: pergunta Sim/Não sem pré-seleção, nenhuma retenção assumida.
4. Ordem nova: 1 tabelas (0271); 2 motivo 10.1.03; 3 RPCs; 4 guardas; 5 unfreeze. SQL completo de cada passo mostrado antes de qualquer aplicação.
Estado: passos 1/2 aplicados e verificados pelo Pedro em Live; passo 3 preparado, NÃO aplicado; passos 4/5 por preparar/aplicar.

## Correção passo 1 (22:55 UTC)
- 0271 faz REVOKE ALL FROM PUBLIC, anon, authenticated antes dos GRANT (Live tem default privileges arwdDxtm). ACL esperada: authenticated=r, service_role=arwdDxtm, postgres (dono), sem anon. Teste simula default privileges.
## Notas para o passo 3/4 (Pedro)
- Cancelar (cópia de _cache_cancel_contract) limpa balance_tx_id/withholding_tx_id e transactions.partner_contract_id antes de apagar as transações.
- Trigger do passo 4 recusa DELETE direto de transação com partner_contract_id fora da RPC; dizer como delete_transaction_cascade é tratado e confirmar que não falha pelas FK.

## P7a — modal Sócios (27/10/2026, R1, implementado, não publicado)
- Decisões do Pedro: 1A botão «Pagamento do sócio» por linha settles na aba Sócios → diálogo padrão Cachê; 2B sem mockup (Pedro revê no preview); 3A share_amount = share do motor (2 casas) + share, share_net, effective_pct, paid_by_partner, extras, settlement_amount, uses_gross_expenses, settlement_id.
- Código: src/lib/partner-contracts.ts (valores do motor, validação local, erros pt-PT, chamadas RPC), src/components/PartnerPaymentDialog.tsx, EventPartnersTab (botão), TransactionRow (marca «Contrato sócio», sem Eliminar), TransactionEditModal (aviso + bloqueio local de valor/rubrica/fornecedor/evento; motivo distribuicao_resultado mostrado só leitura e reenviado tal qual), transitory-reason.ts (etiqueta).
- Limitação documentada no ecrã e no código: o servidor aceita o share_amount enviado pelo cliente.
- Fora: P2, P4 (10.1.06), P5, guarda do selo.

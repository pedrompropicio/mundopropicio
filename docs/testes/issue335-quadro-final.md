# #335 — Quadro final da fase LOCAL/INERTE (22/10/2026)

HEAD verificado: bb0e645a2d0cf9f8a103c037a0f3e38a10aafcd7. Só leitura, execução local e documentação. Nenhum SQL inerte, teste, código, migration, Live, instalação ou Publish alterado.

## 1. Execução final (estado actual do repo)
- Harness fiel PG 17.6 + pgvector (nixos-25.05 `postgresql_17.withPackages pgvector`): 15529 statements, 0 falhas; diferencial UNEXPLAINED 0.
- Suite phase2h-run.sh + phase2h-suite.sh, baseline E dedicado (catálogo+refdata 0 erros+fixtures): **22/22 PASS, exit 0**. 18 WARNING (Coala supplier_id legado).
- Runner E: status FECHADO, 202 linhas, 0 findings, 0 skips.
- Rollback integral 14 pares (phase2l-rollback.py, catálogo limpo): exit 0, differences={}, before=after SHA-256 474947e27e3cf0c0d328ccc6e76c2fbb6d915e781ddc9ccb43de36325a2af1a1.
- Vitest completo (--maxWorkers=2): 222 ficheiros PASS / 2 skip; 1986 PASS / 6 skip / 11 todo; exit 0.
- tsgo --noEmit: exit 0.
- Clusters efémeros desligados e removidos.
Nota: PASS de phase2n-context e phase2n-low são de EXECUÇÃO; item3 (trigger do owner) e TRUNCATE ficam OPEN dentro do próprio runner (phase2n-context.py:204-229; phase2n-low.py:231-242).

## 2. CI/SHA
NÃO VERIFICADO. O remoto git deste ambiente é o armazenamento interno da Lovable, não o GitHub; a API GitHub devolveu "Not Found" para o SHA. Não consigo provar um run verde num SHA que contenha 2n, blocos 7/7b/7c/8 e src/lib/offset-plan/ (HEAD contém os 2 ficheiros offset-plan).

## 3. Passos A, B, C
A definição textual exacta de A/B/C não foi encontrada nos documentos lidos (só referências "A–C"). Mapeamento INFERIDO da ordem da suite (phase2h-suite.sh:12) e das dependências; Pedro deve confirmar:
- A = storage (offset_group_storage) — tabelas, colunas, índices não concorrentes, control.
- B = core + approval + status — executor, guardas, RPCs, aprovação/estado no estorno.
- C = invariants + balance + cash_position + cash_position_invariant (+ restore) — fórmulas de saldo/caixa e invariantes.
Kill-switch/emergency/reactivation são operações (UPDATE do control), trigger_watch/cash_watch são detectores; todos com "Sim" separado, nunca embutidos em A–C.

## 4. Candidatos
Prefixo: supabase/manual/20261021_issue335_. Prova Live só com BEGIN…ROLLBACK (D/E): comportamento contra catálogo/dados reais, tempos de lock, triggers não capturados.

| Candidato | Ficheiro | Muda em Live | Rollback | Risco | Pré-requisitos / ordem | Só em Live (D/E) | Pronto |
|---|---|---|---|---|---|---|---|
| storage | offset_group_storage | 3 tabelas, colunas/FK em pagamentos/extracto, 3 índices, control (enabled/reverse true) (:4-93) | remove tudo; recusa com grupos ou core/invariantes (RB:4-10) | locks ShareLock/AccessExclusive no mesmo BEGIN; lock_timeout 5s não limita duração | 1.º | tempo de lock real | não |
| core | offset_core | executor NOLOGIN, contexto, guardas em 7 tabelas, 5 funções legadas adaptadas, RPCs (:5-1154) | restaura funções/ACL; exige sem histórico e approval/status/invariants retirados (RB:4-29) | owner-trigger OPEN | 2.º, após storage | writers/triggers não capturados | não |
| approval | offset_approval | enforce_transaction_approval_permission com marcador issue335-approval-v2l (:19) | restaura corpo; **sem guarda groups_exist** (RB:1-18) | rollback com histórico deixa estornos approved recusados (core:399-402) | após core (suite) — runners 2j/2k/2l instalam-no depois de invariants/balance | BP/verba reais | não |
| status | status | _derive_paid_amount com marcador issue335-status-v2l (:17) | recusa histórico (RB:4) | — | exige approval (:4-7) | — | não |
| saldo | offset_balance | _account_true_balance_raw/asof_raw sem compensação como caixa (:4-114) | recusa histórico (RB:4) | o mais alto (Bloco 8 §6.1) | após storage; cash_watch tem de sair antes do rollback (sem guarda) | saldos reais por conta | não |
| invariantes | offset_invariants | 5 contadores + runner extra (:4-287) | recusa grupos; apaga 5 nomes mesmo se pré-existentes (RB:266) | — | após storage | — | não |
| restauro | restore | restore_apply_from_shadow com fence (:37-62) | recusa grupos (RB:4) | control não restaurável (decisão) | após storage | — | não |
| caixa | cash_position + cash_position_invariant | get_event_cash_position por pernas; invariante via saldo canónico | **sem guarda de histórico** em ambos (RB:1-18) | instalar/retirar os dois juntos (Bloco 8 §6.3) | após balance | posição real por evento | não |
| kill-switch | offset_kill_switch | N0→N1 (:9-20) | N1→N0 | — | após storage | — | sim tecnicamente, depende de A |
| emergency | emergency | N0/N1→N2 | volta sempre a N1, não à origem | — | após storage | — | idem |
| reactivation | reactivation | N1/N2→N0 | volta sempre a N2 | — | após storage | — | idem |
| trigger_watch | trigger_watch | função detectora, service_role (:12-105) | drop função | não detecta substituição de corpo nem ausência; não cobre bank_statement_lines nem issue335_commands | após storage+core | allowlist vs Live | não (cobertura) |
| cash_watch | cash_watch | vigia + substitui contador de saldo (:8-77) | restaura contador | — | exige balance (:8-10) | extracto real | não |

**Pronto para pedir A–C: NÃO.** Motivos: owner-trigger OPEN (phase2n-context.py:170-218); guardas de rollback em falta (approval, cash_position, cash_position_invariant, balance sem guarda para cash_watch, storage não enumera todos os consumidores); ordem de approval diferente entre suite e runners de rollback; decisões do Bloco 8 por tomar; CI não verificado.

## 5. Inconsistências encontradas (registadas, não corrigidas)
1. Approval rollback sem groups_exist_keep_guards — offset_approval.ROLLBACK-INERTE.sql:1-18.
2. Storage rollback só verifica issue335_dispatch/issue335_invariant_counts — RB:4; balance/cash_watch/cash_position/restore também consomem.
3. cash_position(+invariant) rollback sem guarda de histórico — RB:1-18 de ambos.
4. Core rollback restaura também reverse_transaction de 4 args que o instalador não substitui — core RB:478-497.
5. Storage/invariantes não são restauração exacta de objectos homónimos pré-existentes (IF NOT EXISTS / ON CONFLICT DO NOTHING).
6. Ordem de approval: suite storage→core→approval→invariants→balance (phase2h-suite.sh:12) vs 2l storage→core→invariants→balance→cash_watch→approval→status (phase2l-rollback.py:31-40).
7. Tolerâncias nos runners: phase2f-diff.py não falha em diferenças (:30-39); refdata ON_ERROR_STOP=0 (phase2h-suite.sh:8-9; 0 erros nesta corrida); phase2j-concurrency.py:53-61 aceita qualquer não-ok; phase2g-approval.sql:117 aceita erros amplos; phase2j.sql:113,146 tem skip; mensagens "42501" com asserção P0001 (phase2f-concurrency.py:87-104).
8. Portas fixas 55445 (phase2f-run.sh) e 55446 (phase2h-run.sh).
9. Pré-requisitos externos não definidos nestes ficheiros (is_platform_admin overloads, has_permission, bp_tx_link_allowed, restore_shadow…), só verificáveis no catálogo alvo.

## 6. Lacunas abertas conhecidas
(a) Trigger legado coala_capture_forecast_category_change em event_forecasts referencia NEW.supplier_id (inexistente); 18 WARNING nesta suite; fora do #335 (relatório :99, bloco 6b).
(b) TRUNCATE concedido a anon/authenticated em public.user_permissions; endurecimento ACL separado, R2 (relatório :6785; phase2n-low.py:231-242).
(c) Bloco 8: semântica dos invariantes (dinheiro vs dívida liquidada); apresentação no extracto da receita com compensação; mudanças de cliente antes do Publish por ordem de risco (issue335-bloco8-consumidores.md §6, :120-150).
(d) Corpos de launch_from_bank_lines e reconcile_bank_line não lidos integralmente no Bloco 8 (bloco8:157-158).
(e) Janela de índices sem CONCURRENTLY: ShareLock/AccessExclusive no mesmo BEGIN; tempo Live não medido (relatório :6809-6817).
(f) 352 documentos históricos com contas inconsistentes (347 sem conta + 5 diferente; relatório :747); recomendação O1: recusa + lista de verificação.
(g) CI remoto NÃO VERIFICADO (secção 2).

## 7. Manifesto de leitura (releitura integral por subagentes read-only)
SQL: subagente 1 leu INTEGRAL os 28 ficheiros. Runners: subagente 2 leu INTEGRAL os 22 phase2*.py/sh. NÃO LIDO nesta tarefa: restantes ficheiros de supabase/tests/issue335 (*.sql não phase2*, live/, local/, matching-parity.ts), corpos Live.

| Ficheiro | Linhas | SHA-256 (16) |
|---|---|---|
| 20261021_issue335_cash_position.INERTE.sql | 1–122 | f8d2a606bec31459 |
| 20261021_issue335_cash_position.ROLLBACK-INERTE.sql | 1–103 | a759ae73980248a5 |
| 20261021_issue335_cash_position_invariant.INERTE.sql | 1–47 | db193f05986942aa |
| 20261021_issue335_cash_position_invariant.ROLLBACK-INERTE.sql | 1–66 | 331e0837fc4f9146 |
| 20261021_issue335_cash_watch.INERTE.sql | 1–78 | 95f232a25035cd34 |
| 20261021_issue335_cash_watch.ROLLBACK-INERTE.sql | 1–13 | 27f4c3926bdb03c4 |
| 20261021_issue335_emergency.INERTE.sql | 1–22 | 4c3b47c673e494b7 |
| 20261021_issue335_emergency.ROLLBACK-INERTE.sql | 1–22 | e4ba44f7fddd8abe |
| 20261021_issue335_offset_approval.INERTE.sql | 1–160 | 94fd0c26f78d1585 |
| 20261021_issue335_offset_approval.ROLLBACK-INERTE.sql | 1–134 | 5829c312ab4ce7fe |
| 20261021_issue335_offset_balance.INERTE.sql | 1–126 | a49011d6a85a4a62 |
| 20261021_issue335_offset_balance.ROLLBACK-INERTE.sql | 1–79 | 43cb5689df512887 |
| 20261021_issue335_offset_core.INERTE.sql | 1–1155 | 049a4b0ae2c50b37 |
| 20261021_issue335_offset_core.ROLLBACK-INERTE.sql | 1–714 | 9371b4a265c5b4a5 |
| 20261021_issue335_offset_group_storage.INERTE.sql | 1–94 | bfda3c14feb229c9 |
| 20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql | 1–11 | 3caeb7b7583c74cf |
| 20261021_issue335_offset_invariants.INERTE.sql | 1–287 | 1e3bae7e62d80c11 |
| 20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql | 1–267 | edd924cd48d53781 |
| 20261021_issue335_offset_kill_switch.INERTE.sql | 1–22 | 9c8fd282dc88374a |
| 20261021_issue335_offset_kill_switch.ROLLBACK-INERTE.sql | 1–22 | b4b6b67b8cddfc68 |
| 20261021_issue335_reactivation.INERTE.sql | 1–22 | b87f66a1756753b8 |
| 20261021_issue335_reactivation.ROLLBACK-INERTE.sql | 1–22 | c797ae31d7d0f744 |
| 20261021_issue335_restore.INERTE.sql | 1–150 | 178aab7afb71a755 |
| 20261021_issue335_restore.ROLLBACK-INERTE.sql | 1–138 | 0ef666d760bdc721 |
| 20261021_issue335_status.INERTE.sql | 1–54 | 9b9b752b7aa90788 |
| 20261021_issue335_status.ROLLBACK-INERTE.sql | 1–51 | 64f7931d4019e4cc |
| 20261021_issue335_trigger_watch.INERTE.sql | 1–106 | 1c89968556c1e73d |
| 20261021_issue335_trigger_watch.ROLLBACK-INERTE.sql | 1–5 | 530f9d84145670ff |
| phase2f-concurrency.py | 1–134 | 3504c09fadba161c |
| phase2f-diff.py | 1–39 | 2a5cb35ef43f1f0c |
| phase2h-adapt.py | 1–64 | a7ad624d1dc94ebe |
| phase2h-diff.py | 1–68 | 00a54da88556b6dc |
| phase2h-install.py | 1–135 | 01e1dc9641e84163 |
| phase2i-reference-data.py | 1–36 | 2114a58c0bcd11f1 |
| phase2j-concurrency.py | 1–124 | 54f4c8939a5fa166 |
| phase2k-rollback.py | 1–49 | e46d84765be63ba6 |
| phase2l-rollback.py | 1–49 | b6d4492763f665b5 |
| phase2m-context.py | 1–115 | 29986a0ab18acd23 |
| phase2n-cashwatch.py | 1–256 | 0c2f3c472c22f869 |
| phase2n-columns.py | 1–477 | 966e50ae7db9e19d |
| phase2n-context.py | 1–229 | 67c31a48bcd38ee3 |
| phase2n-killswitch.py | 1–302 | 154885e6220b3bca |
| phase2n-locks.py | 1–245 | 05c8fde50b5ecc0a |
| phase2n-low.py | 1–333 | 11ca105c9c6fee52 |
| phase2n-status.py | 1–333 | 8fa8f93c1e9504e6 |
| phase2n-trigger-watch.py | 1–180 | bc6ab04d473db598 |
| phase2f-run.sh | 1–24 | 1b249dbec4388d25 |
| phase2h-run.sh | 1–23 | 65299cf90cf0e194 |
| phase2h-suite.sh | 1–65 | 659450866ed1959b |
| phase2j-rollback.sh | 1–23 | c9b7910eb4b4642b |

# Issue #346 — Ligar adiantamento livre a contrato existente (passo a, R2)

23/10/2026 · executor 7 · Fecho e Sócios · autorizado pelo Pedro ("Sim"). Só base de dados; sem src/, sem DML de dados, sem Publish.

## Lido antes
Corpos em Live (pg_get_functiondef): `_cache_alloc`, `_cache_cities` (→ `_cache_cities_x`), `add_cache_contract_advance`, `update_cache_payment_contract`, `_cache_cancel_contract`, `cache_contract_context`, `_cache_create_contract`, `_cache_free_advances(_x)`, `_cache_assert_actor`, `_run_invariant_checks_cache_contracts`.

## Ficheiros
- `drizzle/migrations/0237_cache_attach_advance_to_contract.sql` (aplicada).
- `supabase/manual/rollback_0237.sql` (não aplicado; corpos de Live de `_run_invariant_checks_cache_contracts` e `cache_contract_context` byte a byte).

## O que a 0237 faz
- `attach_cache_advance_to_contract(p_contract_id, p_advance_tx_id, p_confirm_beneficiary DEFAULT false)`: SECURITY DEFINER, `search_path=public`, `_cache_assert_actor`, empresa ativa, lock `cache:<raiz>:<artista>`. Idempotente (`already_attached`). Recusas: `contrato_inexistente`, `adiantamento_inexistente`, `empresa_diferente`, `contrato_cancelado`, `adiantamento_ja_associado`, `adiantamento_estornado`, `adiantamento_invalido`, `sem_mae_saldo`, `beneficiario_diferente` (com os dois nomes), `saldo_em_lista` (filha ou mãe de saldo em qualquer lista não rejeitada — decisão do Pedro), `cidade_fora_do_contrato`, `saldo_negativo`, `saldo_abaixo_do_pago`.
- Muda: filha de saldo da cidade e mãe de saldo (−valor; percentagens das filhas recalculadas), `cache_payment_contract_cities.advances/artist_balance`, `cache_payment_contracts.advances_amount`, papel do adiantamento (`cache_contract_id`, `cache_role='advance'`). Não muda `transaction_payments`, retenção, quotas, bruto, âncoras de BP (salvo filha zerada, re-ancorada como na 0217). Auditoria `cache_advance_attached` em `system_audit_log`.
- `cache_contract_context`: `free_advances` passa a ter `supplier_id` e `supplier_name` (para o ecrã do passo b).
- Invariante nova `cache_cidade_teto_excedido` (referência 0).
- ACL: REVOKE PUBLIC/anon; GRANT authenticated, service_role.

## Prova em Live (uma transação terminada por exceção → anulada)
| | Antes | Depois |
|---|---|---|
| Filha saldo Lisboa a6f0f847 | 28.272,01 (44,3483%) | 18.272,01 (33,9944%) |
| Mãe saldo a6d6199d | 63.750,00 | 53.750,00 |
| Filha saldo Porto 30c6d752 | 35.477,99 (55,6517%) | 35.477,99 (66,0056%) |
| Retenção b3fa1e9f / 0218de50 / c9d8a573 | 21.250,00 / 9.424,01 / 11.825,99 | iguais |
| Cidade Lisboa adv / saldo | 0 / 28.272,01 | 10.000,00 / 18.272,01 |
| Contrato advances_amount | 0 | 10.000,00 |
| 204d17ca | sem contrato, sem papel, pago | contrato 1, `advance`, pago |
| transaction_payments (total / do adiantamento) | 1471 / 1 | 1471 / 1 |
| Âncoras BP Lisboa / Porto | 204d17ca / 30c6d752 | iguais |
| Restante por contratar | 60.420,19 | **70.420,19** |
| Invariantes do cachê (4) | 0 | 0 |
| Hash dos outros contratos | 397b476a… | 397b476a… (igual) |

- Sem confirmação: `beneficiario_diferente: beneficiário do contrato SIMONE MENDES ≠ fornecedor do adiantamento HENZA MUSIC GRAVAÇÕES E EDIÇÕES MUSICAIS LTDA.`
- Segunda chamada: `already_attached: true`, nada mudou.
- Auditoria: 1 linha.
- Invariante nova hoje em Live (sem ligação): 0 casos em 2 cachês com contratos → referência 0.

## Verificação depois de aplicar
- Função existe, SECURITY DEFINER, `search_path=public`; EXECUTE anon=false, authenticated=true, service_role=true.
- `cache_cidade_teto_excedido` em `system_invariants`; `_run_invariant_checks_cache_contracts` corre: 4 verificações, todas 0.
- 204d17ca continua livre (sem contrato, sem papel); contrato 1 igual (advances 0, mãe a6d6199d, valores 63.750 / 28.272,01 / 35.477,99 / 21.250 / 9.424,01 / 11.825,99).

## Seguinte
Passo b (ecrã) e passo c (ligação real e verificação) — cada um com "Sim" próprio.

---

# Passo b — ecrã (23/10/2026)

Sem DDL, sem DML, sem Publish; migração 0237 intacta. Partida fce7826.

## Ficheiros
- `src/lib/cache-contracts.ts` — puros: `previewAttachAdvance`, `needsBeneficiaryConfirmation`, `cityCapCheck`, `ATTACH_PROBLEM_TEXT`; mapa de erros alargado (beneficiario_diferente, saldo_em_lista, adiantamento_*, contrato_*, teto_cidade_excedido com as duas saídas); `cacheErrorMessage` aceita códigos sem texto.
- `src/hooks/useCacheContractContext.ts` — `supplier_id`/`supplier_name` nos adiantamentos livres.
- `src/components/CacheContractsPanel.tsx` — botão "Ligar adiantamento" no cartão de cada contrato (só com adiantamentos livres); diálogo `AttachAdvanceDialog` (lista com descrição, data, cidade, fornecedor, valor, pago/por pagar; prévia saldo antes→depois e adiantamentos antes→depois; recusas em linha com botão desligado; aviso e caixa de beneficiário; toast "Já estava ligado"); aviso de teto no `ContractDialog` com as duas saídas e "Criar contrato" desligado. Depois do sucesso: `useInvalidateCacheContracts` (contexto do cachê + transações + `invalidateEventFinancials`).
- `src/lib/__tests__/cache-attach-advance.test.ts` — 12 testes.

## Testes
- Novos: 12/12 (prévia Lisboa 28.272,01→18.272,01 e adiantamentos 0→10.000; recusas saldo negativo / abaixo do pago / em lista; confirmação SIMONE MENDES × HENZA; aviso 60.420,19 → Lisboa 74.491,32 > 68.926,15, espaço livre 21.230,13; depois de ligado restante 70.420,19 sem aviso; mapa de erros).
- Suite: antes (fce7826) 2224 passam, 6 ignorados, 11 por fazer; depois 2236 passam, 6 ignorados, 11 por fazer. tsgo limpo.
- A barreira dos 1.000 registos apanhou as leituras novas sem limite; corrigido com `.limit()`.
- Limite: os testes cobrem as regras puras, não o diálogo renderizado nem a RPC em Live. CI remoto não verificado.

## Passo c (por autorizar)
Depois do Publish: no Pagamento do cachê da Turnê Simone Mendes 2026, contrato 1 → "Ligar adiantamento" → HENZA 10.000,00 → marcar a confirmação → ver Lisboa 18.272,01; "Novo contrato" mostra restante 70.420,19 sem aviso.

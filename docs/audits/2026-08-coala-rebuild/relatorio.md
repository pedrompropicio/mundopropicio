# Coala PT 2026 — Rebuild completo do espelho

Data: 2026-08 · Evento `5a1da5fb-3115-4ae3-af50-15ce1f869a5c` · config `c4d00d98-3c71-455a-a5fc-244b13b58f65`

## 1. Pré-verificação de dependências (LIMPA — nada bloqueou)
Zero registos em: `payment_list_items`, `transaction_documents`, `event_cache_payments`,
`supplier_credit_usages`, refs de camarim / cartão / reembolso, para as TX de despesa do evento.
Patrocínios/receitas: 16 forecasts + 16 TX ligadas a `sponsorship_pipeline` → protegidos (`fc_prot=t`, `tx_prot=t`).
Módulo A&B: intocado (8 linhas A&B excluídas do parse).

Snapshot pré-rebuild:
- forecasts despesa activos: 333 (net 1.289.297,08 €)
- forecasts receita: 16 (net 340.375,00 €)
- TX despesa (pagas): 143 (net 773.375,74 €)
- TX receita (approved): 16 (net 340.375,00 €)

## 2/3. Apagar + regenerar
`sync-coala-from-drive` mode=apply (download read-only do Drive, modo replace) — run `6010448c-3934-4c68-b7f8-90683b4b5ace`:
- deletedForecasts 349 · deletedTransactions 143
- forecastsCreated 355 · transactionsCreated 327 (326 pagas + 1 saldo pendente) · suppliersCreated 66

## 4. Reset do estado do sync
`coala-sync-bootstrap`: 355 row_state reancorados — 339 exact, 16 ambíguos (duplicados no ficheiro).

## 5. Relatório de reconciliação

| Métrica | Ficheiro (Drive, hoje) | Sistema | Δ |
|---|---:|---:|---:|
| Linhas totais Base Custos c/ valor > 0 | 363 | — | — |
| Excluídas A&B | 8 | — | — |
| Linhas importáveis (BP) | **355** | **355** | **0** |
| Σ Net BP | **1.251.836,05 €** | **1.251.836,05 €** | **0,00** |
| Σ IVA | 129.170,66 € | — | — |
| Linhas "Pago" (+1 parcial com pagamento) | 325 (+1) | **326 TX pagas** | **0** |
| Contas a pagar (25 pending + 4 parciais s/ pagamento) | 29 | **29** | **0** |
| Linhas "Pago BR" → MANDO (COALA BR) | 12 | 12 | 0 |

Compare pós-rebuild (`apply-coala-bp` phase=compare):
`missingInBp=0 · extraInBp=0 · valueMismatches=0 · renameOnly=0 · txMissing=0 · staleAnchors=0`

## Divergências residuais (todas explicadas — nenhuma é erro de dados)
1. **86.203,70 €** entre `Σ Valor Pago` do ficheiro (1.224.052,01 €) e o bruto pago no sistema:
   35 linhas marcadas "Pago" têm *Valor Pago s/IVA* / *Valor IVA* vazios ou inferiores ao bruto.
   A regra vigente gera a TX paga pelo bruto da linha. Bruto-a-bruto: ficheiro 1.309.890,29 € vs sistema 1.310.255,70 €
   (Δ 365,41 € = parcela paga da única linha parcial). Não foi inventada regra nova.
2. **8 pares ambíguos** (`needs_manual_link`): descrição + valor duplicados no ficheiro — delta 0 €.
   Estrados Bandas · Estruturas Eléctricas (×2) · Consultoria Carbono · Staffs Posso Ajudar ·
   Assistência médica · Hostess Conferência · Filiado Associação.
3. **"Armazem Coala - Orange 2ºbox"** 3.492,72 € gerado como 297,07 € + saldo 3.195,65 € (split do gerador; soma bate).
4. **Patrocínios** (1 missing / 2 extra / 9 mismatch): fora do escopo do sync/rebuild — vivem no `sponsorship_pipeline`.

## Constraints respeitadas
- Drive **só leitura** (export/download); nenhuma escrita.
- Nenhum outro evento tocado; receitas/patrocínios e A&B preservados.

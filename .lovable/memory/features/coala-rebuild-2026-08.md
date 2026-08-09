---
name: Coala PT 2026 — rebuild completo do espelho (2026-08)
description: Rebuild total do BP+TX da Coala Festival Portugal 2026 a partir do XLSX do Drive; substitui a conciliação v13 pendente e define o estado de referência do sync
type: feature
---

# Coala PT 2026 — rebuild do espelho (autorizado pelo Pedro)

Evento: `5a1da5fb-3115-4ae3-af50-15ce1f869a5c` · config sync `c4d00d98-3c71-455a-a5fc-244b13b58f65`.

## Porquê
O ERP nunca foi operado manualmente neste evento (100% espelho do sync) e desde o único apply (28/05) os dry-runs acumulavam needs_review (51 value mismatches, 13 missing / 11 extra no BP, 184 TX pagas em falta). Decisão: apagar e regenerar tudo a partir da planilha.

## Pré-verificação (limpa)
Zero dependências não-recriáveis nas TX/forecasts de despesa: sem `payment_list_items`, `transaction_documents`, `event_cache_payments`, refs de camarim/cartão/reembolso, `supplier_credit_usages`. Patrocínios/receitas (16 forecasts + 16 TX ligadas a `sponsorship_pipeline`) ficaram **protegidos** pelo modo replace. Módulo A&B intocado.

Snapshot pré-rebuild: 333 forecasts despesa (1.289.297,08 net) + 16 receita; 143 TX despesa pagas (773.375,74 net).

## Execução
`sync-coala-from-drive` mode=apply (download read-only do Drive → replace) + `coala-sync-bootstrap` para reancorar `row_state`.
- Apagados: 349 forecasts, 143 TX. Criados: 355 forecasts, 327 TX (326 pagas + 1 saldo pendente), 66 fornecedores.

## Reconciliação final (ficheiro vs sistema)
| Métrica | Ficheiro | Sistema | Δ |
|---|---:|---:|---:|
| Linhas importáveis (363 − 8 A&B) | 355 | 355 | 0 |
| Σ Net BP | 1.251.836,05 € | 1.251.836,05 € | 0 |
| Linhas com estado "Pago" | 325 (+1 parcial c/ pagamento) | 326 TX pagas | 0 |
| Contas a pagar (25 pending + 4 parciais s/ pagamento) | 29 | 29 | 0 |

Compare pós-rebuild: `missingInBp=0, extraInBp=0, valueMismatches=0, txMissing=0`.

## Divergências residuais (explicadas, não são erro)
- **86.203,70 €** entre `Σ Valor Pago` do ficheiro (1.224.052,01) e o bruto das TX pagas: 35 linhas marcadas "Pago" têm as colunas *Valor Pago s/IVA / Valor IVA* vazias ou inferiores ao bruto; a regra vigente gera a TX paga pelo bruto da linha. Comparando bruto-a-bruto: ficheiro 1.309.890,29 vs sistema 1.310.255,70 (Δ 365,41 = parcela paga da linha parcial).
- **8 pares ambíguos** (`needs_manual_link`): descrições+valor duplicados no ficheiro (Estrados Bandas, Estruturas Eléctricas ×2, Consultoria Carbono, Staffs Posso Ajudar, Assistência médica, Hostess Conferência, Filiado Associação) — delta 0, só falta escolher qual linha ancora qual TX.
- **"Armazem Coala - Orange 2ºbox"** 3.492,72 dividido em TX 297,07 + saldo 3.195,65 (split do gerador; soma bate).
- Diffs de patrocínios (1 missing / 2 extra / 9 mismatch) estão **fora do escopo do rebuild** — vivem no `sponsorship_pipeline`.

## Regra confirmada
Rebuild só via `sync-coala-from-drive` (apply/replace). Drive continua read-only (ver constraint coala-drive-readonly).

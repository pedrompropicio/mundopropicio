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

## Fecho do Bar 30-31/05/2026 (registado 2026-08)
Modelo BRUTO (quota cheia como receita + custos à parte), todos os valores LÍQUIDOS com `iva_rate=0` (IVA das vendas apurado no próprio fecho; nota na `specification`), pagos a 2026-06-01 na conta Banco Santander Totta.

Receitas (cat. 1.1.03 F&B): Quota MP vendas bares 98.274,68 · Bonificação Adega Almeirim 2.500,00 · Bonificação Acordo SB 3.252,03 · Ingressos Marco Caldeira 2.520,00 → 106.546,71 €.
Despesas (cat. 2.9.01 Bebidas): SSH consumos VIP/VVIP/staff+serviços 50.612,40 (fornecedor SSH criado) · Cashless 1.639,50 → 52.251,90 €.
Resultado líquido do fecho: **54.294,81 €**.

IDs: income c5b2e00f / dfd70d34 / 7dc38798 / 4568ae9c · expense 5acdc2c8 / be5e7783 · supplier SSH 985ed9aa-967b-4a94-affa-ddcbec215320.

### Exclusão A&B SIMÉTRICA no sync (regra nova)
O parser do XLSX já excluía as linhas A&B. `apply-coala-bp` passou a excluir também do lado do **sistema** tudo o que tenha categoria A&B (códigos `1.1.03*` e `2.9*`), via `abCategoryIds`/`isAbRow`, em três pontos: `bpRows` e `txPool` do compare e as eliminações do reimport/replace. Sem isto o fecho do bar aparecia como `txExtra` em cada dry-run e seria apagado num apply/rebuild.

### Módulo A&B com os valores reais
Regra contratual confirmada pelo Pedro e validada no ficheiro do fecho (aba "Resumo Vendas", coluna "% Variável"): **bebidas/bares 35%, comida (ambulantes+food trucks) 15%, Chakall Food Truck e Produção 0%** (fora da base de quota). Bases: bebidas 276.165,92 € ×35% = 96.658,07 €; comida 10.777,38 € ×15% = 1.616,61 € → quota MP total 98.274,68 € ✓ (o 33,31% anterior era a média ponderada, não a regra contratual). `event_ab_zones`: Relvado — Sábado e Relvado — Domingo (11.000 pax/dia) com per capita bebidas 12,63/12,47 e repasse 35%; Tenda VIP e Passe 2 dias com `participants_manual = 0` (o fecho só dá totais por dia — evita duplicar público). Config de alimentos: per capita 0,49 €, repasse 15%, fee 0. KPIs: faturação ≈294.993 € e receita casa 98.274,68 €. Modo mantém-se terceirização. Contexto registado em `event_ab_config.notes`.

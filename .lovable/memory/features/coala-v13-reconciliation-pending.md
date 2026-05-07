---
name: Coala PT 2026 v13 reconciliation pending
description: Estado da conciliação Coala PT 2026 v13 (ficheiro vs Live) — pausado para retomar amanhã
type: feature
---

# Coala PT 2026 v13 — Conciliação (PAUSADO)

Evento Live: `5a1da5fb-3115-4ae3-af50-15ce1f869a5c` (Coala Festival Portugal 2026, company `7d831e59-…`).

## Regras de comparação aplicadas (decisões do utilizador)
- Excluir do parse do ficheiro as linhas de **Bebidas** e **Alimentos** (A&B é gerido no módulo A&B).
- Comparar valores **líquidos (sem IVA)**.
- BR: linhas marcadas "Pago BR" → fornecedor **`MANDO (COALA BR)`**.
- Administradoras / CC ambíguo → manter em **`0.0.99` A classificar** (tratar depois).
- Parcelas: **1 linha BP ↔ N transações** vinculadas à mesma `category_id`.
- Premissa do utilizador (validada): 100% do BP do sistema veio do import → não pode haver "Only in System" estrutural.

## Totais reconciliados (2026-05-07)
| Métrica | Ficheiro v13 | Sistema | Δ |
|---|---:|---:|---:|
| Linhas BP (despesa) | 299 | 299 | 0 ✅ |
| Σ Net BP | €1.228.266,23 | €1.228.266,23 | 0 ✅ |
| Linhas pagas (count) | 60 | 60 | 0 ✅ |
| Σ Pago Net | €206.080,41 | €236.616,28 | **+€30.535,87** |

## Decomposição exata da diferença €30.535,87 (5 itens + arredondamento)
1. **Mídia FB €29.542,47** (sys, 2026-05-05) — sem par no ficheiro. Suspeita: TX criada fora do import.
2. **Airbnb Bea/Henrique/Matheus €1.525,69** (sys, 2026-04-13, CARTAO DE CREDITO) — não marcada como paga no ficheiro.
3. **Ana Frango Aéreas**: file €7.904,02 vs sys €7.604,00 — diferença €300,02 = linha "Ana Frango 2 Malas extras" separada em 2 TXs.
4. **Refação Lona CMC €214,80** (CORNUCOPILANDIA, 2026-02-20) — paga no file, falta TX no sistema.
5. **Impressão plantas €17,56** (FORMULA ARREBATADORA, 2026-04-22) — paga no file, falta TX no sistema.
6. Posters Câmara €0,09 (arredondamento, ignorar).

Outras: 2 datas trocadas em "Hostess Conferência €50" (Betânia ↔ Layane) — sem impacto financeiro.

## Pendente para amanhã
- Confirmar com utilizador se Mídia FB e Airbnb são entradas manuais legítimas ou se devem ser marcadas como pagas no ficheiro.
- Decidir se consolida Ana Frango €7.604 + €300 ou mantém separadas.
- Criar 2 TXs em falta (Refação Lona, Impressão plantas).
- Trocar datas Hostess.
- Aplicar renomeações: BR → `MANDO (COALA BR)`; manter acentos onde corretos.

## Artefactos
- `/mnt/documents/coala_diff_v13_corrigido.md` — relatório linha-a-linha.
- Ficheiro fonte: `BP_COALA_PT_2026_v13-12.xlsx` (utilizador reenvia se preciso).

## Lição aprendida
Nunca afirmar divergências sem ter o XLSX no turno. O dry-run anterior (sem ficheiro) fabricou divergências fantasma (IRMAFER, "13 Only in System", totais errados). Sempre exigir reupload se a sandbox não tem o ficheiro.

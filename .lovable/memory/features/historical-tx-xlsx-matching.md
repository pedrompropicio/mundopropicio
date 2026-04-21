---
name: Geração de transações históricas com matching XLSX
description: Botão "Gerar Transações" em eventos concluídos abre modal opcional de upload XLSX que faz match (Dice ≥ 0.8 + valor base ±0.01€) com previsões aprovadas; coluna F com Pago/Liquidado/OK/✓ liquida na conta "Eventos Históricos", restantes ficam como Approved
type: feature
---

## Fluxo
1. Em `EventDetail > BP`, botão "Gerar Transações (N)" aparece para admin quando o evento tem status `active` ou `completed` e há previsões **elegíveis** (regra única, ver abaixo).
2. Abre `GenerateHistoricalModal` com upload **opcional** do XLSX original do BP.
3. Se carregar XLSX: usa `parseXlsxPL` e envia para edge `generate-historical-transactions` o array `xlsxRows` `[{description, baseAmount, ivaRate, status}]` (status = valor bruto da coluna F) **+** `eligible_forecast_ids: string[]` calculado no cliente.

## Regra única de elegibilidade (`isEligibleForBulkTx`)
Tanto o botão histórico do header quanto o "Gerar Transações" do bulk (Receitas/Despesas) usam o **mesmo predicado**:
```
f.status === "approved"
&& !f.transaction_id
&& findMatchingTransactionsForForecast(f, transactions, forecasts).length === 0
```
A função de matching verifica:
1. Vínculo direto (`transaction_id = f.id`)
2. Categoria L3 com apenas 1 forecast → todas as TXs dessa categoria casam
3. Token-based winner-takes-all entre múltiplas linhas BP da mesma categoria

A edge function aplica `.in("id", eligible_forecast_ids)` quando recebido (fallback compatível: comportamento antigo se não enviado).

## Lógica de matching (edge function)
- Reutiliza a técnica do modal de implantação: **Dice coefficient ≥ 0.8** sobre descrições normalizadas (NFD, lowercase, sem acentos) **+** `Math.abs(baseAmount diff) ≤ 0.01€`.
- Cada linha XLSX só pode ser consumida uma vez (set `usedXlsxIdx`).
- Se houver match e a coluna F contém `pago | liquidado | ok | ✓` (case-insensitive, normalizado): cria transação com `status='paid'`, `paid_amount=total`, `payment_date=event.date`, `account_id=Eventos Históricos`.
- Caso contrário (sem match OU match sem status pago): cria transação com `status='approved'`, `paid_amount=0`, sem `account_id` nem `payment_date`.

## Observações
- Conta "Eventos Históricos" continua a ser obrigatória (422 se não existir).
- Continua a propagar `forecast.attachment_refs` para `transaction_documents` como `ref://https://...`.
- Resposta inclui `createdPaid`, `createdApproved`, `matched`, `unmatched`, `xlsxProvided` para feedback detalhado no toast.
- Sem XLSX → todas as transações são criadas como `approved` (não liquidadas).

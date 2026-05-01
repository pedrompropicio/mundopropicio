---
name: Sponsorship Pipeline ↔ Simulador
description: Simulador lê só BP (event_forecasts em L3 sob L2 1.2). Ponte é syncSponsorToBP. Auto-sync ativa para todos os 'closed' (paid/invoice_sent/post_event); barter e leads ficam só no pipeline.
type: feature
---

# Pipeline de Patrocínios ↔ BP / Simulador

## Source of truth
- **Simulador** lê EXCLUSIVAMENTE de `event_forecasts` em categorias L3 sob a L2 `1.2 Patrocínios e Apoios`.
- **Pipeline** (`sponsorship_pipeline`) é CRM puro: cards em negociação NÃO contam para o Simulador nem para o BP.

## Ponte: `syncSponsorToBP` (`src/lib/sponsorship-bp-sync.ts`)

Promove um card do pipeline para BP + TX quando **todas** estas condições se verificam:
- `stage === "closed"` (não basta estar em negociação)
- `is_barter === false` (permutas ficam só no pipeline)
- `auto_sync_bp === true`
- `confirmed_amount > 0`
- `company_id` resolvido

Categoria sempre `1.2.01 Patrocínios` (resolvida por `company_id` — multi-tenant).

### Estado da TX consoante `doc_status`

| `doc_status`        | TX status   | `payment_date` | `account_id`              |
|---------------------|-------------|----------------|---------------------------|
| `invoice_received`  | `paid`      | hoje           | 1ª conta bancária ativa   |
| `invoice_sent`      | `approved`  | null           | null                      |
| `post_event`        | `approved`  | null           | null                      |
| `awaiting`/null     | `approved`  | null           | null                      |

A linha BP nasce sempre `status='approved'`, `formula_type='fixed'`, `is_transitory=false`, vinculada via `transaction_id`.

## Importação via `SponsorshipPipelineImportModal`

Marca `auto_sync_bp = true` para os kinds `paid`, `pending_invoiced`, `pending_post_event`. **Permutas e leads ficam com `auto_sync_bp = false`** (só pipeline). Importar dispara `syncSponsorToBP` por cada card processado (best-effort, não bloqueia o import; falhas vão para a consola e toast).

## Idempotência
- Se o card já tem `linked_forecast_id` + `linked_transaction_id`, faz UPDATE em vez de INSERT (preserva referências, atualiza valor/IVA/descrição).
- Re-importar o XLSX faz UPDATE no pipeline (matching por `supplier_name` normalizado) e re-dispara o sync.

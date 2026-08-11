---
name: Ticketline section1 fallback
description: Import Ticketline suporta layouts sem secção ZONA via totais diários da secção 1; runs com 0 linhas mas vendas detetadas ficam 'warning'
type: feature
---

# Ticketline — fallback secção 1 (v2.4, 2026-08-11)

Caso real: evento "Deive Leonardo - Braga" (`3def1b85-0ed0-4166-b45d-3a4561564e15`,
código Ticketline `66606`). O `sale_summary.xlsx` vem sem o marcador
"Operações por dia" e sem o header `ZONA` → secção 2 inexistente → o parser
lia bem `section1Daily` mas gravava `rowsImported=0` com `status='success'`.

Regras novas em `supabase/functions/_shared/ticketline-import-server.ts`:

- Se `parseResult.rows` está vazio e há dias com vendas na secção 1, gera 1
  linha sintética por dia (vendasQty/vendasValue; fallback ao geral quando
  vendas=0) para a **única zona/lote do evento** ou zona `Geral` / `Lote 1`.
- Quantidades negativas (devoluções) preservadas.
- `import_audit.dataSource` ∈ `section2` | `section1_daily` | `none`.

Em `fetch-ticketline-reports/index.ts`: vendas na secção 1 + `rowsImported=0`
→ `status='warning'` + `error_message` + `import_audit.silentEmpty=true`.
Nunca mais `success` silencioso.

Nota: o delete de idempotência filtra `source='ticketline_import'`; vendas
manuais (outro source) não são tocadas.

Edge functions alteradas exigem **Publish** para produção.

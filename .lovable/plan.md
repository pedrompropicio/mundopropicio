## Resposta à pergunta obrigatória — onde encaixa a curva diária

**Conclusão: reutilizar `ticket_sales` (não criar tabela nova).**

`ticket_sales` é a tabela canónica de vendas diárias do sistema — já é usada pela Fever (`source='fever_import'`), pelo import Ticketline cliente (`source='import'`), pela box-office manual (`source='manual'`) e pela Coala. Tem:
- `sale_date date` ✅ (1 linha por dia)
- `zone_id` / `lot_id` (CHECK obriga ≥1 dos dois)
- `quantity`, `unit_price`, `total_value` ✅
- `source text`, `financial_account_id`, `import_batch_id` para idempotência por run
- índice único parcial `uniq_ticket_sales_imported_row WHERE source='import'` (não conflita com novo source)

**Mapeamento da curva diária Ticketline → `ticket_sales`:**

A série TOTAL GERAL do `sale_summary.xlsx` só dá (data, qty, valor) — sem desagregação por zona/tipo. Para satisfazer o CHECK e ficar coerente com o resto do sistema, cria-se **por evento** (idempotente):
- 1 `event_ticket_zones` "Ticketline (Total)" com `session_id=null`, `total_capacity=0`
- 1 `event_ticket_lots` "Ticketline (Total)" dentro dessa zona, `iva_rate=6`, `lot_kind='simple'`

Cada dia da curva → 1 linha `ticket_sales` com `source='ticketline_import'`, `import_batch_id=<run uuid>`, `quantity`/`unit_price`(=val/qty)/`total_value` desse dia (qty pode ser negativa = cancelamentos, mantém-se assim).

Idempotência: antes de cada import apaga-se `ticket_sales WHERE event_zone (Ticketline Total) AND financial_account_id=<conta Ticketline> AND source='ticketline_import'`. Mesmo padrão da Fever.

**Segundo ficheiro `ticket_zone.xlsx`:** parser portado para `_shared/` mas o resultado **não** é importado para `ticket_sales` nesta fase — guarda-se em `import_audit.zone_snapshot` (para reconciliação futura sem duplicar receita). Decisão alinhada com a frase "Para esta fase importamos a série TOTAL GERAL por dia".

Esta abordagem evita criar `ticketline_sales` nova, mantém os relatórios (DRE, bilheteira, curva de vendas) a ler de uma única fonte, e é o que o sistema já faz com Fever/Coala.

---

## Implementação (espelho 1:1 do Fever)

### 1. Migration (Test via tool; .txt para Live)

- `ticketline_sync_config` — `id, company_id, event_id (uniq), vault_secret_name, ticketline_event_id text, organization_name, enabled, last_run_at, last_run_status, created_at, updated_at`. RLS idêntica a `fever_sync_config` (admin/manager/editor/platform_admin escrita; select por company). Trigger `updated_at`.
- `ticketline_sync_runs` — `id, config_id, company_id, started_at, finished_at, status, mode, triggered_by, error_message, files_downloaded jsonb, import_audit jsonb`. RLS idêntica + trigger `notify_sync_action_needed`.
- `events.ticketline_event_id text` — campo novo, nullable, preenchido na UI quando provider=ticketline.

### 2. Edge functions

```
supabase/functions/
  fetch-ticketline-reports/index.ts    # pipeline Devise + parser + import
  update-ticketline-credentials/index.ts  # {email,password} → Vault (clona update-fever-credentials)
```

`fetch-ticketline-reports` (autoriza service_role OU JWT de admin/manager/editor/platform_admin):
1. carrega config + credenciais do Vault via `get_vault_secret`
2. `loginDevise()` — `fetch` com `redirect:'manual'`, cookie jar Map, extrai CSRF do `<meta name="csrf-token">`, POST `application/x-www-form-urlencoded`, captura `_session_id` e `acaAffinity` do 302
3. baixa `sale_summary.xlsx?granularity=2` e `ticket_zone.xlsx` reutilizando o jar
4. **Self-heal**: se response não-OK ou Content-Type `text/html` (página de login), refaz login UMA vez e re-tenta
5. parser → import. Erros classificados por `phase` (`login_csrf`, `login_post`, `xlsx_*_http_*`, `parse_failed`, `import_failed`).
6. grava run + atualiza `last_run_*`.

### 3. Parsers `_shared/`

- `ticketline-parser.ts` — novo, com `parseTicketlineSaleSummaryXlsx(buf)` que para na transição secção 1 → secção 2 (col[3] passa a string).
- `ticketline-zone-parser.ts` — porta de `src/lib/parse-ticketline-zone-xlsx.ts` (cópia direta, sem dependências de browser).

### 4. Import server `_shared/ticketline-import-server.ts`

Pequeno (≈80 linhas): ensure zona+lote "Ticketline (Total)", apaga vendas anteriores desse source nesse evento+conta, insere as linhas em chunks de 500. Devolve `ImportAudit` (rowsImported, prevSalesDeleted, importBatchId, zoneCreated, lotCreated, warnings, zone_snapshot).

### 5. Cron

```sql
select cron.schedule('ticketline-sync-daily','59 22 * * *', $$
  select net.http_post(
    url:='https://<ref>.supabase.co/functions/v1/fetch-ticketline-reports',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE>"}'::jsonb,
    body:='{"mode":"cron","triggeredBy":"pg_cron"}'::jsonb);
$$);
```

Body sem `configId` → função corre **todos** os configs com `enabled=true`. Aplicado em Test via `supabase--insert` + script `.txt` em `scripts/cron-ticketline-sync-daily-live.txt`.

### 6. UI

- `src/pages/admin/TicketlineSync.tsx` — clone direto de `FeverSync.tsx`, sem o bloco de Token (Ticketline = só credenciais). Botões: "Credenciais", "Correr agora", switch enabled, tabela últimas runs.
- Rota `/admin/ticketline-sync` em `src/App.tsx`.
- Link em `src/components/AppSidebar.tsx` ao lado de "Sync Fever".
- Campo `ticketline_event_id` no formulário de edição do evento (visível quando `ticketing_provider='ticketline'`) — local a confirmar lendo `EventEdit`/equivalente; se complexo, abre-se aqui um Input no card do config (mais simples e suficiente para arrancar).

Decisão pragmática para o MVP: como ainda não há provider selector no evento (campo `ticketing_provider` está vazio para todos os eventos), o `ticketline_event_id` mora **na própria config** (`ticketline_sync_config.ticketline_event_id`) — editável diretamente no card da `/admin/ticketline-sync`. Mantém o conceito multi-evento e evita tocar no editor de evento agora (que está marcado como protegido em vários sítios). Adicionar também ao schema `events` fica como nota mas não bloqueia.

### 7. Documentação

- `docs/integrations/ticketline.md` novo, formato igual a `docs/integrations/lovable-mcp.md`.
- Linha em `INTEGRATIONS.md` raiz (secção 5 — APIs Externas).

### 8. Restrições respeitadas

- Não toca `EventTicketing.tsx` nem `FeverImportModal.tsx`.
- Reutiliza o conceito de `event_ticket_zones`/`event_ticket_lots`/`ticket_sales` — sem nova tabela de vendas.
- Selectors do parser baseados em busca por label ("DATA", "TOTAL GERAL"), não por offset fixo.
- Zero hardcoded de eventos: `ticketline_event_id=63653` entra via UI/seed manual no único config inicial.

### O que reporto no fim

- SHA do commit, ficheiros criados/editados
- Confirmação `supabase--migration` aplicada em Test
- Confirmação `supabase--deploy_edge_functions` das 2 fns
- Script `.txt` do cron pronto em `scripts/` para o Pedro correr em Live após Publish
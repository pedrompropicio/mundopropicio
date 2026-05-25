# Ticketline — Sync diária de vendas

Importação automática diária da curva de vendas (zona × lote × dia) a partir
do portal de gestão da Ticketline (`manager.ticketline.pt`). Multi-evento.

## Visão geral

- **Fonte:** 1 ficheiro XLSX por evento — `sale_summary.xlsx?granularity=2`
  (título interno "RESUMO DE OPERAÇÕES"). Inclui o cubo completo
  data × zona/lote × canal numa segunda secção.
- **Destino:** `ticket_sales` (mesma tabela que Fever / Coala / box-office),
  com `source='ticketline_import'`.
- **Zonas/lotes:** criados/reutilizados em `event_ticket_zones` /
  `event_ticket_lots` com os nomes reais do XLSX.
- **Login:** Devise (Rails) — `manager[kind]=1`, credenciais cifradas no
  Vault por evento.
- **Frequência:** 1×/dia às 22:59 UTC (23:59 Portugal horário verão).

## Componentes

| Item | Caminho |
|------|---------|
| Edge fn principal | `supabase/functions/fetch-ticketline-reports/index.ts` |
| Edge fn credenciais | `supabase/functions/update-ticketline-credentials/index.ts` |
| Parser XLSX | `supabase/functions/_shared/ticketline-operations-parser.ts` |
| Import server | `supabase/functions/_shared/ticketline-import-server.ts` |
| UI | `src/pages/admin/TicketlineSync.tsx` → `/admin/ticketline-sync` |
| Config | tabela `ticketline_sync_config` (1 linha por evento) |
| Runs | tabela `ticketline_sync_runs` (auditoria) |
| Cron | `scripts/cron-ticketline-sync-daily-live.txt` |

## Schema das tabelas

`ticketline_sync_config` (1 linha por evento MP a sincronizar):

| Coluna | Tipo | Notas |
|---|---|---|
| `event_id` | uuid | FK evento MP |
| `ticketline_event_id` | text | ID do evento no portal Ticketline (ex: `63653`) |
| `vault_secret_name` | text | Nome do segredo Vault com `{email,password}` |
| `organization_name` | text | Label para a UI |
| `enabled` | bool | Liga/desliga sync |
| `last_run_at`, `last_run_status` | — | Auditoria rápida |

`ticketline_sync_runs`: cada execução grava `status`, `mode`
(manual/cron), `triggered_by`, `error_message`, `files_downloaded`,
`import_audit` (JSON com auditoria completa).

## Parsing da coluna "ZONA"

O valor vem concatenado. Separadores:

- ` - ` isola o **lote**: `OPEN BAR - Lote 2` → zona `OPEN BAR`, lote `Lote 2`
- ` | ` isola a **variante de tipo de ingresso**: `PREMIUM | Mob.Reduzida` →
  zona `PREMIUM`, lote (existente) + sufixo ` | Mob.Reduzida` no nome do lote
- Sem separador → guarda o nome inteiro como zona, lote default `Lote 1`,
  adiciona warning ao `import_audit` (não falha o run).

Nota terminológica: **Zona** (PT) = **Setor** (BR), mesma dimensão. Uma
zona tem N lotes (variação de preço no tempo) e pode ter variações de tipo
de ingresso (Mob. Reduzida, etc.).

## Valor real importado

Cada linha de `ticket_sales` usa o par **TOTAL VENDAS** (qty + valor).
"TOTAL GERAL" (que inclui vales, convites, cativos, bloqueados) NÃO entra
em `ticket_sales` — fica só no `import_audit` para reconciliação.

Os valores são **incrementais por dia** (não acumulados). `qty` pode ser
negativa (cancelamentos) — o sinal é preservado.

## Idempotência

Antes de cada import, todas as `ticket_sales` desse evento + conta
Ticketline + `source='ticketline_import'` são apagadas e re-inseridas com
um novo `import_batch_id`. Zonas e lotes são "ensure" (criados se não
existem; nunca apagados — podem ter outras fontes/sources).

## Self-healing

Se a resposta do XLSX não for OK, vier `Content-Type: text/html` ou
redirecionar para `sign_in`, o pipeline refaz o login Devise UMA vez e
re-tenta. Erros classificados por `phase` (`login_csrf`, `login_post`,
`xlsx_*`, `parse_failed`, `import_failed`, `account_missing`,
`session_expired`).

## Validação automática

O parser soma a secção 2 por dia e compara com a secção 1 (TOTAL VENDAS).
Divergência → entra como `warning` no `import_audit` mas não falha o run.

## Setup de um novo evento

1. Criar uma conta financeira tipo `ticket_office` com "Ticketline" no
   nome (idealmente uma por empresa).
2. Inserir 1 linha em `ticketline_sync_config` com `event_id`,
   `ticketline_event_id`, `vault_secret_name` (ex:
   `ticketline_<event_id>`), `organization_name`.
3. Em `/admin/ticketline-sync` → botão **Credenciais** → guardar
   `email` + `password` do gestor Ticketline.
4. Botão **Correr agora** para validar.

## Endpoints úteis

- Manual run: `supabase.functions.invoke('fetch-ticketline-reports', { body: { configId, mode: 'manual', triggeredBy: 'ui' } })`
- Cron (sem `configId`) processa todos os configs `enabled=true`.

## Notas de versão

- v2 (2026-05-25): substitui o import sintético "Ticketline (Total)" por
  zonas/lotes reais parseados da secção 2 do `sale_summary.xlsx`.
  `ticket_zone.xlsx` deixa de ser usado.

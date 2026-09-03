# Ticketline — Sync diária de vendas

Importação automática diária da curva de vendas (zona × lote × dia) a partir
do portal de gestão da Ticketline (`manager.ticketline.pt`). Multi-evento.

## Visão geral

- **Fonte:** 1 ficheiro XLSX por evento — `sale_summary.xlsx?granularity=2`
  (título interno "RESUMO DE OPERAÇÕES"). Inclui o cubo completo
  data × zona/lote × canal numa segunda secção.
- **Janela de datas obrigatória:** o endpoint `sale_summary` exige
  `filter_start_date` e `filter_end_date` na query string (formato
  `DD-MM-YYYY`). Sem eles devolve uma janela por defeito que pode vir
  vazia — origem de imports a zero. O pedido inclui também
  `bulk_event_ids=` (vazio) e `post_render_content=data` para coincidir
  com o que o browser envia.
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
| `sales_start_date` | date | Data de início de vendas (on-sale). Vai para `filter_start_date` no pedido. Nula = fallback `01-01-2025`. |
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

## Layouts sem secção "ZONA" — fallback pela secção 1 (v2.4)

Alguns relatórios (ex.: evento "Deive Leonardo - Braga", código 66606) vêm
sem o marcador "Operações por dia" e sem o header `ZONA`, logo sem secção 2.
Nesse caso o import usa os **totais diários da secção 1**:

- 1 linha de `ticket_sales` por dia com vendas (`vendasQty`/`vendasValue`;
  se ambos zero mas `geralQty/Value` ≠ 0, usa o geral).
- Destino: a **única zona/lote existente** do evento se só houver uma;
  senão cria/reutiliza zona `Geral` + lote `Lote 1`.
- Quantidades negativas (devoluções) são importadas com o sinal.
- `import_audit.dataSource = 'section1_daily'` (vs `'section2'`) e um
  warning explícito. Idempotência é a mesma (delete por evento+conta+source
  antes de inserir o novo `import_batch_id`).

## Fim do sucesso silencioso (v2.4)

Se o parser encontrou vendas na secção 1 mas `rowsImported = 0`, a run é
gravada com `status='warning'` (nunca `success`), `error_message` explícito
e `import_audit.silentEmpty = true`. Os `totals` do audit refletem sempre a
fonte usada (secção 1 quando é ela a origem).

## Validação automática

O parser soma a secção 2 por dia e compara com a secção 1 (TOTAL VENDAS).
Divergência → entra como `warning` no `import_audit` mas não falha o run.


## Janela de datas e `sales_start_date`

O pedido envia `filter_start_date` e `filter_end_date` em `DD-MM-YYYY`:

- `filter_start_date` = `ticketline_sync_config.sales_start_date` (data de
  início de vendas do evento). Se a coluna estiver nula, o sync usa o
  fallback fixo **`01-01-2025`**.
- `filter_end_date` = data de execução do sync (hoje, UTC).

Ambos os valores ficam registados em `import_audit.debug`
(`filter_start_date`, `filter_end_date`, `sales_start_date_source`).

A `sales_start_date` é editável directamente em `/admin/ticketline-sync`,
ao lado do código do evento Ticketline. Não é obrigatório preencher — o
fallback de 2025 cobre a maioria dos casos —, mas estreitar a janela
acelera o download e reduz ruído no parser.

## Setup de um novo evento

1. Criar uma conta financeira tipo `ticket_office` com "Ticketline" no
   nome (idealmente uma por empresa).
2. Inserir 1 linha em `ticketline_sync_config` com `event_id`,
   `ticketline_event_id`, `vault_secret_name` (ex:
   `ticketline_<event_id>`), `organization_name`.
3. Em `/admin/ticketline-sync` → preencher **Código do evento na
   Ticketline** e (opcional) **Data de início de vendas** → **Guardar**.
4. Botão **Credenciais** → guardar `email` + `password` do gestor
   Ticketline.
5. Botão **Correr agora** para validar.

## Endpoints úteis

- Manual run: `supabase.functions.invoke('fetch-ticketline-reports', { body: { configId, mode: 'manual', triggeredBy: 'ui' } })`
- Cron (sem `configId`) processa todos os configs `enabled=true`.

## Notas de versão

- v2.3 (2026-05-25): pedido passa a incluir `filter_start_date`,
  `filter_end_date` e `bulk_event_ids=` na URL do `sale_summary.xlsx`
  (sem estes parâmetros o servidor devolvia janela por defeito, muitas
  vezes vazia). Nova coluna `ticketline_sync_config.sales_start_date`
  editável na UI; fallback `01-01-2025` quando nula.
- v2 (2026-05-25): substitui o import sintético "Ticketline (Total)" por
  zonas/lotes reais parseados da secção 2 do `sale_summary.xlsx`.
  `ticket_zone.xlsx` deixa de ser usado.

- v2.4 (2026-08-11): fallback de importação pela secção 1 para layouts sem
  header `ZONA`; runs com vendas detetadas mas 0 linhas importadas passam a
  `status='warning'` em vez de `success`; `import_audit.dataSource`.

## Conta única + cache de sessão (v2.7, 2026-08-11)

- Todos os configs usam o segredo Vault partilhado **`ticketline_master`**
  (uma só conta Ticketline Manager). Os 5 segredos antigos eram idênticos.
- A edge function mantém `Map<vault_secret_name, Jar>` por invocação: **1 login
  Devise por corrida** em vez de um por config. Self-heal mantido (re-login
  apenas em `session_expired`).
- UI `/admin/ticketline-sync` → **Adicionar evento**: pede só evento do ERP +
  `ticketline_event_id` (+ data de início de vendas). Credenciais assumem
  `ticketline_master`; só se pede email/password com o toggle "Usar outra conta".
- Cron `ticketline-sync-daily` (22:59 UTC) passou a funcionar na **v2.6** —
  antes falhava com 403 porque só aceitava o service role por igualdade estrita.
- Runs com status **`html_response`** = `ticketline_event_id` obsoleto ou conta
  sem acesso ao evento (NÃO é sessão expirada). Usar `{"action":"discover"}`.

## Ocupação por zona — carga corrente (v2.40, 2026-09-03)

Ver `DR-2026-09-03-D20` em `docs/DECISIONS.md`: **carga inicial** (capacidade
planeada das zonas, fixa) ≠ **carga corrente** (o que está de facto à venda
na bilheteira, muda ao longo da venda).

- **Endpoint:** `GET /managers/events/{ticketline_event_id}/occupation.xlsx`
  (mesmo login Devise / `ticketline_master`).
- **Colunas lidas** (a partir do header `ZONA`, endereços reais das células):
  `ZONA | OCUP. MÁX. | DISP. | BLOQ. | Qt. ocupada`.
  A linha `Total` **não** é gravada como zona; se a soma das zonas não bater
  com o Total, a captura falha sem escrever nada. Disponibilidade negativa
  (sobrevenda) é dado real e é aceite.
- **Destino:** `public.event_zone_capacities`, uma linha por zona por dia:
  `capacity_kind='released'`, `source='ticketline_occupation'`,
  `observed_on` = hoje em Europe/Lisbon, upsert por
  `(event_id, zone_label, capacity_kind, observed_on)`.
  O BOL escreve na **mesma tabela** com o mesmo `capacity_kind='released'` e
  `source='bol_m2'`.
- **Cron:** não há cron novo. A captura entrou no ciclo do
  `ticketline-sync-daily` (`5 * * * *`, sem `configId` → fan-out por config):
  cada sub-invocação corre `runOneConfig` (sale_summary) e **depois**
  `captureOccupationSafe`. Falha na ocupação nunca aborta as vendas desse
  evento nem dos outros — fica em `ticketline_sync_runs.import_audit.occupation`.
  Em `mode='cron'` só corre 1×/dia por evento (já existe retrato de hoje →
  `skipped`); em `mode='manual'` corre sempre e refresca o retrato do dia.
  A action manual `{"action":"capture_occupation","configId":"…"}` mantém-se.
- **Mapeamento às zonas do ERP:** função
  `public.zone_capacity_snapshot(_event_id uuid, _on date default current_date)`.
  Toma o **último retrato** disponível até `_on` (`max(observed_on) <= _on`,
  uma só data), normaliza o `zone_label` com `public.normalize_zone_label()`
  — prefixo antes do primeiro ` - ` e do ` | `, o que retira o sufixo do
  recinto e o lote/variante; sem acentos, sem espaços duplos, minúsculas — e
  casa com `event_ticket_zones.name` normalizado da mesma forma. Agrega por
  zona (`capacity`, `available`, `blocked`, `occupied`) e devolve ainda
  `unmatched_labels` (jsonb) com os rótulos que não casaram, para a UI os
  mostrar em vez de os perder. `EXECUTE` só a `authenticated`/`service_role`,
  com guarda de empresa do evento.
  Exemplo (Ivete Clareou 2026, `_on='2026-08-27'`): ARENA 14.020 · OPEN BAR 5.996.
- **Simulador:** `src/lib/event-simulator-sync.ts` usa a carga corrente como
  base da projecção por defeito quando há retrato (senão mantém
  capacidade − vendido), nunca deixa a projecção acima da carga corrente
  (baixa e escreve em `notes`: "projecção ajustada à carga corrente de <data>")
  e mantém `capacity_target` = capacidade da zona. A tabela Dia × Zona mostra
  as duas ("Capacidade 14.000 · Carga corrente 8.520 em 27/08").

## Nota operacional — Publish pode não reconstruir a edge function

Aconteceu a 2026-09-03: dois Publish seguidos e a produção manteve-se em
`v2.39_capture_occupation` enquanto o repo já tinha `v2.40_occupation_in_daily_cycle`
— sem erro visível. Depois de cada Publish que toque nesta função, confirmar a
versão realmente deployed com a acção read-only `{"action":"discover"}` (devolve
`version`). Se divergir do `VERSION` do repo, fazer deploy directo da função
`fetch-ticketline-reports` em vez de repetir o Publish.

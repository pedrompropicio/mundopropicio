# Ticketline — eventos migrados: captura diária via `sales_per_event`

## Contexto

Em 19/08/2026 a Ticketline migrou 5 eventos da turnê Raphael Ghanem 2027 para a "nova área de Promotores":

- `68025` Lisboa
- `68026` Santarém
- `68027` Almada
- `68051` Estoril
- `68961` Albufeira

Consequências imediatas no portal antigo (`manager.ticketline.pt`):

- `sale_summary.xlsx` por evento devolve a home nova (landing de ~15–30 KB, detetável pelo texto "nova área de Promotores");
- páginas e exports por evento renderizam a **zeros**;
- o caminho clássico de importação (`source='ticketline_import'` em `ticket_sales`) deixou de funcionar para estes eventos.

Este documento regista o fluxo de captura diária alternativo validado em produção. **Não reinvestigar — usar como referência.**

---

## Descobertas-chave (provadas em produção)

### 1. Filtro `bulk_event_ids` é ignorado

O parâmetro `bulk_event_ids` em `/managers/dashboard/sale_summary` é **sempre ignorado** pelo servidor. Testado com eventos migrados, não migrados e sem filtro — as respostas são idênticas. Qualquer tentativa de captura "por evento" via dashboard devolve os dados da **conta inteira**, não do evento.

### 2. Período do dashboard é estado de sessão

O período ativo fixa-se com um POST em `/managers/dashboard/sale_summary` com:

- `period=5`
- `filter_start_date=DD-MM-YYYY`
- `filter_end_date=DD-MM-YYYY`

(O formulário só contém `utf8`, `authenticity_token`, `period` e as datas. Incluir `bulk_event_ids` no POST devolve HTTP 500.)

GETs subsequentes re-renderizam o estado da sessão. Para confirmar que a sessão reflete exatamente o dia pretendido, extrai-se o header `Operações de X a Y` do SJR de `sale_summary` — só quando `start == end == dia pedido` é que se lê o relatório `sales_per_event`.

### 3. Relatório por evento que funciona: `sales_per_event`

Endpoint: `/managers/dashboard/sales_per_event`

Pedido SJR:

- `post_render_content=data`
- `X-Requested-With: XMLHttpRequest`
- `Accept: text/javascript`
- `X-CSRF-Token` do Devise

Resposta: duas tabelas.

| Tabela | Header superior | Colunas | Uso |
|--------|-----------------|---------|-----|
| **Simples** | "Total Vendas" | `Evento`, `Qt.`, `Valor` | ✅ Vendas pagas — usar esta. |
| Detalhada | "Total Geral" | ~20 colunas, começa por Total Geral | ❌ Inclui convites, vales, cativos. Ignorar. |

Escolher a tabela com **menor número de colunas** cujo header superior seja "Total Vendas". Eventos sem movimento no período **não aparecem** — ausência deve ser interpretada como `0 / 0 €`.

### 4. Matching por códigos, não por nomes

Labels do relatório incluem códigos internos entre parêntesis retos:

```text
Lisboa | Raphael Ghanem [106158/127629]
```

O matching usa `ticketline_sync_config.ticketline_report_codes` (ex. `'106158/127629'`). Nomes são ambíguos — exemplo real: "Lisboa | Raphael Ghanem" vs "Lisboa | Simone Mendes - Tour Portugal 2026".

Fallback por nome normalizado só para configs **sem** `ticketline_report_codes` preenchido.

---

## Mecanismo: `fetch-ticketline-reports` v2.36

Ação: `capture_day` com payload `{ configId, dateISO? }`.

Se `dateISO` omitido, assume o dia corrente em `Europe/Lisbon`.

### Passo a passo

1. **Login fresco dedicado** — nunca reutiliza o `SessionCache` dos syncs XLSX.
2. **POST** `period=5` + datas no `sale_summary` para fixar o dia alvo na sessão.
3. **GET SJR** `sale_summary?post_render_content=data` para confirmar o período (`Operações de X a Y`).
   - Se `start != end != dia pedido` → falha `capture_day_period_mismatch`.
4. **GET SJR** `sales_per_event` na mesma sessão.
5. **Parse**: escolher a tabela simples "Total Vendas".
6. **Match** por `ticketline_report_codes`; fallback por nome normalizado só para configs sem códigos.
7. **Validações**:
   - `TOTAL == soma das linhas`;
   - `qty ≤ 5000` por linha (sanity);
   - rejeitar ambiguidade de código (dois configs com mesmo código).
8. **UPSERT** em `ticketline_daily_sales` por `(event_id, sale_date)`.
   - Apenas a data capturada é afetada.
   - Nunca apaga/regrava outras datas.

---

## Estado dos dados

### `ticket_sales` (snapshot congelado)

- Para os 5 eventos migrados: dados por zona/lote **congelados a ≤ 18/08/2026**.
- Nunca apagar nem regravar.
- Servem como base histórica por zona.

### `ticketline_daily_sales` (série diária sem zona)

- `≤ 18/08/2026`: reconstruída a partir do snapshot `ticket_sales`.
- `≥ 19/08/2026`: alimentada exclusivamente por `capture_day`.
- Provider: `'Ticketline'`.

### Flags por config

| Campo | Valor | Significado |
|-------|-------|-------------|
| `enabled` | `false` | Caminho XLSZ por evento está morto. |
| `daily_fallback_active` | `true` | Alvo do `capture_day`; padrão BOL. |
| `ticketline_report_codes` | preenchido | Matching determinístico. |

### Evento de referência

- `68024` Porto continua no caminho XLSX normal.
- Também tem `ticketline_report_codes` preenchido por precaução, mas mantém `daily_fallback_active=false`.

---

## Crons (pg_cron)

| Job | Nome | Expressão | O que faz |
|-----|------|-----------|-----------|
| 27 | `ticketline-sync-daily` | `5 * * * *` | Sync XLSX dos 8 eventos no caminho normal. |
| 90 | `ticketline-capture-day-hourly` | `15 * * * *` | Dispara `capture_day` para o dia corrente (Europe/Lisbon). |
| 91 | `ticketline-capture-day-seal` | `25 0 * * *` | Sela o dia anterior em Europe/Lisbon (DST-safe). |

---

## Validação de referência

- **RG Porto, 19/08/2026**: `28 / 1.018,00 €` — idêntico no caminho XLSX e no relatório `sales_per_event`, confirmando que a base "Total Vendas" é equivalente.
- **19/08/2026 (migrados)**: Lisboa `27 / 1.050 €`, Almada `20 / 650 €`, Estoril `4 / 120 €`, Albufeira `8 / 280 €`, Santarém `4 / 140 €`.
- **20, 21 e 22/08/2026**: capturados com sucesso via `capture_day`.

---

## Pendentes conhecidos

- Evento **"Raphael Ghanem — Braga [106155/127627]"** aparece no relatório `sales_per_event` com vendas, mas ainda não tem config correspondente no ERP (`ticketline_sync_config`).
- Decisão: criar config para Braga se/quando for necessário incluí-lo no dashboard de vendas.

---

## Histórico

| Versão | Data | Notas |
|--------|------|-------|
| v2.27/v2.28 | 2026-08 | Diagnóstico inicial: dashboard fallback por evento devolvia conta inteira. |
| v2.32 | 2026-08 | Multi-candidate retry com identity baseline. |
| v2.33 | 2026-08 | Captura incremental do dia corrente via dashboard global. |
| v2.34 | 2026-08 | Action `capture_day` usando `/managers/dashboard/sales_per_event`. |
| v2.35 | 2026-08 | Sonda de período via `sale_summary` SJR; parse escolhe tabela simples "Total Vendas". |
| **v2.36** | **2026-08-22** | Matching por `ticketline_report_codes`; validado em produção de ponta a ponta. |

---

## Corte por Tipo de Bilhete — `capture_ticket_types` (v2.37, issue #73)

Série diária **por tipo de bilhete** (`Normal`, `VIP-Portal Mundo Propício`,
`Exclusivo FNAC | Portador Cartão FNAC`, …), que mede diretamente o funil do
portal (cupão MP15) por dia.

### Endpoint

```text
GET /managers/events/{ticketline_event_id}/ticket_type.xlsx
    ?period=5&filter_start_date=DD-MM-YYYY&filter_end_date=DD-MM-YYYY
```

- **É por evento** (provado 23/08/2026: `65077` devolve 3 tipos, `68024` só
  `Normal`, `63653` vazio). Ao contrário do `sale_summary`, não devolve a conta
  inteira — não há aqui o problema do `bulk_event_ids` ignorado.
- **Aceita um só dia**: `filter_start_date = filter_end_date`. Não é preciso o
  POST de período do `sale_summary` — o filtro vai na query string.
- Login **fresco dedicado**, sem reutilizar o `SessionCache` dos syncs XLSX.
- Há também a versão SJR (`/managers/events/{id}/ticket_type` com
  `post_render_content=data`), usada apenas nas sondas.

### Action

`capture_ticket_types`, payload `{ configId, dateISO? }`. Sem `dateISO`, assume
o dia corrente em `Europe/Lisbon` (igual à `capture_day`).

### Regras de parsing (não relaxar)

1. **Coluna VENDAS, nunca TOTAL GERAL.** Em 20→23/08/2026 o Total Geral dá 87 e
   Vendas dá 83 — o Geral inclui vales, convites, cativos e bloqueados.
2. **O nome do tipo é texto opaco.** `Exclusivo FNAC | Portador Cartão FNAC`
   contém ` | `, que no parser de zonas é separador de variante. Aqui **nunca**
   se parte por `|`.
3. **Período confirmado antes de gravar**: cabeçalho `Operações de DD-MM-YYYY a
   DD-MM-YYYY` tem de ser exatamente o dia pedido; senão falha
   `ticket_types_period_mismatch` e não escreve nada.
4. **Validações bloqueantes**: cada linha `SOMA` tem de bater com as linhas de
   PVP do tipo, e a linha `TOTAL` com a soma dos tipos → `ticket_types_total_mismatch`.
5. **UPSERT só da data capturada**, por `(event_id, sale_date, ticket_type)`.
   Nunca apaga nem regrava outras datas.
6. Relatório vazio ("Não há dados referentes ao período seleccionado") → grava
   **zero linhas** e devolve sucesso. Ausência é 0, não é erro.
7. **`!ref` mentiroso**: o XLSX declara `A1:D30` apesar de ter 26 colunas. A
   grelha é reconstruída a partir dos endereços reais das células — usar
   `sheet_to_json` diretamente corta as colunas de VENDAS.

### Destino: `ticketline_daily_ticket_types`

| Coluna | Notas |
|---|---|
| `company_id` | **NOT NULL, sem default `current_company_id()` e sem o trigger `set_company_id_on_insert()`** — a função escreve-o explicitamente a partir de `ticketline_sync_config.company_id`. Sob service_role `auth.uid()` é NULL, o que rebentava o insert (issue #71, corrigida em 23/08/2026). |
| `event_id` | FK evento MP, `on delete cascade` |
| `sale_date` | dia da operação |
| `ticket_type` | nome exato do tipo, texto opaco |
| `quantity`, `total_value` | base **Vendas** |

`UNIQUE (event_id, sale_date, ticket_type)` + índice `(event_id, sale_date)`.
RLS: leitura por empresa (`current_company_id()`), escrita para
admin/manager/editor/platform_admin; service_role escreve sempre.

### Validação de referência (Ivete Clareou 2026, config `b9348d39…`, evento 65077)

- Backfill 01→23/08/2026 corrido dia a dia.
- 20→23/08: **83 bilhetes / 7.235,00 €** (Normal 67 / 6.045,00, VIP-Portal 10 /
  807,50, FNAC 6 / 382,50).
- 22/08 isolado: **26 bilhetes / 2.025,00 €**.

Cron ainda **não** criado — a captura corre por invocação manual até o Pedro dar ok.

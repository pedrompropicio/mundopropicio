---
name: Bilheteira sync (portal)
description: Varredura diária das páginas públicas de bilheteira (Ticketline/BOL) que atualiza event_marketing.ticket_lots e offer_price_min, com guardrail de nunca marcar esgotado
type: feature
---

## O que é

Edge function `bilheteira-sync` (v1, 2026-08-12). Cron diário **08:00 UTC = 09:00 Europe/Lisbon**
(`bilheteira-sync-daily`). Lê as páginas **públicas** das bilheteiras e atualiza a régua editorial
de lotes do portal.

Elegibilidade: `events.portal_visible=true`, `date >= hoje`, `ticketing_url` preenchido e
`event_marketing.lots_locked=false`. `lots_locked=true` → curadoria 100% manual, automação
não toca.

## Parsers (`_shared/bilheteira-parsers.ts`)

Roteador por `events.ticketing_provider` com fallback pelo domínio do URL.

- **ticketline** — se o `ticketing_url` não for `/sessao/`, segue o 1º link `/sessao/` da página do
  evento. Na página "Escolha de lugares" os dados vêm de `data-zone-info` (JSON por zona:
  `name`, `seats_available`, `seats_price.total_amount` = **preço base**) cruzado com a lista
  `#venueZonesList` (nome com capitalização correta, `class="… soldout"`, e o preço base entre
  parênteses `(45,00€)` — o valor grande é com taxas).
- **bol** — página de Sectores; cada sector vem em `data-sector` JSON
  (`"Sector:"`, `"Preço:":[{"P":"209,00€"}]`, ou `"Disponibilidade:":"Lotacão Esgotada"`).

Zonas de **mobilidade condicionada / visibilidade reduzida / acompanhante** são ignoradas para
lotes e preço mínimo (`IGNORE_ZONE_RE`).

## Regras de escrita

- `offer_price_min` = menor preço **base** entre zonas disponíveis não-ignoradas.
- `ticket_lots` = `{label_pt,label_en,price,status}`: lotes anteriores ao maior "Lote N"
  disponível entram como `esgotado` sem preço (`"1º Lote"`); zonas com lote entram como
  `"2º Lote — Bancada"` `a_venda`; zonas sem lote entram com o próprio nome; zonas esgotadas
  individualmente entram como `esgotado`.
- **REGRA CRÍTICA — nunca marcar esgotado automaticamente:** se nenhuma zona relevante estiver
  disponível, não escreve nada (nem `offer_availability`, nem `ticket_lots`) e loga
  `changes.possible_soldout=true`. Motivo: falso "esgotado" da Ivete lido da página pública em
  2026-08-12 — o custo de um falso esgotado é venda parada.
- Em dúvida (HTML inesperado, sem zonas, preço 0 ou > 5000 €) → não escreve, loga erro.
- `offer_availability` **nunca** é alterado pela automação na v1.

## Auditoria

Tabela `public.bilheteira_sync_log` (`event_id, run_at, provider, url, parse_ok, raw_summary,
changes, error`). SELECT só admin/platform_admin; escrita só service_role. É a única fonte de
auditoria da v1 — **sem notificações WhatsApp** (fica para v2).

## Auth

`verify_jwt` default do projeto (não listada em `config.toml`); validação em código: service_role
(env ou JWT do Vault, via `jwtRole()`) ou JWT de utilizador com role admin/platform_admin.
Aceita `{ eventId?, dryRun?, triggeredBy? }`.

## v1.1 — notificação por e-mail (2026-08-12)

Digest **um e-mail por execução**, template `bilheteira-sync-digest` enviado via
`send-transactional-email` (infra Lovable/queue, sender `notify.mpgestaoeventos.com`).

- Envia só quando há **mudanças aplicadas** ou **alerta `possible_soldout`** (nunca em scans sem
  alterações; nunca em `dryRun`).
- Destinatários por secret: `BILHETEIRA_SYNC_NOTIFY_TO` (gestora de marketing) e
  `BILHETEIRA_SYNC_NOTIFY_CC` (Pedro). Sem `..._TO` → não envia, só `console.log`. Como o
  `send-transactional-email` não suporta CC, o CC é um segundo envio do mesmo digest.
- A sync **nunca falha** por causa do e-mail (try/catch por destinatário).
- Conteúdo por evento: preço mínimo antigo → novo, transições de lote ("1º Lote esgotou",
  "2º Lote — Bancada à venda 45 €"), aviso "possível esgotado — confirmar manualmente", e links
  para o portal (`mundopropicio.com/eventos/<slug>`) e editor CRM (`/crm/eventos/:id`).
- Os logs dos eventos notificados são inseridos **depois** do envio, com
  `changes.email_sent: true|false` (+ `email_skip_reason` quando falso).

## v1.2 — correções pós dry run real (2026-08-12)

1. **Ticketline: fetch tolerante.** O `fetch` do Deno rejeitava as respostas da Ticketline
   ("invalid HTTP header parsed", headers `Report-To`/CSP malformados). Novo
   `_shared/tolerant-fetch.ts`: tenta `fetch` normal e, em falha, cai para cliente HTTP/1.1 em
   raw TLS (`Deno.connectTls`) com redirects manuais (máx. 5) e User-Agent de browser,
   `Accept-Encoding: identity`. **Todos os fetchs da sync passam por `tolerantFetch`.**
2. **BOL: navegação até Sectores.** `findBolSectoresUrl()` segue página de evento → `/Sessoes`
   → `/Sectores` antes de parsear (antes só entendia URLs já em `/Sectores`).
3. **BOL: preços.** A BOL usa `"Preço:"` **ou** `"Preços:"` (array). O parser aceita qualquer
   chave `^Pre[çc]os?:` — antes marcava zonas com `Preços:` como esgotadas por falta de preço.
4. **REGRA CORRIGIDA — visibilidade reduzida CONTA.** `IGNORE_ZONE_RE` passou a excluir apenas
   bilhetes condicionais de mobilidade (`mobilidade|condicionad|cadeira de rodas|acompanhante`).
   Setores de *visibilidade reduzida* são bilhetes públicos normais e entram no preço mínimo e
   na régua (caso Conferência Plenitude: min correto 79 €, não 109 €).
5. **Cron**: `net.http_post(..., timeout_milliseconds := 30000)`.

Dry run 2026-08-12 (14 eventos futuros): `parse_ok=true` em todos, 0 `possible_soldout`.

## v1.3 — escrita real ativada (2026-08-12)

- `dryRun` deixa de ser default: a função aplica `offer_price_min` + `ticket_lots`; `{dryRun:true}`
  continua disponível para testes. Guardrails inalterados.
- **Régua truncada** (`MAX_AVAILABLE_LOTS = 4` em `_shared/bilheteira-parsers.ts`): entram TODOS os
  itens `esgotado` (prova social) + apenas as **4 zonas/lotes à venda mais baratas**. Sem item fake
  "+ outras zonas". `offer_price_min` continua a considerar todas as zonas disponíveis.
- **Cron corrigido**: `bilheteira-sync-daily` usa o URL do projeto e
  `vault.decrypted_secrets.name = 'email_queue_service_role_key'` (o `current_setting(
  'app.settings.service_role_key')` da migration original devolvia NULL → 401) + `timeout_milliseconds := 30000`.
- Execução real 2026-08-12 19:47 UTC: 14 eventos, `parse_ok=true` em todos, 0 `possible_soldout`,
  0 erros, digest enviado (`email_sent=true`).

## v1.4 — mobilidade fora da régua + info editorial (2026-08-12)

1. **Mobilidade reduzida TOTALMENTE fora de `ticket_lots`** (nem esgotado, nem à venda) e fora do
   preço mínimo — bilhetes exclusivos de baixa quantidade não são sinal de escassez.
   `IGNORE_ZONE_RE` passou a cobrir também `\bmob\.?\b` e `\bpmr\b` (o caso "Arena | Mob.Reduzida"
   da Ivete escapava). Visibilidade reduzida continua a CONTAR.
2. **`age_rating` e `doors_time` automáticos** — `parseEventInfo(html)` lê "Classificação: M/06"
   (normaliza para `M/NN`) e "Abertura de portas: 16h00" (normaliza para `HHhMM`) da página de
   EVENTO. Quando o `ticketing_url` já é `/sessao/`, segue o link `/evento/` da sessão para ler a
   info. Só grava com match inequívoco; atualiza quando muda; respeita `lots_locked`; entra no
   digest ("Classificação: — → M/06"). No ramo `possible_soldout` estes dois campos podem ser
   gravados (os lotes/preço continuam intactos).
3. **Bug corrigido**: `sameLots` comparava `JSON.stringify` e o jsonb do Postgres reordena as
   chaves → todos os eventos apareciam sempre como "alterados" (e-mail a cada corrida). Agora
   compara tuplas normalizadas `[label_pt,label_en,price,status]`.

Execução real 2026-08-12: réguas regeneradas (Ivete perdeu "Arena | Mob.Reduzida"),
`age_rating` preenchido em Deive Braga / SM Lisboa / SM Porto (M/06), `doors_time` só na Ivete
(16h00 — é o único evento com o rótulo na página). Corrida seguinte: 14/14 "sem alterações".

## v1.5 — rotação automática do destaque da home (2026-08-12)

No fim de cada execução (só em corridas completas; `{eventId}` não roda destaque):

1. **Higiene** — `portal_featured=false` em eventos com `date < CURRENT_DATE`.
2. **Fila nunca vazia** — se não sobrar nenhum evento com `portal_featured=true` +
   `portal_visible=true` + `date >= CURRENT_DATE`, promove o próximo evento futuro
   `portal_visible=true` com `parent_event_id IS NULL` (mãe multi-dia pode; cidade-filha de tour
   não). Empate na mesma data → prefere quem tem `ticketing_url`.
3. **Digest** — linha "Destaque da home: X (realizado) → Y" ou "Destaque promovido
   automaticamente: Y (data)"; conta como mudança aplicada para efeito de envio de e-mail.
4. **dryRun** — só reporta (`would_unfeature` / `would_promote`), não escreve.
5. **Guardrails** — nunca toca `portal_visible`; idempotente (2ª corrida no mesmo dia não
   escreve nem loga nada). Log em `bilheteira_sync_log` com `provider='featured-rotation'`.

Teste em Test 2026-08-12: destaque em evento passado (New Gang 2023 + Anitta 18/07) →
dryRun propôs `would_unfeature` ambos e `would_promote` Ivete Clareou 2026 (05/09); execução real
aplicou (`applied:true`, `email_sent:true`); 2ª execução não gerou log (idempotente).

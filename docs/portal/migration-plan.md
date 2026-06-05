# Portal — Plano de Migração

**Versão:** 2 (28/05/2026) — secção de rollback reescrita (Lovable-aware), passos alinhados com schema real em `public.*`
**Estado:** Plano · Pronto para execução
**Sequência:** 3 fases ordenadas, com checkpoint de validação no fim de cada uma

---

## Princípios

1. **Cada fase é independente.** Pode ficar parada ao fim de qualquer fase sem deixar o sistema partido.
2. **Site actual continua a funcionar durante toda a migração** até ao último corte da Fase 2.
3. **Rollback Lovable-aware em qualquer fase.** Ver §"Rollback" no fim deste documento. **NÃO assumir que "git revert" desfaz um deploy** — Lovable Publish e edge function deploys não são git-based.
4. **Cada prompt para Lovable deve ser dispatchado individualmente, com Pedro a confirmar antes.** Não há automação de fases.

## Visão geral das fases

| Fase | O quê | Estimativa | Risco |
|---|---|---|---|
| **1. Migração de stack** | Site Lovable Vite SPA → TanStack Start (modern) | 1-2 semanas | Médio (regressões visuais) |
| **2. Migração de Supabase** | Repointing do site `zjseklogascfwqjoocbl` → `ukpuhoynrqobqtzdbysp` | 2-3 semanas | Alto (auth, RLS, edge functions, esquema em `public.*`) |
| **3. Página individual de evento + MVP médio** | Nova rota `/eventos/{slug}`, OG dinâmico, line-up, FAQ, lead capture | 1-2 semanas | Baixo (additive) |

**Total realista:** 5-7 semanas. Pedro decide ritmo conforme outras prioridades (MP Audience P0 Fases 1A-1D ainda em curso).

---

## Fase 1 — Migração de stack para TanStack Start

### Objectivo
Mover o site de Lovable classic (Vite + React SPA) para Lovable modern (TanStack Start, com SSR/SSG).

### Por que primeiro
- Construir a página individual de evento na stack antiga e migrar depois = duplicar trabalho.
- SSR é pré-requisito para OG dinâmico do MVP.
- Não toca em dados; risco isolado a frontend.

### Passos

**1.1 Recap pré-migração**
Lovable agent lê `architecture.md`, `data-model.md`, `mvp-spec.md`, e o código actual. Produz relatório do que muda e onde estão os riscos.

**1.2 Migração estrutural**
- `BrowserRouter` (react-router-dom) → roteamento TanStack Start (file-based)
- Páginas existentes em `src/pages/*` → `src/routes/*` no formato TanStack
- `useQuery` (React Query) continua a funcionar; ajustes mínimos
- `LanguageProvider`, `QueryClientProvider`, etc. — wrappers SSR-safe

**1.3 Validação**
- Todas as rotas existentes (`/`, `/programacao`, `/sobre`, `/contacto`, `/blog`, `/blog/:slug`, `/admin/login`, `/admin`, `/privacidade`, `/bilhetes/:slug`) funcionam
- View source de cada página mostra HTML renderizado (não `<div id="root"></div>` vazio)
- og:image e meta tags presentes no HTML inicial
- Lighthouse score: Performance ≥ 80, SEO ≥ 95 em desktop

### Checkpoint Fase 1

Pedro abre o site, navega todas as páginas, testa admin, testa redirector. Tudo funciona = avanço para Fase 2. Algo partido = rollback (ver §"Rollback Fase 1") antes de avançar.

---

## Fase 2 — Migração de Supabase

### Objectivo
Site passa a apontar para `ukpuhoynrqobqtzdbysp` (Supabase central). Supabase antigo (`zjseklogascfwqjoocbl`) torna-se read-only e depois é depreciado.

### Pré-requisitos (validar via SQL Editor Live antes de começar)

```sql
-- Extensão necessária
SELECT * FROM pg_extension WHERE extname='pgcrypto';
-- Schema real
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='events' ORDER BY ordinal_position;
-- Enum e roles existentes
SELECT enum_range(NULL::app_role);
-- UUID da MP
SELECT id, name FROM public.companies WHERE name ILIKE '%mundo%propi%';
-- current_company_id() funciona
SELECT public.current_company_id();
```

Documentar UUID da MP em local seguro — será usado como constante em edge functions.

### Passos

**2.1 Schema preparado no central (Fase 0 do `data-model.md`)**

Aplicar via Lovable SQL Editor (Live) na ordem:
1. Estender `public.events` com colunas em falta (idempotente: `ADD COLUMN IF NOT EXISTS`)
2. Criar `public.event_lineups`, `public.event_faqs`, `public.contacts`, `public.leads` (com `company_id NOT NULL`)
3. Criar `public.lead_capture`, `public.redirect_log` (RLS INSERT-anónimo)
4. Criar views `public.events_public`, `public.event_lineups_public`, `public.event_faqs_public`, `public.blog_posts_public`, `public.site_content_public` com `security_invoker=false` e `GRANT SELECT TO anon, authenticated`
5. Aplicar mesmas SQL em Test para minimizar drift de tracking

Cada bloco é confirmado por Pedro antes de aplicar. Documentar todas as migrations em `supabase/migrations/` do repo `mundopropicio`.

**2.2 Edge functions de processamento e migração**

Criar e deployar (via `deploy_edge_functions` no agente Lovable):
- `process-lead-capture` — consome `lead_capture`, faz match-or-insert em `contacts`, insere em `leads`, dispara CAPI
- `process-redirect-log` — consome `redirect_log`, insere em `leads` com `kind='redirect_click'`
- `capi-meta-events` — envia eventos para Meta Conversions API com hashes pre-computados
- `admin-update-event` — `SECURITY DEFINER`, valida `app_role` antes de escrever em `public.events`/`event_lineups`/`event_faqs`
- `migrate-old-site-to-central` — função pontual de migração de dados (idempotente)

Cron jobs:
- Catch-up de `process-lead-capture` a cada 5min (apanha `processed=false` mais antigos que 1min)
- Catch-up de `process-redirect-log` idem

**2.3 Pre-mapping de Pedro em `user_roles`**

ANTES do repointing, garantir que Pedro tem entrada em `public.user_roles` (central) com `role='admin'` e o `profile_id` correcto. Sem isto, `/admin` quebra após repointing.

```sql
-- Verificar
SELECT ur.*, p.email FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.profile_id
WHERE p.email = 'pedro@mundopropicio.com';
-- Se não existir, INSERT com role='admin'
```

**2.4 Migração de dados (executar `migrate-old-site-to-central` uma vez)**

Ordem:
1. Events (matching por slug; INSERT se não houver espelho)
2. Newsletter subscribers → `contacts` (matching por email, `source='import_old_site'`)
3. Blog posts (matching por slug)
4. Press clippings
5. Site content

**Validação:** contagens antes/depois batem; spot-check de 5 eventos manuais; logs sem erros.

**2.5 Repointing do site (no Lovable agent do projecto `mundopropicioweb`)**

Lovable agent atualiza:
- `.env` do projecto site:
  - `VITE_SUPABASE_PROJECT_ID=ukpuhoynrqobqtzdbysp`
  - `VITE_SUPABASE_URL=https://ukpuhoynrqobqtzdbysp.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY=...` (anon key do central)
- `src/integrations/supabase/types.ts` → regenerar com schema central
- Queries:
  - `from("events")` → `from("events_public")`
  - `from("newsletter_subscribers").insert(...)` → `from("lead_capture").insert(...)`
  - `rpc("get_event_redirect", ...)` → `from("events_public").select(...)` + `from("redirect_log").insert(...)`
  - `rpc("increment_event_redirect_clicks", ...)` → `from("redirect_log").insert({ ... })`
  - `from("blog_posts")` → `from("blog_posts_public")`
  - `from("press_clippings")` → `from("event_press_public")`
- Reescrita do `/admin`: operações de escrita passam a chamar edge function `admin-update-event` em vez de escrever directo via Supabase client

Após mudanças, Lovable agent publica em Test, valida, e depois Publish para Live (manual por Pedro).

**2.6 Testes de regressão**

- Home carrega eventos do central
- Programação carrega lista
- Newsletter signup escreve em `lead_capture`; catch-up cron processa em <5min para `contacts`+`leads`
- `/bilhetes/{slug}` redirecciona com query params preservados, regista em `redirect_log`
- `/admin` permite criar/editar/ocultar eventos
- Blog, press, sobre, contacto — todos funcionam

### Checkpoint Fase 2

Pedro testa fluxo completo end-to-end durante 48h em produção, com site novo apontando para central. Métricas Meta não regridem (CPM, CTR comparáveis). Sem regressões visuais. Sem perda de dados.

Se OK, `zjseklogascfwqjoocbl` passa a read-only. Mantido 30 dias como backup.

---

## Fase 3 — Página individual de evento (MVP médio)

### Objectivo
Implementar `/eventos/{slug}` conforme `mvp-spec.md`.

### Passos

**3.1 Rota e route handler TanStack**
- `src/routes/eventos/$slug.tsx`
- Loader SSR busca evento por slug em `events_public`, line-up em `event_lineups_public`, FAQ em `event_faqs_public`, press em `event_press_public`
- 404 se slug não existe ou `portal_visible=false`

**3.2 Meta tags dinâmicas**
- `<title>`, `<meta description>`, og:*, twitter:*, JSON-LD structured data
- Renderizadas server-side, presentes no HTML inicial

**3.3 Componentes UI**
- Hero com imagem + countdown
- Descrição rica
- Line-up grid + modal de bio
- FAQ accordion
- Localização com mapa embed
- Press carrossel
- Lead capture form (escreve em `lead_capture` com `event_slug`)
- Outros eventos relacionados
- Botão sticky mobile "Comprar bilhete"

**3.4 Pixel MP e CAPI**
- `ViewContent` no carregamento da página com `content_ids: [event_id]`
- `Lead` no submit do form
- `InitiateCheckout` no clique de "Comprar bilhete", antes do redirect
- Cada evento client-side disparado também via CAPI server-side (edge function `capi-meta-events`) com `event_id` único para dedup

**3.5 Backoffice estendido**
- `/admin` ganha gestão de hero/poster image, line-up CRUD, FAQ CRUD, venue URLs, toggles `portal_visible`/`portal_featured`, edição de campos bilingues

**3.6 Conteúdo inicial de 2-3 eventos**
- Pedro escolhe 2-3 eventos prioritários (sugestão: próximo evento grande + 1 ou 2 futuros) para preencher line-up, FAQ, press e validar o template real
- Restantes eventos continuam com info básica até serem enriquecidos um a um

### Checkpoint Fase 3

- 2-3 páginas de evento preenchidas e publicadas
- Partilha no WhatsApp / Facebook mostra og:image correcto (não logo genérico)
- Lighthouse Performance ≥ 85 mobile, SEO ≥ 95
- Pixel MP a disparar ViewContent / Lead / InitiateCheckout (verificável no Meta Events Manager)
- Lead capture específico de evento escreve em `lead_capture` com `event_slug` tagged
- Tráfego pago redireccionado para `/eventos/{slug}` em vez de directo para bilheteira

### Métricas a observar (30 dias após Fase 3)

Conforme `mvp-spec.md` Secção 8 — CTR, lead rate, bounce, time on page, CPM, og preview rate.

---

## Rollback — Lovable-aware

**Premissa crítica:** Lovable Publish e edge function deploys NÃO são git-based. "Git revert" do código NÃO reverte um deploy de edge function nem um Publish. Por isso, rollback envolve sempre **três acções coordenadas**, não uma só.

### Componentes do rollback

| Componente | Como rever |
|---|---|
| **1. Código frontend** (Lovable projecto) | Pedir ao agente Lovable para "rollback to commit X" ou aplicar diff inverso. Republish manual depois. |
| **2. Edge functions** | Redeploy explícito da versão anterior via `deploy_edge_functions` no agente Lovable, apontando a SHA conhecida. Não basta git revert. |
| **3. Schema SQL** | Aplicar SQL de reverse (cada migration deve ter o seu reverse documentado). Validar com `\d+ tabela` antes/depois. |

### Rollback Fase 1 (stack)

Sem mudanças de dados. Pedir ao Lovable agent para reverter o projecto à versão antes da migração de stack. Republish. Validar rotas.

### Rollback Fase 2 (Supabase)

Mais complexo — tem três componentes:

**a) Frontend (queries antigas + Supabase antigo):**
- Lovable agent reverte `.env` para credenciais de `zjseklogascfwqjoocbl`
- Reverte queries (`events_public` → `events`, `lead_capture` → `newsletter_subscribers` insert, etc.)
- Reverte `/admin` para escrita directa via Supabase client
- Republish

**b) Edge functions:**
- `process-lead-capture`, `process-redirect-log`, etc. ficam deployadas mas inactivas (sem invocações). Não causam dano.
- Se quiser limpar: redeploy de versão "no-op" ou desactivar cron jobs

**c) Schema SQL no central:**
- Tabelas novas (`contacts`, `leads`, `event_lineups`, `event_faqs`, `lead_capture`, `redirect_log`) **podem ficar** — não interferem com o ERP. Apagar só se for desejo expresso.
- Colunas adicionadas a `public.events` (`title_pt`, `slug`, etc.) podem ficar — são nullable e `portal_visible` default `false`.
- Views `*_public` podem ficar — não consumidas se site voltou ao Supabase antigo.

Dados migrados (eventos, contacts) ficam no central como sombra do estado pós-migração. **Não rebentam nada** — só não são lidos pelo site enquanto rollback estiver activo.

### Rollback Fase 3 (página de evento)

Mudança additive — basta esconder a rota `/eventos/{slug}` no frontend (ou retornar 404 condicional) e remover links do header/navegação que apontem para lá. Pedido ao Lovable agent.

Edge functions e dados criados ficam intactos.

### Documentação durante execução

Cada fase deve produzir:
- SHA do commit Lovable conhecido como "ponto bom" antes de cada mudança importante
- Lista de edge functions deployadas com SHA
- Lista de migrations SQL aplicadas (com SQL de reverse documentado)

Sem isto, rollback torna-se arqueologia. Documentar à medida que se executa, não no fim.

---

## Cleanup pós-Fase 3 (Fase 4 implícita)

30 dias após Fase 3 estável:
1. Snapshot final de `zjseklogascfwqjoocbl` (para arquivo)
2. Eliminar projecto Supabase `zjseklogascfwqjoocbl`
3. Eliminar imports/referências ao Supabase antigo no código
4. Documentar lessons learned em `docs/portal/post-mortem.md`

---

## Dependências externas

Nenhuma fase depende de bilheteiras. O email para as bilheteiras (`email-bilheteiras.md`) pode ser enviado em paralelo a qualquer fase, mas as respostas só impactam Fase 4+ (reconciliação de purchase via webhook/CAPI), fora do MVP.

## Comunicação interna

Antes de Fase 3 ir para produção, comunicar à equipa MP que toda a comunicação (orgânica e paga) deve passar a apontar para `/eventos/{slug}` em vez de directo para `/bilhetes/{slug}` ou para URL da bilheteira. Isto é mudança operacional que requer alinhamento de quem faz copy/criativo.

## Notas operacionais Lovable Cloud

- **SQL manual em Test não invalida tracking de Publish** — botão pode dizer "Up to date" mesmo com drift. Mitigação: aplicar mesma SQL em Live para minimizar drift de tracking.
- **`pg_net` timeout 5s** — não usar para CAPI; CAPI vai via edge function explícita (~18s timeout disponível).
- **Cron jobs definidos via SQL** (`cron.schedule`), não via UI. Documentar `jobid` para gestão futura.
- **Edge functions com `SECURITY DEFINER` chamadas por cron** precisam de auth dual-mode via `current_setting('request.jwt.claims',true)::jsonb ->> 'role'`.

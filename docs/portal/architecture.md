# Portal Público mundopropicio — Arquitectura (decisões + referências)

Este documento consolida a análise arquitetural do **novo projeto Lovable** para o portal público `www.mundopropicio.com`. O portal é um projeto Lovable separado do ERP, mas partilha o **Supabase externo `sfohvvlqccmmebvjgibx`** com o ERP (mesmas tabelas de eventos/leads/pixel). Os objetivos centrais que orientam todas as decisões são: **proteger os sinais de pixel/CAPI** (dedup correto, EMQ alto), **ganhar SEO/UX face às bilheteiras** (Ticketline, BOL, See Tickets, Fever) e **manter baixa manutenção para um operador solo** (Pedro), 100% dentro do fluxo Lovable. Cada secção decide, justifica e lista os spikes que faltam validar antes de gastar créditos Lovable.

**Estado: análise (NÃO é código de produção) · Data: 2026-06-04 · Branch: portal/architecture-analysis**

---

## Decisões num relance

| Tema | DECISÃO | Racional (1 linha) |
|---|---|---|
| **Rendering (§1)** | Manter **Vite SPA puro** + pre-render on-request nativo do Lovable + `react-helmet-async` por-rota | O SEO já está resolvido nativamente; SSG manual é custo de manutenção alto para problema já resolvido. |
| **Supabase externo (§2)** | Usar `sfohvvlqccmmebvjgibx` em **env-vars + cliente manual**, agente Lovable **cego ao schema** (sem Cloud, sem Native Integration) | Padrão já provado no ERP; impede o agente de gerar/aplicar DDL sobre a DB de produção partilhada. |
| **Admin (§3)** | **C → A**: arrancar em Supabase Studio (C), convergir para cartão no admin do ERP (A); rejeitar admin no portal (B) | Reaproveita auth/RBAC/`editor` do ERP; zero superfície admin no site público; baixa manutenção. |
| **Dedup CAPI — chave (§4)** | **`event_id` (server) === `eventID` (browser)** para o mesmo `event_name`, dentro de 48h; minted no browser | `fbp`/`external_id` são fallback/matching, não a chave; corrige o bug atual (`event_id = leads.id`). |
| **OG/rendering por-rota (§1)** | Cada página define `og:title`/`og:description`/`og:image` + `<title>` únicos via Helmet | Sem metadata por-rota o pre-render nativo não tem o que servir → unfurls genéricos. |

---

## 1. Stack de Rendering

### TL;DR — DECISION

**Manter Vite SPA puro (status quo Lovable) e confiar no pre-rendering on-request nativo do Lovable para crawlers, complementado por `og:`/`<title>` por-rota via `react-helmet-async`.** Não introduzir SSG manual (Vike/vite-ssg/entry-server) nem migrar para TanStack Start/Next/Astro. Justificação detalhada abaixo.

### O que o Lovable realmente entrega hoje (Junho 2026)

| Facto | Estado | Fonte |
|---|---|---|
| Projeto Lovable default **novo** (criado ≥ 13-Mai-2026) | **TanStack Start com SSR** por omissão (exceto Enterprise). Cada request devolve HTML renderizado | Lovable docs (SEO/GEO) |
| Projetos React + Vite **antigos** | **SPA** servido a humanos; **pre-render on-request** servido a crawlers verificados | Lovable docs (SEO/GEO) |
| Crawlers cobertos pelo pre-render | Google, Bing, social-preview bots, e motores AI (ChatGPT, Perplexity, Claude, Gemini) | Lovable docs (SEO/GEO) |
| OG / unfurl social | Coberto **se** cada rota definir `og:title`/`og:description`/`og:image` únicos (Helmet) | Lovable docs (SEO/GEO) |
| Suporte nativo a `vite-plugin-ssg`/Vike/`vite-react-ssr` | **Não documentado / não nativo.** Lovable não expõe SSG como modo suportado | (ausência em docs) |
| Agente Lovable a editar setup SSG manual | **Não documentado** — gap reconhecido nas próprias guias da comunidade | davidkloeber.com |

**Nuance crítica para a decisão:** o ERP existente é um projeto **antigo** (Vite 5.4.19 SPA, react-router 6.30, `vite-plugin-pwa` 1.2, `lovable-tagger` — confirmado em `package.json` e `vite.config.ts`). Um portal **novo** criado agora no Lovable já nasce, por omissão, em **TanStack Start SSR** — ou seja, a pergunta "preciso de SSG manual para SEO?" pode estar resolvida na origem, *sem* deixar o Lovable.

> **Unknown #1 (precisa de SPIKE):** o briefing pede explicitamente "Vite/React/Tailwind/shadcn". Se o portal for criado como projeto novo, o default de Junho/2026 é TanStack Start (não Vite SPA). É preciso confirmar se o Lovable ainda permite *optar* por um template Vite SPA, ou se "novo projeto" = TanStack Start obrigatório. Ver SPIKE A.

### O agente Lovable luta contra setups SSG/Vike?

- Não há documentação oficial que confirme que o agente preserve um `build-ssg.mjs` / `entry-server.tsx` / `hydrateRoot` à custom entre edições. As guias da comunidade que implementam SSG manual **omitem** explicitamente este ponto — é um risco não medido.
- Pain points reportados em SSG manual sobre Lovable: polyfills de browser API (localStorage/window) a rebentar o build SSR; múltiplos `HelmetProvider` a partir metadata; animações on-scroll a esconder conteúdo no HTML estático. Tudo isto exige "várias iterações para acertar" — o oposto do objetivo *low-maintenance solo*.
- Risco concreto: o agente Lovable gera código assumindo `createRoot`/SPA. Um setup que troca para `hydrateRoot` + build script custom fica **fora do mental model do agente**, aumentando a probabilidade de regressões silenciosas a cada prompt do Pedro.

### Comparação das 5 opções

| Opção | SEO/OG quality | Maintenance (solo Pedro + agente Lovable) | Iteração do agente Lovable | Effort / Risk |
|---|---|---|---|---|
| **(a) Vite SPA puro** (status quo) + Helmet por-rota | **Bom** — pre-render on-request nativo serve HTML real a Google/Bing/social/AI bots | **Muito baixo** — zero infra custom; agente opera no seu modo nativo | **Excelente** — caminho "feliz" do agente | **Mínimo** / Baixo (depende de o pre-render nativo cobrir bem OG — ver SPIKE B) |
| **(b) Vite + SSG seletivo** (event/blog pages) | **Excelente** — HTML estático garantido, independente de crawler-detection | **Alto** — `build-ssg.mjs`, polyfills, hydrate; quebra subtil a cada redeploy | **Fraca** — agente fora do mental model; risco de regressão | **Alto** / Médio-Alto |
| **(c) Vite + SSR runtime** | **Excelente** | **Médio-Alto** — runtime server a manter; não é o modo nativo de um projeto Vite antigo | **Fraca-Média** | **Alto** / Alto (custom no Lovable) |
| **(d-TanStack Start)** (novo default Lovable) | **Excelente** — SSR real, HTML em todos os requests | **Baixo** — é o caminho **suportado** pelo Lovable agora | **Boa** — é o default do agente em projetos novos | **Baixo-Médio** / Baixo (mas não é "Vite SPA" do briefing) |
| **(d-Next.js / Astro fora do Lovable)** | **Excelente** (Astro é ideal p/ event+blog estático) | **Alto** — perde o workflow Lovable; Pedro deixa de orquestrar via agente | N/A (sai do Lovable) | **Muito Alto** / Alto (contraria a memória "ficar no Lovable Cloud") |

> Opção (d-Next/Astro) é descartada por princípio: a decisão arquivada em memória é **permanecer no Lovable Cloud** até 500+ promotores / >$5M ARR. Sair quebra todo o modelo operacional solo do Pedro.

### Porquê (a) e não (b)/(d-TanStack)

1. **O SEO já está resolvido nativamente.** O pre-render on-request do Lovable serve HTML real exatamente aos agentes que importam (Google, Bing, social unfurl, AI search). A justificação histórica para SSG manual — "o crawler vê página vazia" — **deixou de ser verdade** em projetos Lovable. Implementar SSG manual seria pagar custo de manutenção alto para resolver um problema já resolvido.
2. **A superfície é pequena.** Um punhado de páginas de evento + blog. Não há a escala que justifique a complexidade de um pipeline SSG/SSR custom.
3. **Low-maintenance solo é o objetivo nº1.** (a) mantém o Pedro 100% no fluxo nativo Claude Code → push → Lovable apply, sem nenhum artefacto (`build-ssg.mjs`, polyfills, `hydrateRoot`) que o agente possa partir num prompt futuro.
4. **TanStack Start (d) é o fallback forte, não o default.** Se o SPIKE A mostrar que um projeto novo nasce em TanStack Start de qualquer forma, **aceitar esse default** é melhor do que forçar Vite SPA + SSG manual — ganha-se SSR real *dentro* do suporte oficial. Mas isso desvia-se do "Vite/React" pedido, por isso fica como decisão condicional ao SPIKE.

**Regra de OG obrigatória (qualquer caminho):** cada página de evento/blog define `og:title`, `og:description`, `og:image` e `<title>` únicos via `react-helmet-async` por-rota. Sem isto, o pre-render nativo não tem metadata para servir e os unfurls ficam genéricos.

> **Nota de consistência (§1 ↔ §5):** esta secção decide Vite SPA + pre-render. A secção 5 (i18n/hreflang) depende criticamente de o pre-render incluir **também** as tags `<link rel="alternate" hreflang>` no snapshot — não só `og:`/`<title>`. Isto é um *unknown* não confirmado pelas docs (SPIKE D em §5). Se o pre-render não incluir hreflang, o argumento a favor de aceitar o default **TanStack Start SSR** (que emite estas tags nativamente em cada request) fica reforçado. As duas secções não se contradizem; partilham a mesma dependência e o mesmo fallback condicional.

### Unknowns / SPIKES

- **SPIKE A — Template de projeto novo.** Criar um projeto Lovable de teste *hoje* e confirmar: (i) o default é TanStack Start SSR? (ii) ainda há opção de template "Vite SPA"? Decide se a DECISION fica em (a) Vite SPA ou migra para o default TanStack Start. *Esforço: 30 min.*
- **SPIKE B — Validar o pre-render nativo end-to-end.** Publicar uma página de evento no domínio Lovable e testar com: Google Rich Results Test, Facebook Sharing Debugger, e `curl -A "facebookexternalhit"` / `curl -A "Googlebot"`. Confirmar que devolve HTML com `og:` corretos e conteúdo do evento (não a shell SPA). Mede se (a) é suficiente *sem* SSG. *Esforço: 1h.*
- **SPIKE C — Persistência sob agente.** Se SPIKE B falhar e SSG manual virar necessário: fazer 5 prompts típicos do Pedro num projeto com `build-ssg.mjs` e medir quantas vezes o agente quebra o build SSR. Quantifica o custo real de (b). *Esforço: 2h.*
- **Unknown não verificável:** a fiabilidade/SLA do crawler-detection do Lovable (ex.: tratamento de social bots menos comuns, WhatsApp/Discord unfurl, latência do render on-request). Não há números públicos — só mensurável via SPIKE B em produção.

### Sources

- Lovable — Optimize your app for SEO and AI search (rendering default, TanStack Start ≥13-Mai-2026, pre-render on-request, crawlers cobertos, OG): https://docs.lovable.dev/tips-tricks/seo-geo
- David Kloeber — "How I Made Lovable SEO-Friendly with SSG" (abordagem SSG manual: `entry-server.tsx`, `build-ssg.mjs`, `hydrateRoot`, Helmet; pain points): https://davidkloeber.com/articles/lovable-ssg-seo-guide
- Vike (ex vite-plugin-ssr) — Render Modes (SPA/SSR/SSG/HTML-only): https://vite-plugin-ssr.com/render-modes
- Vite — Server-Side Rendering guide: https://vite.dev/guide/ssr
- Vite Discussion #18130 — prerendering React at build time para SSG: https://github.com/vitejs/vite/discussions/18130
- Meta — Conversions API (relevante para a estratégia de sinais do pixel, secção subsequente): https://developers.facebook.com/docs/marketing-api/conversions-api
- Repo verificado: `/Users/pedroneto/Documents/mundopropicio/package.json` e `/Users/pedroneto/Documents/mundopropicio/vite.config.ts` (Vite 5.4.19 SPA + react-router 6.30 + vite-plugin-pwa 1.2 + lovable-tagger)

---

## 2. Conexão a Supabase Externo (sfohvvlq) sem Lovable Cloud

### 2.1 Resposta curta (DECISÃO)

**DECISÃO: o portal usa o Supabase partilhado (`sfohvvlqccmmebvjgibx`) em modo "env-vars + cliente escrito à mão", SEM `enable_database` / Lovable Cloud e SEM a Native Supabase Integration do Lovable.** O agente Lovable é tratado como um *frontend builder cego ao schema*: nunca corre DDL, nunca gera migrations, nunca gere RLS. Todo o schema/RLS/cron vive e é aplicado *fora* do Lovable (SQL Editor do Supabase, operado pelo Pedro), exatamente como já acontece no ERP.

Justificação: este padrão já está **provado no próprio repo do ERP** — `src/integrations/supabase/client.ts` faz apenas `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)` e o projeto vive feliz sem que o agente "administre" a base de dados. Replicar isto no portal é o caminho de menor risco e menor manutenção para um operador solo.

### 2.2 Dá para usar Supabase externo só com env vars + cliente manual?

**Sim.** Há dois caminhos distintos no Lovable, e eles confundem-se na documentação:

| Caminho | O que faz | Agente toca no schema? | Recomendado p/ portal |
|---|---|---|---|
| **Lovable Cloud** (`enable_database`) | Provisiona um Supabase *gerido pelo Lovable*; o agente tem MCP/credenciais para correr DDL e migrations | **Sim, ativamente** | ❌ Não — mutaria infra partilhada com o ERP |
| **Native Supabase Integration** (Settings → Connectors → Supabase, cola URL + anon key) | Liga um Supabase *teu*; o agente passa a "auto-generate schema" e propõe/aplica SQL snippets | **Sim** (gera schema, propõe RLS, sugere SQL para correr) | ⚠️ Arriscado — convida o agente a gerar DDL para a DB do ERP |
| **Env-vars + cliente manual** (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` + `client.ts` escrito à mão) | O Supabase é só uma API HTTP a partir do ponto de vista do front; o agente vê código React, não vê a DB | **Não** (não tem ligação privilegiada à DB) | ✅ **Sim** |

O env-vars-only **não está documentado oficialmente** como "modo suportado" — a doc do Lovable só descreve Cloud e Native Integration. Mas é mecanicamente trivial e está validado in-house (ver `client.ts` do ERP). É o equivalente a usar `@supabase/supabase-js` em qualquer app Vite.

> Nota factual: a anon/publishable key é, por design, pública (vai no bundle do browser). A segurança **não** vem de esconder a key — vem de RLS no Postgres (ver 2.4). A `service_role` key **nunca** entra no projeto Lovable; vive só nas Edge Functions (`process-lead-capture`, `process-redirect-log` já usam `SUPABASE_SERVICE_ROLE_KEY` server-side).

### 2.3 Limitações / riscos conhecidos com Supabase externo

Quando o Lovable está ligado a um Supabase externo (Native Integration) ou só "vê" um cliente Supabase, o agente tende a:

- **"Auto-generate the necessary database schema"** — a própria doc do Lovable diz que ele *produz SQL para criar tabelas/colunas*. Com a Native Integration ele propõe e por vezes aplica.
- **Gerar RLS "básico" e frágil** — auditorias externas reportam que **~10% das apps Lovable analisadas tinham RLS contornado**: políticas em falta, `views` sem `security_invoker = true` (bypass silencioso de RLS), tabelas criadas com RLS *off* por default.
- **Halucinar comandos de CLI/migrations** que não existem, ou criar migrations que não consegue aplicar numa DB que não controla.
- **Confundir-se quando não há Cloud** — sem MCP/credenciais, ele ainda tenta "ajudar" escrevendo SQL no chat, o que é inofensivo *desde que ninguém o aplique cegamente*.

O risco real para o portal **não é** o agente corromper a DB sozinho (sem Cloud/Native-Integration ele não tem como aplicar DDL) — **é** o agente *gerar SQL plausível que o Pedro aplique por inércia*, mutando o schema do ERP. A mitigação é processual + arquitetural (2.5).

Este risco é agravado pela **situação split-brain já documentada na memória/repo**: `INTEGRATIONS.md` lista o ref `sfohvvlqccmmebvjgibx` (frontend publicado) enquanto `supabase/config.toml` aponta `ukpuhoynrqobqtzdbysp` (ops do Pedro). **UNKNOWN crítico:** é preciso confirmar empiricamente qual ref hospeda as tabelas `lead_capture`/`redirect_log` e o pixel/CAPI *antes* de cablar o portal (ver Spikes).

### 2.4 Estratégia de acesso à DB do ERP (mínima fricção, zero risco de mutar schema)

O portal **não faz CRUD no ERP**. Faz só duas coisas:

**(a) ESCREVER ingestão (lead/redirect)** — append-only, em tabelas-buffer dedicadas:

- O portal **insere** em `public.lead_capture` (captura de leads/consentimento) e `public.redirect_log` (cliques de redirect → ticketing). Estas tabelas já existem como *staging* e são consumidas por cron (`process-lead-capture`, `process-redirect-log`, agendados a cada minuto em `supabase/manual/portal_cron_jobs.sql`), que usam `service_role` para escrever em `contacts`/`leads`/`events`. **O portal nunca toca nessas tabelas-core diretamente.**
- RLS para o `anon`: **`INSERT`-only, sem `SELECT`/`UPDATE`/`DELETE`**. O portal escreve mas não consegue reler nem mutar. Exemplo de política (aplicada *manualmente* no SQL Editor, não pelo agente):

  ```sql
  -- aplicado FORA do Lovable
  alter table public.lead_capture enable row level security;
  create policy "portal_anon_insert_only"
    on public.lead_capture for insert to anon with check (true);
  -- sem policy de SELECT/UPDATE/DELETE => anon não lê/altera nada
  ```

**(b) LER conteúdo público** (eventos, datas, preços para SEO/listagens) — duas opções:

| Opção | Como | Trade-off |
|---|---|---|
| **B1 — `SELECT` RLS restrito** (read-only) | Política `for select to anon using (status = 'published' and is_public = true)` numa *view* ou nas colunas mínimas de `events` | Direto, mas expõe a tabela `events` ao anon; exige RLS cuidado e `security_invoker` em views |
| **B2 — Edge Function read-only** (preferida) | Portal chama uma function (`GET /portal-events`) que devolve JSON curado; `anon` **não tem SELECT** em tabela nenhuma | Mais código, mas superfície mínima, cacheável (CDN/SSG), e desacopla o schema do ERP do contrato público |

**DECISÃO para leitura: B2 (Edge Function read-only) para dados de catálogo**, com fallback a B1 só se a latência/manutenção do function provar excessiva (SPIKE). B2 alinha com o goal de proteger sinais e baixa manutenção: o contrato público fica estável mesmo que o schema do ERP mude.

Tabelas/recursos que o portal toca:

| Recurso | Operação portal | Mecanismo | RLS anon |
|---|---|---|---|
| `lead_capture` | INSERT | cliente supabase-js | insert-only |
| `redirect_log` | INSERT | cliente supabase-js | insert-only |
| eventos públicos | READ | Edge Function `portal-events` (B2) | nenhum SELECT direto |
| `contacts`/`leads`/`events`/pixel | **nenhum** | só cron + service_role | sem acesso anon |

### 2.5 Como instruir o agente a NUNCA correr DDL (Project Knowledge)

Colocar no **Project Knowledge** do *novo* projeto Lovable do portal (bloco verbatim, em PT, no topo):

> **REGRAS DE BASE DE DADOS — INVIOLÁVEIS**
> 1. Este projeto liga-se a um Supabase EXTERNO partilhado com o ERP de produção via `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. **NÃO** ativar Lovable Cloud nem a Native Supabase Integration.
> 2. **NUNCA** gerar, propor ou aplicar DDL: nada de `CREATE/ALTER/DROP TABLE`, `CREATE POLICY`, migrations, `supabase db ...`, ou ficheiros em `supabase/migrations/`. O schema e o RLS são geridos manualmente pelo Pedro fora do Lovable.
> 3. O `client.ts` em `src/integrations/supabase/` é escrito à mão e read-mostly. Só usar `.from('lead_capture').insert(...)`, `.from('redirect_log').insert(...)`, e funções `supabase.functions.invoke('portal-events')`. **Nenhuma** outra tabela.
> 4. **NUNCA** usar a `service_role` key no frontend. Se faltar acesso, criar/editar uma Edge Function — não relaxar RLS.
> 5. Se uma tarefa parecer exigir mudança de schema, **PARA e pergunta ao Pedro**. Não escrevas SQL "para ele aplicar".

Defesas-em-profundidade que tornam a regra robusta (porque "instruir o agente" não basta):

- **Não ligar a Native Integration nem o Cloud** → o agente fica sem credenciais para aplicar DDL (só pode escrever SQL no chat, que é inerte).
- **Replicar o padrão do ERP**: ficheiros que o Pedro quer fora do alcance do auto-apply vivem em `supabase/manual/` e **não** em `supabase/migrations/` — o repo já faz isto explicitamente (`portal_cron_jobs.sql` traz o aviso *"vive em supabase/manual/ … para o Lovable não o auto-aplicar no push"*). Repetir esta convenção no portal.
- **RLS é o backstop real**: mesmo que o agente gerasse uma query maliciosa, o `anon` só tem `INSERT` em duas tabelas-buffer. A DB do ERP é protegida pelo Postgres, não pela boa-vontade do agente.
- **Git como tripwire**: rever qualquer diff que toque `supabase/` antes de aplicar (já é hábito documentado do Pedro: *verificar schema antes de push*).

### Unknowns / Spikes

- **SPIKE-1 (bloqueante — ref correto):** confirmar empiricamente em qual projeto (`ukpuho…` vs `sfohvvlq…`) vivem `lead_capture`, `redirect_log` e o pixel/CAPI. Método: `supabase` query/REST a ambos os refs com a anon key e listar tabelas; cablar o portal só ao ref confirmado. Sem isto, o split-brain pode levar o portal a escrever no projeto errado.
- **SPIKE-2 (env-vars-only suportado?):** verificar que um projeto Lovable *novo*, com cliente manual e SEM Native Integration/Cloud, faz build+deploy sem o agente reintroduzir a integração ou exigir Cloud. Método: criar projeto de teste, colar `client.ts`, pedir uma página que faça `insert` em `lead_capture`, observar se o agente tenta "connect Supabase". Risco: o agente pode forçar a Native Integration ao detetar `@supabase/supabase-js`.
- **SPIKE-3 (leitura B2 vs B1):** medir latência/cold-start de uma Edge Function `portal-events` vs `SELECT` direto com RLS, para listagens de SEO (que querem ser rápidas/SSG). Decide se B2 aguenta o caminho de catálogo ou se partes vão para B1.
- **UNKNOWN:** a doc oficial do Lovable não confirma o modo "env-vars-only" como suportado/estável a longo prazo; pode mudar com updates do agente. Mitigação: o cliente manual é Supabase-padrão e migra para qualquer host se o Lovable mudar de comportamento.

### Sources

- Lovable — Connect to Supabase: https://docs.lovable.dev/integrations/supabase
- Lovable — Supabase Integration (overview): https://lovable.dev/supabase-integration
- Supabase blog — "AI Agents Know About Supabase. They Don't Always Use It Right." (RLS bypass, hallucinated CLI, views sem `security_invoker`): https://supabase.com/blog/supabase-agent-skills
- Supabase Docs — AI Prompt: Create RLS policies: https://supabase.com/docs/guides/getting-started/ai-prompts/database-rls-policies
- Vibe App Scanner — Supabase RLS common mistakes / ~10% das apps com RLS contornado: https://vibeappscanner.com/supabase-row-level-security
- Migração Lovable Cloud → Supabase (diferença Cloud vs self-managed): https://dzone.com/articles/migration-from-lovable-cloud-to-supabase-1
- Meta — Conversions API (sinais server-side, contexto de proteção do pixel): https://developers.facebook.com/docs/marketing-api/conversions-api
- Repo (read-only, verificado): `src/integrations/supabase/client.ts` (padrão env-vars), `.env` (`VITE_SUPABASE_*`), `supabase/functions/process-lead-capture/index.ts` e `process-redirect-log/` (consumo service-role), `supabase/manual/portal_cron_jobs.sql` (convenção manual/ fora de migrations), `INTEGRATIONS.md` (split-brain de refs)

---

## 3. Admin do Portal

O portal público (`www.mundopropicio.com`) precisa de gerir quatro tipos de conteúdo: **eventos** (já existem no ERP, partilham a tabela `events`), **`blog_posts`** e **`press_clippings`** (tabelas recém-criadas, ainda **sem UI** em lado nenhum) e **contactos de newsletter** (captados pelo próprio portal). A questão é onde vive o painel que o Pedro usa para os editar.

### 3.1 O que já existe no ERP (ponto de partida)

Levantamento feito no repo (`/Users/pedroneto/Documents/mundopropicio`):

| Aspeto | Como está implementado | Ficheiro |
|---|---|---|
| CRUD de eventos | Modal + `<form>` React, escrita direta via `supabase.from("events").insert(...)` com React Query (`useMutation`) | `src/pages/Events.tsx` |
| Gating de escrita | `{(isAdmin \|\| isManager) && <botão Novo Evento>}` no cliente; RLS no servidor | `src/pages/Events.tsx:511` |
| RBAC | Enum `app_role` (admin, manager, **editor**, producer, viewer, …) em `user_roles`; função SQL `has_role(uid, role)` usada nas policies RLS | `src/contexts/AuthContext.tsx`, migrations `20260514131452_*`, `20260406190939_*` |
| Multi-tenant | `company_id` em ~130 migrations; `has_role` é tenant-aware (`platform_admin` global) | migrations |
| Hub de admin | Grelha de cartões que faz `navigate()` para `/admin/*` | `src/pages/AdminPanel.tsx` |
| Conteúdo do portal | **Não existe UI** para `blog_posts` nem `press_clippings`; tabelas criadas direto no Supabase, ainda fora das migrations do repo | — |

Pontos relevantes para a decisão:
- Já existe o papel **`editor`** ("Editor") no enum e em policies RLS de algumas tabelas — ou seja, o modelo de "editor de conteúdo com poderes reduzidos" **já está meio construído** e pode ser reaproveitado sem inventar RBAC novo.
- O padrão de escrita é "client chama `supabase.from()` direto + RLS protege". Não há uma camada de API própria; a segurança vive **inteiramente nas policies RLS**. Isto é o facto mais importante para avaliar a exposição do portal.

### 3.2 As três opções

**Opção A — Estender o admin do ERP (MP Gestão Eventos).** Um único admin (o ERP), dois frontends de consumo (ERP interno + portal público). O Pedro entra no ERP, vai a uma secção nova "Portal / Conteúdo" e edita blog/clippings/eventos lá. O portal público é **read-only** sobre as mesmas tabelas.

**Opção B — Admin dedicado dentro do projeto do portal.** O novo projeto Lovable inclui rotas `/admin/*` próprias, com login Supabase Auth, e faz CRUD de `blog_posts`/`press_clippings`/eventos diretamente.

**Opção C — Sem admin; Supabase Studio (Table Editor) temporariamente.** O Pedro edita linhas à mão no dashboard do Supabase. Zero código.

### 3.3 Trade-offs

| Critério | A — Estender ERP | B — Admin no portal | C — Supabase Studio |
|---|---|---|---|
| **Esforço de dev** | Médio. Reaproveita auth, layout, padrões de form, React Query. Só faltam ~3 forms (blog, clippings, newsletter view). | Alto. Reconstruir auth-guard, RBAC, layout admin, forms — tudo de novo num projeto greenfield. | **Zero.** |
| **Reuso de auth/RBAC** | **Total.** `user_roles`, `has_role()`, papel `editor` já existem. Nenhuma policy nova de login. | Parcial. Mesmo backend Auth, mas guards de rota e mapeamento de papel reescritos no portal. | N/A (usa credenciais do dashboard Supabase do Pedro). |
| **Exposição de segurança do portal público** | **Mínima.** Nenhum código admin, nenhuma rota privilegiada, nenhuma `service_role` key no bundle público. Portal só lê. Superfície de ataque do site público = leitura. | **Maior.** O bundle do site mais visado da empresa passa a conter rotas `/admin`, lógica de escrita e gating client-side. Erro de RLS num form exposto publicamente vaza/corrompe dados. Convida brute-force de login na origem pública. | Mínima no portal (não toca no site). O risco move-se para o dashboard Supabase (acesso humano). |
| **UX de edição p/ Pedro** | **Boa.** Ambiente familiar do ERP, validações, selects de cidade/venue já feitos, toasts. Operador único, contexto único. | Boa a médio prazo, mas só depois de construído. | **Má.** Editar JSON/colunas à mão, sem validação, sem preview, sem upload de imagem amigável, fácil corromper. Aceitável para 2–3 registos, não para blog recorrente. |
| **Time-to-first-content** | Dias (precisa dos forms). | Semanas (precisa do admin inteiro). | **Imediato (hoje).** |
| **Manutenção a longo prazo** | **Baixa.** Um só sítio para autenticar, um só sítio para corrigir RBAC, um só agente Lovable a orquestrar conteúdo + ERP. Alinha com a memória "1 admin, low-maintenance solo operator". | Alta. Dois admins, dois fluxos de auth, duplicação de guards, dois projetos Lovable a manter sincronizados sobre o mesmo schema. | Baixa em código, mas alta em risco operacional (sem trilho de auditoria amigável, erros manuais). |

### 3.4 Riscos transversais (independentes da opção)

- **RLS é a única fronteira.** Como o padrão é escrita client-direta, `blog_posts`/`press_clippings`/`newsletter_contacts` **têm de** ter policies RLS: `SELECT` público anónimo apenas para conteúdo publicado (ex.: `published = true`), e `INSERT/UPDATE/DELETE` restrito a `has_role(auth.uid(),'admin'|'editor')`. Sem isto, qualquer opção é insegura. `newsletter_contacts` em particular: `INSERT` anónimo permitido (captura de email no portal) mas **`SELECT` negado a anónimos** (senão a lista de emails é pública). Confirmar que estas policies existem é pré-requisito de qualquer caminho — ver "Unknowns / spikes".
- **`company_id` nas tabelas novas.** Se `blog_posts`/`press_clippings` herdarem o padrão multi-tenant, precisam de `company_id` default = MP, senão a Opção A (que assume contexto de empresa via `current_company_id()`) pode não as ver. Se forem single-tenant (provável, é o site institucional da MP), simplifica — mas tem de ser decidido explicitamente.
- **Chaves no portal.** O portal público **nunca** deve embeber a `service_role` key (só `anon`/publishable). Isto é trivial na Opção A (o portal nem escreve) e uma armadilha fácil de cair na Opção B.

### 3.5 RECOMENDAÇÃO — caminho faseado C → A

**DECISÃO: começar em C (agora) e convergir para A (destino). Rejeitar B.**

**Justificação:**
1. **B contradiz o objetivo central** "proteger sinais / baixa manutenção para operador solo". Colocar um admin no site público é a opção de maior superfície de risco e maior custo de manutenção, para zero ganho de UX face a A — o Pedro é uma só pessoa, não precisa de editar conteúdo a partir do domínio público. A separação "1 admin (ERP) + N frontends de leitura" é arquiteturalmente mais limpa e é a que a memória do projeto já assume.
2. **A reaproveita quase tudo:** o papel `editor` já existe, o `has_role()` já existe, os padrões de form do `Events.tsx` são copiáveis, o `AdminPanel.tsx` é literalmente uma grelha de cartões à espera de mais um cartão ("Portal / Conteúdo"). O custo marginal é baixo e o agente Lovable do ERP já conhece estes padrões.
3. **C compra time-to-first-content sem dívida técnica de código:** enquanto os forms de A não existem, o Pedro pode publicar os primeiros posts/clippings via Supabase Studio **hoje**, desde que as policies RLS estejam corretas. C não cria nada que depois se deite fora — é só ausência de UI.

**Fases concretas:**

| Fase | Quando | O quê |
|---|---|---|
| **C — agora** | Imediato | Garantir RLS correto nas 3 tabelas (publicado-público em leitura; escrita só admin/editor; newsletter insert-anónimo/select-negado). Pedro publica os primeiros registos via Table Editor. Portal lê. |
| **A.1** | Primeira sprint do portal | Adicionar cartão "Conteúdo do Portal" no `AdminPanel.tsx` → rotas `/admin/portal/blog` e `/admin/portal/clippings`, com forms estilo `Events.tsx` (modal + React Query + toasts), gated por `isAdmin \|\| hasPermission('editor')`. Vista read-only de `newsletter_contacts` com export CSV. |
| **A.2** | Conforme volume de blog cresce | Upload de imagem (Supabase Storage), rascunho/publicado, slug/SEO meta (liga à secção de SEO do portal), preview. |

**Eventos** ficam sempre geridos no ERP (Opção A por omissão) — já lá estão; o portal apenas os consome em modo leitura. Não duplicar o CRUD de eventos no portal em circunstância nenhuma.

### 3.6 Unknowns / spikes

- **UNKNOWN: as policies RLS de `blog_posts`/`press_clippings`/`newsletter_contacts`.** As tabelas foram criadas direto no Supabase e **não estão nas migrations do repo** (confirmado: `grep` em `supabase/migrations` não as encontra), por isso não consigo verificar se têm RLS, nem que policies. Isto é load-bearing para todas as opções.
  - **SPIKE 1 (bloqueante, <30 min):** no Supabase (ref `sfohvvlqccmmebvjgibx`), correr `SELECT relrowsecurity FROM pg_class WHERE relname IN ('blog_posts','press_clippings','newsletter_contacts')` e listar `pg_policies` das três. Validar com a `anon` key: (a) `SELECT` em blog publicado funciona anónimo; (b) `SELECT` em `newsletter_contacts` é **negado** anónimo; (c) `INSERT` de escrita em blog é **negado** anónimo. Tirar print do resultado para o `architecture.md`.
- **UNKNOWN: single-tenant vs multi-tenant nas tabelas novas** (têm `company_id`? default?). Resolve-se na mesma SPIKE 1 inspecionando o schema das colunas.
- **UNKNOWN: qual dos dois backends Supabase é o "Live" do portal.** A memória do projeto regista um *split-brain* documentado entre `ukpuhoynrqobqtzdbysp` e `sfohvvlqccmmebvjgibx`. A tarefa fixa o portal em `sfohvvlqccmmebvjgibx`, mas **confirmar por projeto, nunca assumir** — verificar que é nesse ref que as 3 tabelas existem antes de escrever qualquer policy.
- **UNKNOWN (Lovable): partilha de projeto Supabase externo entre dois projetos Lovable.** A documentação confirma que um projeto Lovable se conecta a um Supabase externo, mas não verifiquei o comportamento de **dois** projetos Lovable a apontar para o **mesmo** schema (risco de o agente de um projeto gerar migrations que colidam com o outro). Reforça a escolha de A (um só projeto-admin sobre o schema) e desaconselha B.
  - **SPIKE 2 (opcional):** confirmar na doc/UI Lovable se desligar a geração de migrations no projeto-portal (mantendo-o read-only) é suportado, para o portal nunca escrever schema.

### Sources

- Repo (read-only): `src/pages/Events.tsx`, `src/pages/AdminPanel.tsx`, `src/contexts/AuthContext.tsx`, `supabase/migrations/20260514131452_*.sql`, `supabase/migrations/20260406190939_*.sql` — `/Users/pedroneto/Documents/mundopropicio`.
- Supabase Row Level Security (modelo de segurança que sustenta o padrão client-direto): https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase — papéis `anon` vs `service_role` e exposição de chaves no cliente: https://supabase.com/docs/guides/api/api-keys
- Lovable docs — conexão a Supabase / Lovable Cloud: https://docs.lovable.dev
- Padrão de RBAC custom claims / `has_role` (referência de design): https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
- Memória do projeto: split-brain dos dois backends Supabase (`project_two_supabase_backends.md`) e "1 admin, low-maintenance solo operator" (`project_lovable_cloud_permanent.md`).

---

## 4. Meta CAPI Dedup (Client + Server)

The portal must fire the Meta Pixel **client-side** (browser) and replay the *same* conversions **server-side** via CAPI, so that signal survives ad-blockers / iOS ITP while Meta still counts each user action **once**. This section specifies the exact dedup contract, mapped against the code that already exists in this repo.

> **DECISION (load-bearing):** The dedup key is **`event_id` (server) === `eventID` (browser pixel)** for the *same* `event_name`, both fired within Meta's **48-hour** window. `fbp` / `external_id` are a *fallback* dedup net and the *user-matching* signal — **not** the primary dedup key. Everything below is built around making those two IDs identical.

### 4.1 What the existing code already does (ground truth)

Read from this repo (these are the real, deployed processors):

- **`capi-meta-events/index.ts`** — thin Graph v25.0 wrapper. Sends `data[0] = { event_name, event_time, event_id, event_source_url, action_source:"website", user_data, custom_data }` + `access_token`. It forwards whatever `event_id` it is given; it does **not** generate one. It does **no** hashing (caller pre-hashes).
- **`process-lead-capture/index.ts`** — cron (1 min) drains `public.lead_capture`, upserts `contacts`, inserts `leads`, then fires CAPI **`Lead`** with **`event_id = leadId`** (the freshly-inserted `leads.id`), `event_source_url = https://www.mundopropicio.com/eventos/{slug}`, `user_data = { em:[sha256], ph:[sha256], fbc, fbp, client_ip_address, client_user_agent }`.
- **`process-redirect-log/index.ts`** — cron (1 min) drains `public.redirect_log` (anonymous clicks → ticketing), inserts an anonymous `leads` row, fires CAPI **`InitiateCheckout`** with **`event_id = leadId`**, `user_data = { fbc, fbp, ip, ua }`.

Schema (per the in-file comments, "verificado em Live" — these tables are **not** in `supabase/migrations/` locally; they were created via Lovable on the shared external project, so the comments are the authoritative source — see Unknowns):

- `lead_capture`: `email, phone, name, nationality, consent_email, consent_whatsapp, event_slug, source, utm_*, fbc, fbp, ip_inet, user_agent, raw(jsonb), processed, processed_at, processing_error, created_at`
- `redirect_log`: `event_slug(NOT NULL), utm_*, mp_click_id, ip_inet, user_agent, referrer, fbc, fbp, processed, processed_at, created_at`
- `leads`: `company_id, contact_id, event_id, kind, source, utm_*, mp_click_id, ip_inet, user_agent, fbc, fbp, meta(jsonb), created_at`

> ⚠️ **CRITICAL BUG in the current design — the dedup is broken today.** The server uses **`event_id = leads.id`**, a UUID minted *server-side, ~1 min after the click*, inside the cron. The browser pixel has **no way to know that UUID**, so the client `eventID` can never equal the server `event_id`. Per Meta's spec, dedup **requires the same `event_id` on both channels** → today every portal conversion is **double-counted** (or, worse, the weaker fallback path silently degrades). The fix is mandatory and is the core of this section: **the browser must generate the `event_id` and the server must persist & reuse it instead of `leads.id`.**

### 4.2 The corrected dedup flow

```
Browser (portal, Lovable/Vite)                         Server (Supabase edge, cron)
──────────────────────────────                         ─────────────────────────────
1. on event-page load / submit:
   eid = crypto.randomUUID()
   et  = Math.floor(Date.now()/1000)   ── event_time (seconds, UTC)
2. fbq('track', 'Lead', {...}, { eventID: eid })
3. POST to capture endpoint, body includes:
   { event_id: eid, event_time: et, fbp, fbc,
     mp_click_id, email, phone, event_slug, utm_* }
                                            ──────────▶  INSERT lead_capture / redirect_log
                                                          (now carries event_id + event_time)
                                                         cron drains row →
                                                         CAPI event_id = row.event_id   ✅ (not leads.id)
                                                         CAPI event_time = row.event_time ✅
                                                         action_source = "website"
                                                         user_data = { em, ph, fbp, fbc, external_id, ip, ua }
                                            ◀──────────  Graph /{pixel}/events
        Meta: same (event_name, event_id) within 48h  →  "1 event from 2 sources"
```

**Schema additions required** (two columns each on `lead_capture` and `redirect_log`, propagated to `leads`):

| Column | Type | Purpose |
|---|---|---|
| `event_id` | `text` (UUID string) | the shared dedup key minted in the browser |
| `event_time` | `bigint` (unix seconds) | the **browser** timestamp, so client & server send the *same* `event_time` |
| `external_id` | `text` (sha256) | stable per-visitor id (see 4.4) — secondary dedup + matching |

The edge functions then send `event_id: row.event_id` and `event_time: row.event_time` instead of `leadId` / `Date.now()`. `capi-meta-events` already forwards both fields unchanged — **no change needed in the wrapper**, only in the two processors + the table schema + the browser.

### 4.3 Precise field-mapping table

| Field | Generated where | Stored in which column | Sent by client pixel (`fbq`) | Sent by edge → Graph | Meta dedup / match role |
|---|---|---|---|---|---|
| `event_id` | **Browser** (`crypto.randomUUID()`), once per user action | `lead_capture.event_id` / `redirect_log.event_id` → copied to `leads.event_id`* | `fbq('track', name, data, { eventID })` | `data[].event_id` | **PRIMARY dedup key** (with `event_name`) |
| `event_name` | Both (constant per action: `ViewContent`, `Lead`, `InitiateCheckout`) | n/a (implied by `kind`) | 1st arg of `fbq('track', …)` | `data[].event_name` | **PRIMARY dedup key** (with `event_id`) |
| `event_time` | **Browser** (unix seconds) | `*.event_time` | implicit (pixel fires now) | `data[].event_time` | Must be ~same on both; events >48h apart never dedup |
| `event_source_url` | Browser URL / server constant | derived from `event_slug` | implicit (page URL) | `data[].event_source_url` | Quality/attribution, not dedup |
| `action_source` | Server constant `"website"` | n/a | n/a (browser implies) | `data[].action_source` | Must be `website` for pixel+CAPI dedup |
| `fbp` | Meta Pixel cookie `_fbp` | `*.fbp` → `leads.fbp` | auto by pixel | `user_data.fbp` | **Fallback dedup** + user matching |
| `fbc` | From `_fbc` cookie / `fbclid` URL param | `*.fbc` → `leads.fbc` | auto by pixel | `user_data.fbc` | Click attribution + user matching |
| `external_id` | **Browser** (sha256 of a 1st-party visitor id) | `*.external_id` → `leads` | advanced-matching `external_id` | `user_data.external_id` | **Fallback dedup** + user matching |
| `em` (email) | Server: sha256(lowercased email) | raw in `lead_capture.email`; hash computed in edge | advanced matching (optional) | `user_data.em[]` | User matching only (**not** dedup) |
| `ph` (phone) | Server: sha256(digits only) | raw in `lead_capture.phone` | advanced matching (optional) | `user_data.ph[]` | User matching only (**not** dedup) |
| `client_ip_address` | Edge (request IP) | `*.ip_inet` | n/a (server sees true IP) | `user_data.client_ip_address` | User matching only |
| `client_user_agent` | Browser UA | `*.user_agent` | n/a | `user_data.client_user_agent` | User matching only |
| `mp_click_id` | **Browser** (portal-minted, see 4.5) | `redirect_log.mp_click_id` → `leads.mp_click_id` | n/a (internal) | n/a (internal attribution) | **Not a Meta field** — internal click→ticketing join |

*\* Propagating `event_id` into `leads.event_id` collides with the existing meaning of that column (it currently holds the **events** FK — `event_id = ev.id`). **Do not overload it.** Add a distinct `leads.meta_event_id` column, or store the dedup id under `leads.meta->>'event_id'` (the `meta jsonb` column already exists). Recommended: `leads.meta = { event_id, event_time }`.*

### 4.4 Verification against Meta's spec

Confirmed against Meta docs + corroborating 2026 guides:

- **Key = `event_id` + `event_name`.** "When Meta receives an event from the Pixel and a matching event from the Conversions API within a 48-hour window, it uses two fields … `event_name` and `event_id`." The browser `eventID` (3rd-arg of `fbq`) must equal the server `event_id`. Case-sensitive; must be a **string**.
- **48-hour window.** Same `(event_name, event_id)` within 48h → counted once ("1 event from 2 sources" in Events Manager). Beyond 48h → two separate events. Our cron fires within ~1 min, so we are safely inside the window.
- **`action_source: "website"`** on the server event is required for it to dedup against a browser pixel event — already hard-coded in `capi-meta-events`.
- **`fbp` / `external_id` are fallback, not primary.** Meta: "deduplication logic does not rely on user identifiers like fbp, fbc, emails or phone numbers — those help with matching users, not deduping events." The fallback (`fbp`/`external_id` without a shared `event_id`) **only dedups browser events that arrive *before* the server event** — fragile for our cron-delayed server path, which is exactly why the shared `event_id` is mandatory, not optional.
- **Send all three when possible** (`event_id` + `external_id` + `fbp`) for max reliability — drives our schema additions in 4.2.

### 4.5 `mp_click_id` end-to-end

`mp_click_id` is a **first-party, portal-owned** click identifier — *not* a Meta field. It exists so Pedro can join "user clicked Comprar on the portal" → "redirected to the external ticketing site" → (later) a sale, independently of Meta's `fbc`.

| Stage | What happens |
|---|---|
| **Generate** | Browser, when the user clicks the "Comprar bilhete" CTA on a portal event page: `mp_click_id = crypto.randomUUID()`. |
| **Persist (cookie)** | Set a 1st-party cookie `mp_click_id` (e.g. 90 days) so a later return visit / postback can be correlated. |
| **Persist (DB)** | Sent in the redirect-logging request → stored in `redirect_log.mp_click_id`, then copied to `leads.mp_click_id` by `process-redirect-log`. |
| **Read by ticketing redirect** | Appended to the outbound ticketing URL as a query param (e.g. `…/checkout?mp_click_id=<uuid>&utm_*=…`). If the ticketing provider supports a passthrough/postback param, the same id returns on purchase confirmation → closes the loop. |
| **Relation to `fbc` / attribution** | **Orthogonal to `fbc`.** `fbc` (`fb.1.<ts>.<fbclid>`) is Meta's click id from the `fbclid` URL param and is what Meta uses for ad-click attribution; it rides in `user_data.fbc`. `mp_click_id` is **our** id for the portal→ticketing hop, used for *internal* funnel/ROAS reconciliation when the ticketing platform can't pass `fbc` through. Both are captured on the same redirect; they never substitute for each other. |

> Note: `redirect_log` has `mp_click_id` but `lead_capture` does **not** (newsletter/lead path doesn't redirect to ticketing). That asymmetry is correct and should stay.

### 4.6 Concrete actions for the Lovable portal build

1. **Browser:** mint `event_id` (per action) + `mp_click_id` (per CTA click) with `crypto.randomUUID()`; capture `event_time` (unix seconds); read `_fbp`/`_fbc`; compute `external_id` (sha256 of a persisted 1st-party visitor uuid).
2. **Pixel:** `fbq('track', '<EventName>', custom, { eventID: event_id })` for `ViewContent` (page load), `Lead` (submit), `InitiateCheckout` (CTA click).
3. **Capture endpoint / DB:** add `event_id`, `event_time`, `external_id` to `lead_capture` and `redirect_log`; include them in the insert.
4. **Edge processors:** change the CAPI payload to send `event_id: row.event_id` and `event_time: row.event_time` (stop using `leadId` / `Date.now()`); add `external_id` to `user_data`. `capi-meta-events` needs no change.
5. **Validate:** use Events Manager **Test Events** + the dedup diagnostic to confirm "1 event from 2 sources".

### Unknowns / spikes

- **SPIKE-CAPI-1 — Schema location & truth.** `lead_capture` / `redirect_log` / `leads` are **not** in local `supabase/migrations/`; the code comments claim they were verified on Live `ukpuhoynrqobqtzdbysp`, but the portal is said to use shared `sfohvvlqccmmebvjgibx` (the split-brain in MEMORY). **Action:** run `\d public.lead_capture`, `\d public.redirect_log`, `\d public.leads` on **both** projects via MCP/`query_database`, confirm which one the portal actually writes to, and confirm `meta jsonb` exists before relying on it for `event_id`. Verify the real `event_pixel_id` source (`events.meta_pixel_id`).
- **SPIKE-CAPI-2 — Prove dedup works.** Wire one event page with the shared `event_id`, fire client + server, and confirm in Events Manager Test Events that it shows **"1 event / 2 sources"** and 0% over-counting. This is the only way to confirm the bug-fix end to end.
- **SPIKE-CAPI-3 — `pgsodium`/Vault token decrypt.** MEMORY flags a real CAPI bug on `ukpuho` (decrypt via PostgREST → null). Confirm `META_CAPI_ACCESS_TOKEN` resolves on the project the portal uses *before* trusting any green Test-Events result.
- **SPIKE-CAPI-4 — Ticketing passthrough.** Unverified whether the external ticketing provider(s) can echo `mp_click_id` (or `fbc`) on purchase postback. If not, portal→sale attribution stays open-loop and `mp_click_id` is internal-only. Test with one provider.
- **Unknown — `event_time` skew.** Browser clock can be wrong. Meta tolerates it within the 48h window; if a client's clock is badly off, dedup can fail. Low risk; monitor via Events Manager "event_time" diagnostics.

### Sources

- [Meta — Handling Duplicate Pixel and Conversions API Events](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/)
- [Meta — Conversions API overview](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Watsspace — Meta Conversions API Deduplication event_id](https://watsspace.com/blog/meta-conversions-api-deduplication-event_id/)
- [AGrowth — Event Deduplication in Meta Ads](https://agrowth.io/blogs/facebook-ads/event-deduplication-in-meta-ads)
- [Stape — Facebook Conversions API setup guide (2026)](https://stape.io/blog/how-to-set-up-facebook-conversion-api)
- [Lovable docs](https://docs.lovable.dev)
- Repo (ground truth): `supabase/functions/capi-meta-events/index.ts`, `process-lead-capture/index.ts`, `process-redirect-log/index.ts`

---

## 5. Estrutura de URLs + i18n + hreflang

### TL;DR — DECISÕES

| Dimensão | DECISÃO |
|---|---|
| **Idioma primário** | **PT-PT como `x-default`** e raiz "sem prefixo" → conteúdo PT servido em `/eventos/...` (sem `/pt/`). EN é o secundário opt-in. |
| **Estratégia i18n** | **Path-prefix só para o idioma secundário**: PT em raiz (`/eventos/:slug`), EN em `/en/...` (`/en/events/:slug`). NÃO subdomínio, NÃO query-param, NÃO cookie/JS-switching. |
| **Padrão de URL — eventos** | `/eventos/:slug` (PT) ↔ `/en/events/:slug` (EN). Slug humano, kebab-case, sem ID. |
| **Padrão de URL — blog** | `/blog/:slug` (PT) ↔ `/en/blog/:slug` (EN). |
| **Padrão de URL — imprensa** | `/imprensa/:slug` (PT) ↔ `/en/press/:slug` (EN). |
| **hreflang** | Emitir tags recíprocas `<link rel="alternate" hreflang="pt-PT|en|x-default">` no `<head>` por-rota via `react-helmet-async`, com URLs **absolutas** e auto-referência. |

---

### 5.1 Padrão de URL (eventos / blog / imprensa)

Comparação das três formas para eventos:

| Opção | Exemplo | SEO | UX / partilha | Veredicto |
|---|---|---|---|---|
| `/eventos/:slug` | `/eventos/fado-ao-vivo-lisboa-2026` | **Melhor** — keyword no path em PT, segmento descritivo, alinhado com a query do utilizador português | Legível, "copiável", confiável | **ESCOLHIDA (PT)** |
| `/event/:slug` | `/event/fado-ao-vivo-lisboa-2026` | Mistura idioma do path (EN) com slug (PT) → sinal incoerente para o crawler | Estranho num site PT | Rejeitada |
| `/e/:slug` | `/e/fado-ao-vivo...` | Desperdiça keyword de segmento; encurtamento sem ganho | Curto mas opaco | Rejeitada |

**Justificação:** num site primariamente PT que compete em SEO com bilheteiras (Ticketline, BOL, See Tickets), o segmento de path é um sinal de relevância barato e o utilizador-alvo pesquisa em português. `/eventos/` ganha a `/event/` (incoerência de idioma) e a `/e/` (sem keyword). O slug **nunca** deve embutir o ID/UUID do Supabase — apenas o título normalizado; a resolução slug→registo faz-se por uma coluna `slug` única e indexada na tabela de eventos.

**Regras de slug (todas as secções):**
- kebab-case, ASCII, sem acentos (`fado-ao-vivo-lisboa` não `fadó-ao-vivo`), `[a-z0-9-]` apenas.
- **Imutável após publicação.** Se o título mudar, manter o slug antigo e emitir `301` para o novo (evita link-rot e perda de signal/pixel attribution).
- Coluna `slug` com `UNIQUE` constraint no Supabase; `slug_en` separado para a variante EN (não traduzir automaticamente o slug em runtime).

**Blog e imprensa seguem o mesmo princípio:** path em PT na raiz, slug humano, espelhado em `/en/...`. Coleções em `/blog` e `/imprensa` (não `/press-releases` nem `/noticias` — manter curto e PT).

---

### 5.2 Estratégia i18n

Comparação das quatro estratégias contra os critérios SEO da Google (URLs distintas e *crawláveis* por idioma) e o objetivo low-maintenance:

| Estratégia | URL distinta crawlável? | SEO | Risco com pre-render Lovable (secção 1) | Manutenção solo | Veredicto |
|---|---|---|---|---|---|
| **Path-prefix** (`/eventos` PT, `/en/events`) | **Sim** — cada idioma tem URL única e indexável | **Melhor** — recomendado pela Google; trivial de mapear em sitemap+hreflang | **Baixo** — react-router resolve o prefixo no cliente; pre-render serve HTML por-URL | Baixa — uma só app, um só deploy | **ESCOLHIDA** |
| **Subdomínio** (`pt.` / `en.`) | Sim | Bom, mas exige config DNS + verificação Search Console por subdomínio; reparte authority de domínio | **Médio-Alto** — Lovable serve um domínio/projeto; multiplicar subdomínios sai do caminho feliz | Alta (DNS, certs, SC) | Rejeitada |
| **Query-param** (`?lang=en`) | Fraco | **Mau** — Google trata params como mesma URL/duplicado; hreflang em query é frágil | — | — | Rejeitada |
| **Cookie / JS language-detection** (mesma URL muda idioma) | **Não** | **Péssimo** — sem URL distinta o crawler indexa um só idioma; conteúdo dependente de JS/cookie não é fiável p/ indexação | Alto — depende de runtime no cliente | — | **Rejeitada explicitamente** |

**Justificação SEO (decisiva):** a Google exige, para cada versão de idioma, **uma URL distinta e rastreável**, e desaconselha selecionar idioma só por cookie/cabeçalho `Accept-Language`/JS sem mudar a URL ([Google — Managing multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)). Path-prefix satisfaz isto com a menor superfície operacional para um operador solo: uma app, um deploy, um domínio.

**PT na raiz (sem `/pt/`) — escolha deliberada:** como o site é *primariamente PT com algum EN*, a versão portuguesa é o `x-default` e vive na raiz. Vantagens: (1) URLs canónicas mais limpas para o público maioritário; (2) não força um redirect raiz→`/pt/` (latência + ponto de falha); (3) o conteúdo EN, mais escasso, fica claramente demarcado em `/en/`. Detecção de idioma do browser (`navigator.language`/`Accept-Language`) pode **sugerir** trocar para `/en/` via banner discreto, mas **nunca** redireciona automaticamente nem altera o conteúdo na mesma URL (evita cloaking e a armadilha de servir idioma diferente ao Googlebot vs. utilizador).

> **Trade-off honesto:** PT-sem-prefixo significa assimetria (PT em `/eventos`, EN em `/en/events`). É 100% suportado pela Google (o `x-default`/idioma-default pode ser a raiz), mas exige disciplina no mapeamento de hreflang (ver 5.3) — cada par tem de se referenciar mutuamente apesar da assimetria.

---

### 5.3 hreflang + x-default

**O que emitir, por-página** (HTML `<head>`, via `react-helmet-async`). Exemplo para a página de evento:

```html
<!-- em /eventos/fado-ao-vivo-lisboa-2026 (PT) -->
<link rel="canonical" href="https://www.mundopropicio.com/eventos/fado-ao-vivo-lisboa-2026" />
<link rel="alternate" hreflang="pt-PT" href="https://www.mundopropicio.com/eventos/fado-ao-vivo-lisboa-2026" />
<link rel="alternate" hreflang="en"    href="https://www.mundopropicio.com/en/events/live-fado-lisbon-2026" />
<link rel="alternate" hreflang="x-default" href="https://www.mundopropicio.com/eventos/fado-ao-vivo-lisboa-2026" />
```
A página EM EN (`/en/events/...`) emite o **mesmo bloco**, incluindo a auto-referência. Bidirecionalidade obrigatória.

**Regras (alinhadas com a Google):**
1. **Recíproco e auto-referencial:** cada variante lista *todas* as variantes incluindo ela própria. Se A→B mas B não→A, a Google ignora o par.
2. **URLs absolutas** (`https://...`), nunca relativas.
3. **`x-default` aponta para a raiz PT** (o público-default). Não criar uma página-seletora separada.
4. **`canonical` auto-referencial** em cada variante — canonical e hreflang não competem (cada idioma é canónico de si próprio).
5. **Códigos:** `pt-PT` (não `pt-BR` — público de Portugal) e `en` (genérico, sem região, pois o EN serve qualquer anglófono).
6. **Reforço opcional via sitemap XML** com anotações `xhtml:link` — útil porque um sitemap por-domínio é fácil de gerar e é uma segunda fonte de hreflang resistente a falhas de render.

**Onde o slug EN não existe:** se um evento só tem versão PT, **não emitir** `hreflang="en"` para esse evento (não inventar `/en/...` que daria 404). Emitir apenas `pt-PT` + `x-default`. A presença da variante EN é por-registo (campo `slug_en` preenchido ou não).

---

### 5.4 Compatibilidade com a stack de rendering (secção 1) — o ponto crítico

A secção 1 decidiu **Vite SPA + pre-render on-request nativo do Lovable**. Implicação direta para esta secção:

- **hreflang e `og:`/`canonical` têm de estar no HTML que o crawler recebe.** Num SPA puro, estas tags são injetadas por JS (`react-helmet-async`) *após* hydration. O Googlebot moderno executa JS e normalmente apanha-as, **mas social bots e alguns motores AI não executam JS** — daí o pre-render do Lovable ser o que torna isto fiável.
- **Requisito não-negociável:** o `react-helmet-async` tem de produzir as tags hreflang/canonical **por-rota**, e o pre-render on-request do Lovable tem de as **incluir no snapshot HTML** servido aos crawlers. Se o pre-render só capturar `<title>`/`og:` e *não* os `<link rel="alternate" hreflang>`, o sinal internacional perde-se silenciosamente.
- **Se o SPIKE A da secção 1 levar a TanStack Start SSR** (default Lovable para projetos novos), este problema desaparece: o SSR emite os `<link>` no HTML inicial de cada request, nativamente — o caminho **mais seguro** para hreflang. Ou seja, a fragilidade aqui descrita é um argumento adicional a favor de aceitar o default TanStack Start se ele for inevitável.

> **Nota de consistência (§5 ↔ §1):** o requisito de hreflang no snapshot é a mesma dependência que a §1 lista na sua "Nota de consistência". As duas secções convergem: o caminho preferido (Vite SPA + pre-render) é válido **se e só se** SPIKE D confirmar que o pre-render inclui `<link rel="alternate" hreflang>`; caso contrário, ambas as secções apontam para aceitar o default TanStack Start SSR. Não há contradição — é a mesma decisão condicional vista de dois ângulos.

---

### Unknowns / SPIKES

- **SPIKE D — O pre-render do Lovable inclui `<link rel="alternate" hreflang>`?** Não verificável por docs: a doc de SEO do Lovable confirma cobertura de `og:`/`<title>`, mas **não enumera explicitamente tags `<link rel="alternate">`**. Publicar duas páginas-par (PT + EN) e inspecionar o HTML servido a crawler: `curl -A "Googlebot" https://.../eventos/teste` e validar com o [Google Rich Results / URL Inspection]. Se as tags hreflang **não** aparecerem no snapshot, o pre-render SPA é insuficiente para i18n → forte sinal para migrar a TanStack Start SSR (SPIKE A da secção 1). *Esforço: 1h.* **Bloqueante para o i18n.**
- **SPIKE E — Persistência do mapeamento slug↔slug_en sob o agente Lovable.** Confirmar que o agente, ao gerar componentes de rota, preserva a lógica "emitir `en` só se `slug_en` existir" sem inventar URLs `/en/` para eventos PT-only. *Esforço: 30 min.*
- **Unknown não verificável:** comportamento de unfurl do WhatsApp/Discord (social bots menos comuns) face ao pre-render — herdado da secção 1, mensurável só em produção.

### Sources

- Google — Managing multi-regional and multilingual sites (URLs distintas por idioma; evitar deteção só por cookie/`Accept-Language`/JS): https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- Google — Tell Google about localized versions (hreflang recíproco, auto-referência, `x-default`, URLs absolutas): https://developers.google.com/search/docs/specialty/international/localized-versions
- Lovable — Optimize your app for SEO and AI search (pre-render on-request; cobertura `og:`/`<title>`; default TanStack Start em projetos novos): https://docs.lovable.dev/tips-tricks/seo-geo
- Meta — Conversions API (continuidade do slug imutável → estabilidade de attribution/pixel; relevante à secção de sinais): https://developers.facebook.com/docs/marketing-api/conversions-api
- Repo verificado: `/Users/pedroneto/Documents/mundopropicio/package.json` (react-router-dom 6.30; **sem** i18n nem react-helmet — confirmando que o portal introduz ambos de raiz)

---

## 6. Imagens e Storage

As linhas de DB migradas (`events`, `blog_posts`, `press_clippings`) ainda apontam para `https://zjseklogascfwqjoocbl.supabase.co/storage/...` — o **Storage do portal ANTIGO**, vivo mas em decomissionamento. O backend-alvo é `sfohvvlqccmmebvjgibx`. Estes URLs estão nos **dados** (colunas), não em ficheiros do repo, portanto a migração é um problema de *data + object copy*, não de código.

### 6.1 Dá para lançar com os URLs `zjsek` temporários?

Tecnicamente sim, mas é **dívida frágil**. Riscos:

| Risco | Severidade | Porquê |
|---|---|---|
| Projeto `zjsek` apagado/pausado | **Crítico** | Supabase pausa projetos Free inativos e apaga após 90 dias de pausa. Se o portal antigo for desligado, **todas as imagens dão 404** — incluindo `og:image` indexados pelo Google e partilhados no WhatsApp/Meta. |
| Hotlinking | Médio | Servimos banda a partir de um projeto que não controlamos; quota/billing do `zjsek` afeta o portal novo. |
| CORS | Baixo–Médio | Imagens via `<img>` não precisam de CORS; mas transforms client-side, `<canvas>`, ou fetch para gerar blur-hash/og dinâmico falham se o bucket antigo não permitir a origem nova. |
| Sem controlo de transform/CDN | Médio | Não conseguimos aplicar resize/WebP/AVIF nem Smart CDN do projeto-alvo → **LCP pior** e pior SEO de imagem (ver §6.4). |
| Churn de URL garantido | **Alto (SEO)** | Lançar com `zjsek` e migrar depois **muda todos os URLs de imagem** → `og:image` quebra, Google re-indexa, perde-se sinal de imagem acumulado. |

**Janela aceitável: ZERO para produção.** Aceitável apenas em preview/staging interno enquanto o build arranca. Em domínio público com Google a rastejar, os URLs `zjsek` **não devem aparecer**.

### 6.2 DECISÃO — Quando migrar os buckets

**DECISÃO: migrar os buckets ANTES do primeiro build público do portal (não na cutover/Fase 2).** Concretamente: copiar objetos `zjsek → sfohvvlq` e reescrever os URLs do DB *antes* de qualquer página com imagem ser indexável.

Justificação:
1. **Evitar churn de URL é a regra-de-ouro de SEO de imagem.** Cada imagem deve nascer com o seu URL **final** (ver §6.4 — domínio próprio). O Google leva semanas a re-rastejar; migrar depois do lançamento = janela de `og:image` partilhados a apontar para um projeto morto.
2. **`og:image` é o ativo mais visível e o mais difícil de corrigir** — uma vez partilhado num post de Facebook/WhatsApp, o card fica congelado com o URL antigo no scrape do Meta. Não há "redirect" retroativo.
3. A migração é **idempotente e barata** (preserva paths — ver §6.3), então fazê-la cedo não custa nada e remove a dependência do `zjsek` do caminho crítico de lançamento.
4. Deixar para a Fase 2 acopla o desligar do portal antigo ao lançamento do novo — exatamente o tipo de dependência arriscada que um operador solo deve evitar.

Exceção: se houver **bloqueio de tempo** real, lançar staging com `zjsek` é OK, mas o *go-live público* exige URLs já em `sfohvvlq`/domínio próprio.

### 6.3 Abordagem de migração (alto nível — não é código de produção)

Copiar entre dois projetos Supabase distintos = **download do origem + upload no destino** (não há "copy server-side cross-project"; `storage cp`/copy-object opera *dentro* de um projeto e está limitado a objetos ≤ 5 GB via API).

Passos:

1. **Inventariar buckets e objetos** do `zjsek` — listar via Storage API (`storage/v1/object/list/<bucket>`) ou `supabase storage ls` (CLI). Registar **público vs privado** por bucket (define se reescrevemos para `getPublicUrl` ou para signed URLs no destino).
2. **Recriar buckets no `sfohvvlq`** com a mesma visibilidade (public/private) e políticas RLS equivalentes.
3. **Download → Upload preservando o path exato** (mesma key/prefixo). Preservar `content-type` por objeto (não deixar o upload inferir `application/octet-stream` — quebra render no browser e transforms) e `cacheControl`. Processar em lote com tracking de buckets/ficheiros (sucesso/skip/falha) para ser **reentrante/idempotente** num projeto solo.
4. **Verificar paridade**: contagem e tamanho de objetos origem vs destino antes de tocar no DB.
5. **Reescrever os URLs no DB** — `UPDATE` em `events`/`blog_posts`/`press_clippings` trocando o host `zjseklogascfwqjoocbl.supabase.co/storage/v1/...` pelo URL estável final (§6.4). Se o path for preservado, é um `replace` de prefixo — **não** uma re-associação manual.
6. **Smoke test** de `og:image`/`<img>` em amostra antes de desligar o `zjsek`. Só depois pausar/apagar o projeto antigo.

Buckets **públicos**: ficheiros servidos por CDN com HIT ratio alto, sem auth → reescrita simples para `getPublicUrl`. Buckets **privados**: precisam de signed URLs (expiram) ou de um endpoint proxy — para imagens de portal público, **preferir bucket público** e tratar privacidade por path, não por signed URL (signed URLs não são indexáveis nem partilháveis de forma estável).

### 6.4 Tornar os URLs ESTÁVEIS (migrar uma só vez, para sempre)

O objetivo é **nunca re-migrar nem re-escrever o DB outra vez**. Problema: o URL canónico do Supabase Storage embute o `project-ref` (`sfohvvlqccmmebvjgibx.supabase.co/...`). Se algum dia trocarmos de projeto/plano, churn outra vez.

**DECISÃO: gravar no DB um URL sob domínio próprio do mundopropicio (ex.: `https://img.mundopropicio.com/...` ou `https://www.mundopropicio.com/storage/...`), com um reverse proxy (Cloudflare/Netlify edge) a apontar para o bucket público do `sfohvvlq`.**

- Supabase **não suporta custom domain nativo para Storage** (issue aberto há anos) → o padrão suportado é **reverse proxy para o bucket público**.
- Vantagens: o `project-ref` deixa de estar nos dados; uma futura troca de backend = mudar o *origin* do proxy, **zero alterações no DB e zero churn de SEO/`og:image`**. Ganha-se ainda camada de cache/regras de cache própria.
- Manter o **path** idêntico ao do Storage para o proxy ser um pass-through trivial.

**Cache & atualização de imagem:** o Smart CDN do Supabase invalida automaticamente ao sobrescrever o mesmo path (propagação **até ~60s** entre data-centers), mas **browsers podem manter cache antigo**. Para imagens que mudam (ex.: capa de evento re-editada), preferir **novo path por versão** (ex.: `.../capa-v2.webp`) em vez de sobrescrever — evita imagem fantasma e mantém `cacheControl` longo.

**Transform/otimização (SEO + LCP):** com bucket no projeto-alvo, usar Image Transformations (resize/WebP/AVIF, `width`/`quality`) via `getPublicUrl({ transform })` — disponível **Pro Plan ou superior**. Servir tamanhos responsivos para reduzir LCP nas páginas de evento (onde competimos com bilheteiras). Isto **só é possível depois** de os objetos viverem em `sfohvvlq` — mais um motivo para migrar cedo (§6.2).

### Unknowns / spikes

- **SPIKE-IMG-1 (estado do `zjsek`):** confirmar plano/estado do projeto antigo (Free vs Pro, ativo vs em risco de pausa-90-dias) e fazer inventário real (nº de objetos, GB, quantos > 5 GB, quais buckets públicos vs privados). Não verificável a partir do repo — os URLs estão nos dados, não em ficheiros.
- **SPIKE-IMG-2 (paridade de migração):** correr a cópia para **um** bucket de baixo volume, validar content-type/paridade e medir tempo, antes de migrar tudo. Confirmar se algum objeto excede 5 GB (improvável para imagens, mas valida o caminho).
- **SPIKE-IMG-3 (proxy de domínio próprio):** PoC de `img.mundopropicio.com` → bucket público `sfohvvlq` via Cloudflare; medir cache HIT, headers e se as Image Transformations passam pelo proxy intactas. Confirmar plano Supabase do `sfohvvlq` habilita transforms (Pro+).
- **Reescrita do DB:** o `UPDATE` em produção sobre dados ERP partilhados deve passar pelo fluxo Lovable/migrations habitual — não correr SQL ad-hoc num backend partilhado com o ERP sem snapshot.

### Sources

- [Copy Objects — Supabase Docs (limite 5 GB, copy dentro do projeto)](https://supabase.com/docs/guides/storage/management/copy-move-objects)
- [Migrating within Supabase — Backup & Restore CLI (storage cp)](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Move Supabase storage objects between projects — gist (download+upload cross-project)](https://gist.github.com/inian/78d2263f40abec6fae9b49ba58ea57f9)
- [Restore Project After 90-Day Pause — Supabase Docs (risco do projeto antigo)](https://supabase.com/docs/guides/troubleshooting/restore-project-after-90-days-pause)
- [Storage Image Transformations — Supabase Docs (Pro+, getPublicUrl transform)](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [Smart CDN — Supabase Docs (invalidação ~60s, URL estável em overwrite, browser cache)](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
- [Serving assets from Storage — Supabase Docs (público vs signed, getPublicUrl)](https://supabase.com/docs/guides/storage/serving/downloads)
- [Custom domains for Storage Buckets — supabase/supabase#4386 (sem suporte nativo → reverse proxy)](https://github.com/supabase/supabase/issues/4386)
- [Storage v2: Image resizing and Smart CDN — Supabase Blog](https://supabase.com/blog/storage-image-resizing-smart-cdn)

---

## 7. Performance Budgets + Medição

> **Por que isto importa para o portal mundopropicio.** O portal compete por SEO/UX com bilheteiras (Fever, Eventbrite, Ticketmaster, BOL/See Tickets). O Google usa Core Web Vitals (CWV) como sinal de ranking e a velocidade de carregamento afeta diretamente a *taxa de disparo do pixel*: se a página crashar ou o utilizador sair antes do `PageView`/`ViewContent` / `InitiateCheckout`, perde-se o sinal client-side e degrada-se o EMQ. Budgets de performance protegem **ranking** e **sinais de pixel** ao mesmo tempo.

### 7.1 Budgets fixos (gate)

Thresholds oficiais Core Web Vitals (medidos no **p75**, mobile e desktop separados). LCP/CLS/INP têm cortes oficiais do web.dev; TTFB, bundle JS e peso de imagem são budgets de engenharia que adotamos como gate de CI (não são CWV oficiais, mas o TTFB tem orientação do web.dev).

| Métrica | Good (alvo) | Needs-work | Poor | Fonte do corte |
|---|---|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤ 2.5 s | 2.5–4.0 s | > 4.0 s | Oficial CWV |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | 0.1–0.25 | > 0.25 | Oficial CWV |
| **INP** (Interaction to Next Paint) | ≤ 200 ms | 200–500 ms | > 500 ms | Oficial CWV (substitui FID desde 2024) |
| **TTFB** (Time to First Byte) | ≤ 800 ms | 800–1800 ms | > 1800 ms | web.dev (diagnóstico, não CWV) |
| **JS total** (gzip, first load) | ≤ 170 KB | 170–250 KB | > 250 KB | Budget de engenharia (regra "performance poverty line" ~170 KB) |
| **Peso de imagem** (por rota, above-the-fold) | ≤ 400 KB | 400–800 KB | > 800 KB | Budget de engenharia |

**DECISÃO.** Adotar os alvos da coluna *Good* como meta e os cortes *Poor* como **gate bloqueante** em CI. Justificativa: bilheteiras como a Fever carregam SPAs pesadas; um portal de conteúdo enxuto (event landing pages estáticas, imagens otimizadas) consegue ganhar LCP/INP confortavelmente e usar isso como diferencial de SEO. O budget de 170 KB de JS é agressivo mas realista para Vite/React + shadcn se evitarmos carregar o ERP/dashboards no bundle público.

> **Nota de contexto Lovable.** O portal será um **Vite SPA servido de CDN** (sem SSR/SSG por padrão no Lovable — ver §7.4). Logo o LCP depende fortemente do tamanho do bundle JS e do hidratar; daí o budget de JS ser parte do gate, não decorativo.

### 7.2 Como medir antes/depois

| Ferramenta | O que dá | Prós | Contras / constraint Lovable |
|---|---|---|---|
| **Lighthouse CI (GitHub Actions)** | Lab data sintético, gate em PR via `assert` no `lighthouserc.json` | Reprodutível, bloqueia regressões antes do merge, grátis | Dados de **lab** ≠ campo; precisa de uma URL de preview estável. **Constraint:** o deploy do Lovable é auto-commit→build próprio; o gate corre no PR/branch **antes** do Lovable publicar — não substitui o deploy, só barra o merge. |
| **`web-vitals` JS lib → GA4** | **Field data** real (LCP/CLS/INP/TTFB no p75 dos teus utilizadores) | Verdade de campo, segmentável por rota/dispositivo, grátis | Precisa de tráfego para estabilizar p75; instrumentação manual (`onLCP/onINP/onCLS` → `gtag('event', ...)`). |
| **PageSpeed Insights / CrUX** | Lab (Lighthouse) + Field (CrUX, dados Chrome reais 28 dias) | CrUX é a *mesma* fonte que o Google usa para ranking; sem instrumentação | CrUX só aparece com tráfego suficiente; latência de 28 dias — lento para iterar. |
| **Vercel Analytics / Speed Insights** | Field data RUM turnkey | Zero-config se mudarem de hosting | **Só se saírem do hosting Lovable** para Vercel. Em Lovable não está disponível — usar `web-vitals`→GA4. |

**DECISÃO de stack de medição:**
1. **Lab gate:** Lighthouse CI no GitHub Actions, a correr contra a preview do PR, com asserts iguais à tabela §7.5.
2. **Field truth:** `web-vitals` → GA4 desde o dia 1 (instrumentar `onINP`, `onLCP`, `onCLS`, `onTTFB`, `onFCP`).
3. **Cross-check de ranking:** CrUX via PSI mensal (é o que o Google "vê").
4. Vercel Analytics fica como opção **só** se migrarem o frontend para fora do Lovable (a migração de hosting não exige mudanças de arquitetura — só os serviços Supabase-específicos ficam).

### 7.3 Qualidade de match do pixel (EMQ + dedup)

O portal e o ERP partilham o mesmo Supabase (`sfohvvlqccmmebvjgibx`); o portal deve emitir **pixel (client) + CAPI (server)** com o **mesmo `event_id`** para deduplicação. A função `supabase/functions/capi-meta-events/index.ts` já existe no repo do ERP e **não faz hashing** (recebe `user_data` já hashed de quem chama) e lê o token do Vault — o portal pode reutilizar esse padrão.

> **Nota de consistência (§7 ↔ §4):** o "mesmo `event_id`" referido aqui é exatamente a chave de dedup decidida em §4 — **`event_id` minted no browser**, persistido na tabela-buffer e reusado pelo cron (corrigindo o bug `event_id = leads.id`). §7.3 trata da *medição/monitorização* (EMQ + dedup health); §4 trata da *mecânica*. Não há divergência entre as duas.

**Event Match Quality (EMQ).** Meta pontua o dataset de **0 a 10** (Poor < 4 · OK 4–5.9 · Good 6–7.9 · Great 8+), visível em **Events Manager → Data Sources → o teu dataset → Event Match Quality**. Parâmetros que sobem o EMQ (enviar o máximo possível **juntos** no mesmo evento):

| Parâmetro | Hash? | Como obter no portal |
|---|---|---|
| `em` (email) | SHA-256 (lowercase+trim) | Form de checkout / lead capture |
| `ph` (telefone) | SHA-256 (E.164) | Form de checkout |
| `external_id` | SHA-256 | ID estável do utilizador/lead do CRM partilhado |
| `fbp` | **NÃO** | Cookie `_fbp` (recuperar server-side) |
| `fbc` | **NÃO** | Cookie `_fbc` / `fbclid` do URL (recuperar server-side) |
| `client_ip_address` | **NÃO** | Capturado server-side na edge function CAPI |
| `client_user_agent` | **NÃO** | Header `User-Agent` na edge function CAPI |

**Monitorização de dedup/EMQ:**
- **EMQ:** rever semanalmente em Events Manager por evento (`PageView`, `ViewContent`, `InitiateCheckout`, `Purchase`). Alvo: **≥ 8 (Great)** para eventos de fundo de funil.
- **Dedup health:** em Events Manager, a coluna de eventos deduplicados deve mostrar que pixel e CAPI estão a ser casados pelo `event_id` partilhado — se aparecerem como eventos separados (contagem ~2x), o `event_id` ou o `event_name` estão dessincronizados.
- O repo já tem `crm-meta-pixel-health` (edge function) — vale verificar se pode ser estendida para alertar quando o EMQ cai abaixo de 6 ou o ratio de dedup degrada. (**SPIKE** — ver abaixo.)

### 7.4 Constraint estrutural Lovable (LCP/SEO)

Lovable serve o app compilado (Vite/React) como **estático de CDN com HTTPS (Let's Encrypt)** e cache agressivo; domínio custom via registos **A + TXT** (não CNAME), em planos pagos. **Não há SSR/SSG nativo confirmado** — é SPA hidratada. Para um portal de SEO isto é o maior risco: HTML inicial vazio prejudica crawl e LCP. Mitigações a decidir noutra secção (pré-render/SSG, ou migração de hosting), mas o **budget de JS de 170 KB existe exatamente para tornar a SPA tolerável** enquanto SSG não estiver resolvido.

> **Nota de consistência (§7.4 ↔ §1):** "não há SSR/SSG nativo confirmado" refere-se à ausência de **SSG/SSR de build**. A §1 estabelece que o Lovable *tem* **pre-render on-request para crawlers** (snapshot servido a bots) — que não é SSR para utilizadores humanos. Os dois factos coexistem: humanos recebem a SPA hidratada (daí o budget de JS), crawlers recebem o snapshot pré-renderizado (daí o SEO ser viável). O "maior risco" do LCP aplica-se à experiência humana; a viabilidade de SEO assenta no pre-render de crawler (a confirmar nos SPIKE B/D).

### 7.5 Tabela de budget para CI (o gate)

`lighthouserc.json` — asserts a colocar no GitHub Actions (bloqueia o merge):

```jsonc
{
  "ci": {
    "assert": {
      "assertions": {
        "largest-contentful-paint": ["error", { "maxNumericValue": 4000 }],   // LCP < 4.0s (poor gate)
        "cumulative-layout-shift":  ["error", { "maxNumericValue": 0.25 }],     // CLS < 0.25
        "interaction-to-next-paint":["error", { "maxNumericValue": 500 }],      // INP < 500ms (lab proxy: TBT)
        "total-blocking-time":      ["warn",  { "maxNumericValue": 300 }],      // proxy de INP em lab
        "server-response-time":     ["error", { "maxNumericValue": 1800 }],     // TTFB < 1.8s
        "resource-summary:script:size": ["error", { "maxNumericValue": 256000 }], // JS < 250KB
        "resource-summary:image:size":  ["error", { "maxNumericValue": 819200 }], // img < 800KB
        // alvos "good" como warning para pressão contínua:
        "largest-contentful-paint":  ["warn",  { "maxNumericValue": 2500 }],
        "cumulative-layout-shift":   ["warn",  { "maxNumericValue": 0.1 }]
      }
    }
  }
}
```

> Nota: o Lighthouse **lab** não mede INP diretamente (INP é métrica de campo); usa-se **Total Blocking Time (TBT)** como proxy no gate e confirma-se o INP real via `web-vitals`→GA4 (§7.2).

### Unknowns / spikes

- **SPIKE-1 (SSR/SSG no Lovable):** confirmar se a build do Lovable pode emitir HTML pré-renderizado ou se é SPA pura. Experimento: criar projeto Lovable de teste, publicar, `curl` a home e inspecionar se o `<body>` tem conteúdo ou é shell vazio. Resultado decide se o budget de 170 KB de JS é suficiente ou se é preciso pré-render/migração de hosting. *(Mesmo experimento que SPIKE B/SPIKE-1 de §1/§8 — consolidar.)*
- **SPIKE-2 (Lighthouse CI vs preview Lovable):** validar que o GitHub Actions consegue apontar para uma URL de preview estável do PR. Como o Lovable auto-commita para `main`, testar se o gate corre num branch antes do publish ou se só corre pós-merge (caso em que vira monitorização, não gate).
- **SPIKE-3 (EMQ baseline):** após primeiro tráfego, medir o EMQ real por evento em Events Manager e verificar dedup ratio. Estender `crm-meta-pixel-health` para alertar EMQ < 6.
- **TTFB/JS/imagem** não são cortes oficiais Google — são budgets de engenharia adotados; ajustar após ver CrUX real.

### Sources
- Core Web Vitals (visão geral, p75): https://web.dev/articles/vitals
- LCP thresholds (2.5s / 4.0s): https://web.dev/articles/lcp
- INP thresholds (200ms / 500ms, substitui FID em 2024): https://web.dev/articles/inp
- CLS / TTFB (orientação): https://web.dev/articles/cls · https://web.dev/articles/ttfb
- `web-vitals` lib (RUM → GA4): https://github.com/GoogleChrome/web-vitals
- Lighthouse CI (asserts/GitHub Actions): https://github.com/GoogleChrome/lighthouse-ci
- Lovable deployment/hosting/custom domains: https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership
- Meta Conversions API — customer information parameters: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/
- Meta Conversions API — Dataset/Event Quality (EMQ): https://developers.facebook.com/docs/marketing-api/conversions-api/dataset-quality-api/
- Meta — deduplicação pixel + CAPI: https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
- Repo (read-only): `/Users/pedroneto/Documents/mundopropicio/supabase/functions/capi-meta-events/index.ts` (CAPI já existente, user_data pré-hashed), `crm-meta-pixel-health/index.ts` (saúde do pixel)

---

## 8. Roadmap Revisto de Sprints

> Este roadmap herda e amarra as decisões das secções 1–7. Premissa central: **manter tudo no Lovable** (memória do projeto), portal = **Vite SPA + pre-render nativo** (§1), Supabase externo **`sfohvvlqccmmebvjgibx` em modo env-vars + cliente manual, agente cego ao schema** (§2), **admin no ERP, portal read-only** (§3), **dedup CAPI com `event_id` minted no browser** (§4 — corrige bug atual), **storage migrado para `sfohvvlq` + domínio próprio ANTES do go-live público** (§6), **budgets de performance como gate** (§7).
>
> **Regra de ouro de execução (todas as sub-fases):** o agente Lovable **nunca corre DDL**. Schema/RLS/cron são aplicados pelo Pedro no SQL Editor, fora do Lovable, em `supabase/manual/` (convenção §2). Cada sub-fase começa com **plan-mode** e prompts pequenos e escopados (controlo de custo — §8.4).

### 8.1 Pré-requisitos bloqueantes (Sprint 0 — fazer ANTES da Fase 1)

Nenhuma linha de portal deve ser escrita antes de resolver os spikes que decidem *contra que backend* e *com que schema* se constrói. Estes spikes já estão definidos noutras secções; aqui ficam consolidados como gate de arranque.

| # | Spike (origem) | Decide | Bloqueia |
|---|---|---|---|
| S0.1 | **SPIKE-1 / SPIKE-CAPI-1** (§2, §4) — qual ref (`ukpuho` vs `sfohvvlq`) hospeda `lead_capture`, `redirect_log`, `leads`, pixel/CAPI token | Onde o portal escreve | Tudo |
| S0.2 | **SPIKE A** (§1) — projeto novo nasce Vite SPA ou TanStack Start SSR? | Confirma stack de rendering ou aceita default TanStack | 1.1 |
| S0.3 | **SPIKE 1 RLS** (§3) — RLS de `blog_posts`/`press_clippings`/`newsletter_contacts`; single vs multi-tenant | Forma das policies + se há `company_id` | 1.5, 1.6 |
| S0.4 | **SPIKE-CAPI-3** (§4) — token CAPI resolve (`pgsodium` decrypt) no ref-alvo | Se o CAPI server-side funciona de todo | 1.6, 1.7 |
| S0.5 | **SPIKE-IMG-1** (§6) — estado/inventário do `zjsek`, públicos vs privados, >5GB | Plano de migração de storage | Fase 2 (e 1.3+ se imagens forem indexáveis) |

**Gate de saída do Sprint 0:** ref confirmado + stack confirmada + RLS das 3 tabelas verificado/corrigido + token CAPI a resolver. Sem isto, Fase 1 não arranca.

### 8.2 Fase 1 — Construir o portal (sub-fases)

Cada sub-fase: **goal · dependências · critério de aceitação · secção que governa**. As sub-fases são deliberadamente pequenas para conter custo e manter o agente no "caminho feliz".

#### 1.1 — Scaffold / estrutura

- **Goal:** criar o projeto Lovable, layout base (Tailwind/shadcn), routing (react-router), `react-helmet-async` por-rota, Project Knowledge com as "REGRAS DE BASE DE DADOS — INVIOLÁVEIS" (§2.5) coladas no topo.
- **Dependências:** S0.2.
- **Aceitação:** projeto publica shell; rotas placeholder; `<title>`/`og:` por-rota a renderizar; Project Knowledge contém as regras DB e a regra OG obrigatória.
- **Governa:** §1, §2.5.

#### 1.2 — Conectar Supabase externo (cliente manual)

- **Goal:** `src/integrations/supabase/client.ts` escrito à mão com `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` (copiar padrão do ERP). **NÃO** ativar Lovable Cloud nem Native Integration.
- **Dependências:** S0.1, 1.1.
- **Aceitação:** `insert` de teste em `lead_capture` passa via `anon` (RLS insert-only); `SELECT` direto a `lead_capture` é **negado**; agente não reintroduziu a Native Integration (verificar no diff). **Esta é a sub-fase onde o agente pode "lutar"** (§2 SPIKE-2) — ver 8.3.
- **Governa:** §2.

#### 1.3 — Home com dados reais (catálogo read-only)

- **Goal:** home + listagem de eventos públicos via **Edge Function `portal-events`** (opção B2, §2.4), não `SELECT` direto. Imagens já a apontar para URL final (§6 — domínio próprio), não `zjsek`.
- **Dependências:** 1.2; **Fase 2 storage parcial** se imagens da home forem indexáveis (ver nota §6.2: zero `zjsek` em produção).
- **Aceitação:** home lista eventos publicados; nenhum `SELECT` direto a `events` no bundle; `og:image`/`<img>` servem do domínio próprio; LCP/JS dentro do budget (§7.1).
- **Governa:** §2.4 (B2), §6, §7.

#### 1.4 — Página de evento (+ pixel + SEO/OG)

- **Goal:** página `/eventos/{slug}` com conteúdo real, `og:title/description/image` e `<title>` únicos (Helmet), pixel client-side `ViewContent` com `eventID = crypto.randomUUID()` por carga, captura de `_fbp`/`_fbc`.
- **Dependências:** 1.3.
- **Aceitação:** **SPIKE B (§1)** verde — `curl -A "Googlebot"`/`facebookexternalhit` devolve HTML com conteúdo do evento e `og:` corretos (não shell); Facebook Sharing Debugger e Rich Results Test OK; pixel dispara `ViewContent` no Test Events.
- **Governa:** §1 (pre-render + OG), §4 (event_id no browser), §5 (slug/hreflang), §7.

#### 1.5 — Blog + Press

- **Goal:** rotas de leitura `/blog/*` e `/imprensa/*` lendo `blog_posts`/`press_clippings` (publicados) via Edge Function ou `SELECT` RLS restrito conforme S0.3. **Sem admin no portal** — conteúdo editado no ERP (§3, caminho C→A).
- **Dependências:** S0.3, 1.3.
- **Aceitação:** só conteúdo `published=true` visível anónimo; `og:`/`<title>` por post; URLs de imagem do domínio próprio.
- **Governa:** §3 (read-only), §1, §6.

#### 1.6 — Lead capture (com dedup `event_id`)

- **Goal:** form de lead/newsletter → `insert` em `lead_capture` com **`event_id`, `event_time`, `external_id` minted no browser** (§4.2); pixel `Lead` com mesmo `eventID`. Ajustar `process-lead-capture` para enviar `event_id = row.event_id` (parar de usar `leads.id`) — **correção do bug de dedup (§4.1)**.
- **Dependências:** S0.3 (RLS `newsletter_contacts`: insert-anónimo, select-negado), S0.4 (token CAPI), 1.4. **Mudança de schema** (3 colunas) = SQL manual do Pedro, não agente.
- **Aceitação:** **SPIKE-CAPI-2 (§4)** verde — Events Manager mostra **"1 event / 2 sources"** para `Lead`; `newsletter_contacts` não é legível por `anon`; EMQ baseline medido (§7.3).
- **Governa:** §4 (core), §3.4 (RLS newsletter), §7.3.

#### 1.7 — Redirect bilhetes (`mp_click_id`)

- **Goal:** CTA "Comprar bilhete" → mint `mp_click_id` (cookie 1st-party 90d), `insert` em `redirect_log` (com `event_id`/`event_time` do browser), pixel `InitiateCheckout` mesmo `eventID`, redirect para ticketing com `?mp_click_id=...&utm_*`. Ajustar `process-redirect-log` para `event_id = row.event_id`.
- **Dependências:** S0.4, 1.4.
- **Aceitação:** **SPIKE-CAPI-2** verde para `InitiateCheckout`; `mp_click_id` chega ao `redirect_log` e ao URL de saída; dedup ratio sem 2x.
- **Governa:** §4.5, §4.1.

### 8.3 Sub-fases mais arriscadas + spike por incógnita

| Sub-fase | Risco | Por quê | Spike / mitigação |
|---|---|---|---|
| **1.2** | **Alto** | Ao detetar `@supabase/supabase-js`, o agente pode forçar a Native Integration / pedir Cloud → exporia DDL sobre a DB do ERP | **SPIKE-2 (§2):** num projeto-teste, pedir um `insert` e observar se o agente tenta "connect Supabase". Mitigação: cliente manual + regra no Project Knowledge + rever diff de `supabase/` |
| **1.4** | **Alto** | Toda a tese de SEO (§1) depende do pre-render nativo servir HTML real; se falhar, precisa de SSG manual (custo alto, fora do mental model do agente) | **SPIKE B (§1)** end-to-end; fallback **SPIKE C (§1)** mede persistência sob agente se SSG virar necessário |
| **1.6 / 1.7** | **Alto** | O bug de dedup (§4.1) é real hoje; corrigir exige browser+schema+edge alinhados, e o token CAPI pode não resolver (pgsodium, §4) | **SPIKE-CAPI-1/2/3 (§4):** confirmar schema, provar "1 event/2 sources", confirmar token decrypt antes de confiar em qualquer verde |
| **1.3 (imagens)** | **Médio-Alto** | Churn de URL `zjsek→final` depois de indexado quebra `og:image` partilhados (§6) | **SPIKE-IMG-1/2/3 (§6):** migrar buckets + proxy de domínio próprio **antes** de qualquer página com imagem ser indexável |
| **S0.1 (split-brain)** | **Crítico/bloqueante** | Escrever no ref errado = portal alimenta backend errado | **SPIKE-1 (§2):** REST a ambos os refs com anon key; cablar só ao confirmado |

### 8.4 Estimativa de créditos Lovable (REALISTA — com aviso de incerteza)

> ⚠️ **UNKNOWN explícito.** O Lovable cobra por **mensagem/iteração do agente** (cada prompt que edita código consome ≥1 crédito; prompts em chat/plan-mode consomem menos ou nada conforme o plano). O preço por crédito e o consumo por iteração **variam com o plano e mudam ao longo do tempo** — não verifiquei a tabela de preços de Junho/2026. **Trate os números abaixo como ordem-de-grandeza em "iterações de agente", não em euros.** Confirmar no dashboard de billing do workspace antes de orçamentar (ver SPIKE-CRED).

**Premissas da estimativa:**
- 1 "iteração" = 1 prompt que produz uma edição de código aceite.
- Sub-fases com pixel/CAPI/SEO custam mais por exigirem ciclos de verificação (Test Events, Sharing Debugger) → retries.
- Plan-mode primeiro reduz iterações desperdiçadas; prompts pequenos e escopados reduzem re-trabalho.

| Sub-fase | Iterações estimadas (range) | Porquê o range |
|---|---|---|
| 1.1 Scaffold | 5–12 | Layout/routing/Helmet/PK; baixo risco |
| 1.2 Supabase manual | 4–10 | Trivial em código, **mas** retries se o agente insistir na Native Integration |
| 1.3 Home/catálogo | 8–18 | Edge Function + listagem + tuning de imagem/perf |
| 1.4 Página de evento | 10–25 | **Maior** — SEO/OG + pixel + ciclos de SPIKE B (re-deploy + re-teste de crawler) |
| 1.5 Blog + Press | 6–14 | Duas secções de leitura, formatação/OG |
| 1.6 Lead capture | 10–22 | Dedup `event_id` + edge + Test Events retries |
| 1.7 Redirect bilhetes | 6–14 | `mp_click_id` + edge + Test Events |
| **Fase 1 total** | **~50–115 iterações** | Range largo por incerteza de retries de verificação |
| Fase 2 cutover | 4–10 | DNS/SSL são config, não muito agente; storage é fora do Lovable |

**Como travar o gasto (recomendações):**
1. **Plan-mode primeiro** em cada sub-fase — desenhar antes de deixar o agente editar.
2. **Prompts pequenos e escopados** — uma página/uma feature por prompt; evita o agente reescrever ficheiros não relacionados.
3. **Verificação fora do Lovable** (curl, Sharing Debugger, Test Events) — não gastar iterações do agente a "testar"; trazer só o resultado.
4. **SQL manual fora do Lovable** — schema/RLS não consomem iterações de agente.
5. **Definir teto por sub-fase** (ex.: parar e reavaliar se 1.4 passar de ~25 iterações → sinal de que o pre-render falhou → ir para SPIKE C).

### 8.5 Fase 2 — Cutover (go-live público) — checklist de pré-requisitos

Nenhum tráfego público / indexação antes de **todos** os itens verdes:

| # | Pré-requisito | Secção | Gate |
|---|---|---|---|
| C1 | **Migração de buckets `zjsek → sfohvvlq`** concluída + URLs do DB reescritos para **domínio próprio** (`img.mundopropicio.com` via proxy) | §6 | Zero URL `zjsek` em produção; smoke test `og:image`/`<img>` OK |
| C2 | **DNS** de `www.mundopropicio.com` apontado (Lovable usa **A + TXT**, não CNAME) | §7.4 | Resolve para o portal; www canónico definido |
| C3 | **SSL** (Let's Encrypt via Lovable) ativo no domínio custom | §7.4 | HTTPS verde, sem mixed-content |
| C4 | **Pre-render/SEO** verificado em produção: Googlebot/facebookexternalhit recebem HTML + `og:` corretos | §1 (SPIKE B) | Rich Results + Sharing Debugger OK no domínio final |
| C5 | **Gates de performance** (Lighthouse CI) a passar; `web-vitals→GA4` instrumentado | §7.1/§7.2 | CWV dentro do budget *Poor*-gate; field RUM a reportar |
| C6 | **Dedup CAPI** provado em produção: "1 event / 2 sources" para `ViewContent`/`Lead`/`InitiateCheckout`; EMQ ≥ baseline | §4 (SPIKE-CAPI-2), §7.3 | Sem contagem 2x; token CAPI a resolver |
| C7 | **Caminho de admin** operacional: Pedro consegue publicar conteúdo (via Studio C, ou cartão "Conteúdo do Portal" no ERP A.1) | §3 | Pelo menos C ativo; A.1 desejável |
| C8 | **RLS final** das 3 tabelas confirmado (publicado-público leitura; escrita só admin/editor; newsletter insert-anónimo/select-negado) | §3.4, §2.4 | Verificação anon-key passa |
| C9 | **Decomissionamento do `zjsek`** só **após** C1 verde e smoke test | §6 | Pausar/apagar projeto antigo é o **último** passo, nunca antes |

**Ordem do cutover:** C1→C8 em qualquer ordem (paralelizáveis), depois **C9 por último**. Pausar/apagar `zjsek` antes de C1 verde = 404 em massa de `og:image` indexados (§6.1) — irreversível para cards já partilhados.

### Unknowns / spikes (consolidado desta secção)

- **SPIKE-CRED (novo):** confirmar no dashboard de billing do workspace Lovable o modelo de cobrança atual (créditos/iteração, custo, o que plan-mode consome) e calibrar os ranges de §8.4. *Não verificável a partir do repo nem das docs sem aceder ao billing — flagged como UNKNOWN.*
- **Dependência cruzada de ordem:** 1.3+ requerem URLs de imagem finais, o que **puxa parte da migração de storage (§6 / C1) para antes do fim da Fase 1**, não só para a Fase 2. Confirmar no SPIKE-IMG quais imagens são indexáveis cedo para decidir quanto da migração antecipar.
- **Persistência sob agente (1.2):** risco não medido de o agente reintroduzir a Native Integration entre prompts; cobrir com SPIKE-2 (§2) e revisão de diff de `supabase/` como tripwire.
- Restantes incógnitas herdadas: SPIKE A/B/C (§1), SPIKE-1/2/3 (§2), SPIKE 1/2 RLS (§3), SPIKE-CAPI-1..4 (§4), SPIKE D/E (§5), SPIKE-IMG-1..3 (§6), SPIKE-1..3 perf (§7) — todas mapeadas como gates em §8.1/§8.3/§8.5.

### Sources

- Lovable — Plans, credits & billing (modelo de cobrança por mensagem/iteração; confirmar valores atuais): https://docs.lovable.dev/user-guides/messaging-billing
- Lovable — Deployment, hosting & custom domains (A + TXT, Let's Encrypt SSL): https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership
- Lovable — SEO & AI search (pre-render on-request, default de rendering): https://docs.lovable.dev/tips-tricks/seo-geo
- Lovable — Connect to Supabase (Cloud vs Native Integration): https://docs.lovable.dev/integrations/supabase
- Meta — Deduplicate Pixel and Conversions API events (event_id, janela 48h): https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
- Supabase — Restore project after 90-day pause (risco do `zjsek`): https://supabase.com/docs/guides/troubleshooting/restore-project-after-90-days-pause
- web.dev — Core Web Vitals (budgets/p75 do gate de cutover): https://web.dev/articles/vitals
- Repo (read-only, verificado): `supabase/functions/{capi-meta-events,process-lead-capture,process-redirect-log}/index.ts` e `supabase/manual/portal_cron_jobs.sql` (convenção `supabase/manual/` fora de migrations)
- Decisões herdadas: secções 1 (rendering), 2 (Supabase externo), 3 (admin), 4 (CAPI dedup), 6 (storage), 7 (performance) deste mesmo documento; memória do projeto (permanência no Lovable Cloud; split-brain de backends).

---

## Sumário para a próxima sessão (Pedro)

1. **Rendering:** decisão = **Vite SPA puro + pre-render on-request nativo do Lovable + `react-helmet-async` por-rota** (OG/hreflang/canonical por página). NÃO construir SSG manual. Fallback condicional: aceitar o default **TanStack Start SSR** se SPIKE A mostrar que projeto novo nasce assim.
2. **Guardrail Supabase-externo:** ligar a `sfohvvlqccmmebvjgibx` por **env-vars + cliente manual**, com **Lovable Cloud e Native Integration DESLIGADOS**; colar no Project Knowledge as "REGRAS DE BASE DE DADOS — INVIOLÁVEIS" (§2.5). O agente nunca corre DDL; schema/RLS/cron são SQL manual do Pedro em `supabase/manual/`.
3. **Admin:** recomendação = **C → A**. Começar já em Supabase Studio (C), convergir para um cartão "Conteúdo do Portal" no admin do ERP (A.1). **Rejeitar admin no site público (B).** Portal é read-only; eventos vivem sempre no ERP.
4. **Dedup CAPI (chave):** `event_id` **minted no browser** (`crypto.randomUUID()`) === `eventID` do pixel, reusado pelo cron via tabela-buffer — **corrige o bug atual** `event_id = leads.id` que duplica conversões.
5. **Storage (timing):** migrar buckets `zjsek → sfohvvlq` + reescrever URLs do DB para **domínio próprio** (`img.mundopropicio.com` via proxy) **ANTES** de qualquer página com imagem ser indexável — nunca na Fase 2. Decomissionar `zjsek` só por último.
6. **#1 risco:** o **split-brain de backends** (`ukpuho` vs `sfohvvlq`). Escrever no ref errado alimenta o backend errado e/ou o token CAPI não resolve (`pgsodium`). É o gate S0.1 — bloqueia tudo.
7. **Próxima ação imediata (antes de gastar créditos Lovable):** correr o **Sprint 0** — SPIKE-1/SPIKE-CAPI-1 (confirmar empiricamente em qual ref vivem `lead_capture`/`redirect_log`/`leads`/pixel-token), SPIKE A (template do projeto novo) e SPIKE 1 RLS (policies das 3 tabelas). Só depois abrir o projeto Lovable.

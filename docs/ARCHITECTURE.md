# Arquitetura — MP Gestão Eventos / MP Audience

> Documento vivo. Fonte de verdade de COMO o sistema funciona e ONDE vive cada coisa.
> Mantido no lugar (não é diário). Pendências vivem nas GitHub Issues; o PORQUÊ das decisões vive em DECISIONS.md.
> Última atualização: 26/jun/2026.

## 1. O que é
MP Gestão Eventos — SaaS multi-tenant de gestão de eventos (ticketing, BP, simulador financeiro, A&B, patrocínios, financeiro). MP Audience — módulo interno de audience/marketing intelligence para campanhas Meta de artistas brasileiros. Owner: Pedro Neto / Mundo Propício (produção de eventos em Portugal e Brasil).

### 1.1 Módulos
A plataforma divide-se em quatro módulos de produto + uma camada transversal. Os labels de módulo nas GitHub Issues seguem esta taxonomia (MP-ERP, MP-CRM, MP-AUDIENCE, MP-PRODUCAO, transversal).

- **MP ERP** — gestão operacional do evento: ticketing, BP (business plan), simulador financeiro, A&B (food & beverage), patrocínios, financeiro. Domínio mpgestaoeventos.com.
- **MP CRM** — relação com clientes/leads/promotores. Módulo DISTINTO do MP Audience. ⚠️ Armadilha de nomenclatura: o schema `crm.*` na base de dados é onde vive o MP AUDIENCE (campanhas Meta), e NÃO o módulo MP CRM. Nomes iguais, coisas diferentes.
- **MP AUDIENCE** — marketing intelligence: campanhas Meta/Google, tracking, pixels, diagnóstico de campanhas, motor de redesign (P0). Vive no schema crm.*.
- **MP PRODUÇÃO** — produção de eventos no terreno (a detalhar).
- **transversal** — infraestrutura que cruza todos os módulos: sistema de pendências (GitHub Issues), documentação viva, auditoria da plataforma.

## 2. Stack & infraestrutura
- Frontend + edge functions + BD: Lovable Cloud (Supabase por baixo). Decisão permanente (mai/2026) — ver DECISIONS.md.
- Repo: GitHub pedrompropicio/mundopropicio. Repo local: /Users/pedroneto/Documents/mundopropicio.
- Fluxo de trabalho: Pedro orquestra IA (não escreve código). Claude (chat) propõe/diagnostica; agente Lovable executa via MCP; Pedro autoriza ações irreversíveis e faz Publish.

## 3. Projetos Lovable & domínios
- ERP / MP Audience: ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f — mpgestaoeventos.com
- Portal público: 26b95793-17b6-478c-a6e8-745c0cfb7ed9 — mundopropicio.com
- Workspace: yea5nsHAWxcTKcEaOfV1 (Business plan)

## 4. Base de dados (base única Live)
- Supabase Live: sfohvvlqccmmebvjgibx (BD partilhada ERP + portal).
- O ambiente Test foi apagado (jun/2026) → base única. DDL do agente aplica DIRETO em Live.
- Schemas: crm.* (audience), public.* (PostgREST).

## 5. Identidades-chave
- company_id MP: 7c858982-6ccd-47ca-bd65-e0dd3eebf01c
- Pedro profile: d8e502f7-9ceb-4dae-bd73-7291832d0d6f
- Meta ad account: act_5094207367314169 (EUR, Portugal); connection 3c234235-0ac5-4afc-a06e-259bdea0ae7a
- Pixels Meta: Ivete 1647180363218298, Anitta 1485199726043897, Simone 1608617547054908
- Google Ads: conta 220-004-3144, MCC 9743221780, API v24
- Colegas: Thiago (traffic manager, convenção [F]/[Q]=frio/quente), Juliana Matos (marketing/portal), Henrik (Lovable support)

## 6. Padrões operacionais críticos
### DDL / Publish / Crons
- Base única: DDL do agente (migration) aplica direto em Live. "Faz Publish" = deploy de código/edge functions/front-end; NÃO é preciso para objetos SQL de migração nem para ficheiros .md.
- NUNCA DDL em Live via SQL Editor (drift untracked → próximo Publish gera DROP). SQL Editor em Live: só SELECT/hotfixes (GRANT, NOTIFY, dados).
- Publish propaga DDL mas NÃO DML nem crons. Crons (pg_cron): mudanças diretas no SQL Editor de Live; cron.alter_job exige owner (postgres); usar jobname cross-env.
- Scanner pré-Publish pode bloquear com erros pré-existentes: "Ignore issue" OK, NUNCA "Try to fix all".

### Acesso Supabase
- Exclusivo via Lovable. NÃO há service-role key, curl direto nem CLI. NUNCA pedir a Pedro para revelar/colar credenciais. Invocar edge functions em Live: via agente (environment=production) ou trigger autenticado na app.
- Edge functions via service_role precisam GRANTs explícitos SELECT/INSERT/UPDATE em crm.* + USAGE no schema. RPCs SECURITY DEFINER por cron: dual-mode auth via current_setting('request.jwt.claims',true).

### MCP send_message (Lovable)
- Resposta falha com frequência (transport error) mas a mensagem TIPICAMENTE chega. Verificar via list_messages/get_message antes de reenviar. NUNCA reenviar cegamente (pode duplicar). query_database só ataca Live.

### SQL com Pedro (mobile)
- Queries curtas e separadas, com fences para colar limpo. Resultados grandes → Export CSV.

### Sistema de pendências
- Fonte de verdade = GitHub Issues (repo pedrompropicio/mundopropicio), via edge function github-issues (actions list/create/comment/close; owner/repo fixos no código; token no secret GITHUB_TOKEN, fine-grained PAT que expira 24/set/2026).
- Ritual: ler issues abertas no início de cada sessão; criar/atualizar/fechar no fim.

## 7. Lições técnicas / armadilhas (gotchas)
- Meta Graph API: não expõe URLs MP4 (policy). Geolocalização ISO "PT". CTA "BUY_TICKETS". ABO: budget null ao nível campanha (spend real = budget por adset × nº adsets). /recommendations e targetingsuggestions funcionam.
- PostgREST: teto server-side de 1000 rows sobrepõe .limit() do cliente.
- pg_net timeout 5s vs edge functions ~18s → status_code=NULL é esperado; validar via DB state.
- Tracking cross-domain (portal→Ticketline): fbp NÃO cruza domínios (esperado, não é falha). fbclid→fbc é o vector válido; portal anexa fbclid no clique (handler handleTicketClick, corrigido jun/2026).
- Funnel Test 360 corre em headless (Browserless) → dá FALSOS NEGATIVOS sobre disparo de eventos. Fonte de verdade = Events Manager do Meta, nunca a simulação. NUNCA afirmar falha de parceiro só com base no Funnel 360.
- Ticketline: envia o funil completo (incl. Purchase com value/currency/content_ids) mas SEM fbc → match quality ~6/10. O que falta é deles incluírem o fbc no Purchase.
- Rotar secret de edge function: bump cosmético em cada fn → Publish → cold start lê valor novo (idle eviction ~15min, não garantido).
- Google Ads API v24 (v17/v20 obsoletos).
- supabase-js .upsert(onConflict) não aceita partial UNIQUE — usar UNIQUE total.

## 8. Regras de operação do Pedro
- Justificar antes de executar; uma ação irreversível de cada vez com autorização explícita.
- Nunca disparar ao agente Lovable sem confirmação. Prompts ao Lovable: bloco único copy-paste, sem fragmentos, plan_mode=false por defeito.
- Quando Pedro define direção, executar sem sugerir parar/adiar — ritmo e prioridades são decisão dele.
- "Faz Publish" direto quando pronto (não perguntar "queres publicar?"). Todo o output, resumos e documentação em PT-PT.
- Ações irreversíveis (DELETE/UPDATE Live): SELECT → Pedro confirma → ação cirúrgica.

## 9. MP Audience — caminhos de campanha
Modelo de 2 faixas (DR-2026-06-26, ver DECISIONS.md):
- **Faixa A** — editar campanha existente in-place (budget/pausa via Graph). Tem de ganhar dry-run + modal de impacto antes de qualquer escrita (padrão MetaPublishPanel); hoje escreve direto e é o risco vivo do módulo.
- **Faixa B** — criar campanha nova (gera → review → publish em pausa). Espinha canónica = `meta_publish_plan` + `MetaPublishPanel` (prepare → dry-run → "Confirmar e criar no Meta" → activate). Pista paralela "Strategies" (`strategy-deploy`/`deployment-toggle` + `meta_campaign_strategy_deployments`) é aposentada.
- **Brief determinístico único** alimenta todos os LLMs (Flash sozinho por defeito; Gemini Pro + GPT-5 quando o toggle de duelo está ON via `crm-audience-duel`). Árbitro é determinístico + escolha humana; parecer textual LLM é opcional e nunca seleciona.

## Audiências do MP CRM — dois mecanismos distintos (NÃO confundir)

> Secção acrescentada em 28/jun/2026 para resolver confusão recorrente entre sessões sobre "a lista de leads do MP CRM", "a audiência de 5000 clientes" e "Customer Match".

### Modelo de dados (confirmado por inspeção à BD em 28/jun/2026)

- **`public.leads`**: ~5050 registos. São **INTERAÇÕES** (cliques/visitas via campanhas e portal), capturadas ao longo do dia. **ARMADILHA CRÍTICA**: a tabela `leads` **NÃO TEM email nem telefone**. Tem `contact_id` (FK opcional), `event_id`, `fbc`, `fbp`, `utm_*`, `mp_click_id`, `capi_status`, `capi_sent_at`. ~4974 dos leads são anónimos (`contact_id` NULL), mas ~4786 têm `fbc`/`fbp`. É o número "Leads (30 dias)" que aparece no painel do MP CRM.
- **`public.contacts`**: ~77 registos. **ESTES** sim têm dados de contacto: `email`, `phone_e164`, `email_hash_sha256`, `phone_hash_sha256` (hashes JÁ pré-calculados), `consent_email`, `consent_whatsapp`, `is_active`. É a base de relacionamento. É o número "Contactos" do painel.
- **Relação**: um lead pode apontar para um contacto via `contact_id`, mas a maioria não aponta (interação anónima identificada só por `fbc`/`fbp`).

### Mecanismo 1 — Lista dos ~5040 leads (CAPI, audiência de SITE/EVENTO)

- A "lista que cresce o dia todo" alimenta uma audiência de **SITE/EVENTO** no Meta via CAPI (Conversions API), enviando eventos com `fbc`/`fbp` ao pixel. O Meta agrupa essas pessoas numa audiência de site. **NÃO é Customer Match**, **NÃO usa email/telefone**.
- Motor: edge function `process-leads-capi` + RPC `process_leads_capi_batch`. Crons: `leads-capi-5min` (só com campanha ativa) e `leads-capi-daily` (06:00). Coluna de controlo: `leads.capi_status` (`NULL` = por processar, `sent` = enviado, `skipped_old` = >7 dias descartado pela regra do Meta, `error_insufficient_data`, `skipped_no_pixel`) + `leads.capi_sent_at`.
- Regra dos 7 dias: leads com mais de 7 dias são `skipped_old` (o Meta descarta eventos antigos). Por isso o histórico antigo não entra por aqui (usa-se como seed de lookalike, não CAPI retroativo).
- Esta é a "lista do MP CRM alimentada automaticamente" a que o Pedro se refere.

### Mecanismo 2 — Customer Match (listas por email/telefone)

- A função `crm-meta-audience-sync` (chamada pelo cron jobid 35 `crm-meta-audiences-daily-sync`, 04:00) faz Customer Match: pega email/telefone com hash e faz upload para custom audiences do tipo `CUSTOMER_LIST` (endpoint `/<audience_id>/users`).
- **ATENÇÃO**: hoje esta função lê a fonte **ERRADA** (`public.lead_capture`, ~58 linhas via JOIN `events` por slug) — **NÃO lê `public.contacts`** (que tem os hashes prontos). Além disso tenta `/users` para **TODAS** as audiências `enabled`, incluindo `WEBSITE`/`LOOKALIKE`/`IG_BUSINESS`, que o Meta rejeita. E está congelada desde 24/jun (`meta_audience_sync_log` vazia desde sempre — provável falha de auth no gateway, por confirmar). **[REGISTAR como pendente, ver issue.]**
- A audiência "[LISTA] clientes mundo propicio - ticketline" (`audience_id_meta` `120235894428940595`, subtype `CUSTOM`, `total_records_meta` 5000) é uma lista **IMPORTADA À MÃO** no passado (estática), **NÃO é a base viva do CRM**. Não confundir os 5000 dela com os ~5040 leads do Mecanismo 1.

### Regra de ouro para futuras sessões

- "Audiência do MP CRM que cresce sozinha" = **Mecanismo 1** (CAPI, `leads`, `fbc`/`fbp`).
- "Carregar lista de clientes por email/telefone" = **Mecanismo 2** (Customer Match, `contacts`).
- **NUNCA** assumir que `leads` tem email. **NUNCA** confundir a lista Ticketline importada (5000 estáticos) com a base viva.

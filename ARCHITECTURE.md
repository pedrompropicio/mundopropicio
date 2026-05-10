# MP Suite — Arquitetura

**Versão do documento:** 1.0
**Última atualização:** 2026-05-09
**Estado:** Ativo
**Responsável:** Pedro (Mundo Propício)
**Audiência:** Programador solo + assistentes de IA (Claude Code, Lovable, Claude chat); secundária: futuras contratações ou parceiros técnicos.

---

## 0. Como usar este documento

Este documento é o contrato arquitetural da **MP Suite** — a plataforma construída e operada pela Mundo Propício. Estabelece:

- **Âmbito:** o novo produto CRM/Ads e a sua integração com o ERP MP Gestão Eventos existente
- **Decisões:** o que construímos, porquê, que alternativas rejeitámos
- **Fronteiras:** onde os produtos começam e terminam, o que cruza, o que não cruza
- **Normas operacionais:** como desenvolvemos, testamos, implementamos, monitorizamos

**Não é** documentação do ERP em si — essa vive em `DOCUMENTATION.md`, `DATABASE.md`, `SCREENS.md`, `INTEGRATIONS.md`. Este documento referencia esses sem duplicar.

**Quando este documento muda:** qualquer decisão nas secções 1-7 só se altera por revisão explícita comprometida em git. A secção 9 (ADRs) é append-only — ADRs substituídos mantêm-se visíveis com o estado atualizado.

**Quando houver dúvida durante o desenvolvimento:** consultar este documento primeiro. Se não responder à pergunta, levantar a questão (com o humano + IA) e atualizar o documento com a nova decisão.

---

## 1. Visão de produto

### 1.1 Os dois produtos

**MP Gestão (ERP)** — ERP vertical para empresas de produção de eventos. Gestão financeira, operacional e fiscal. Existente. ~90 tabelas, 38 Edge Functions, 30+ relatórios.

**MP Audience (CRM/Ads)** — Plataforma de growth para empresas de produção de eventos. Captação de audiência, gestão de tráfego pago, atribuição de vendas, automação de ciclo de vida. Novo. Em fase de desenho.

(Ambos os nomes são internos/de trabalho — branding final a definir antes do lançamento público do MP Audience.)

### 1.2 Personas

**Compradores e utilizadores do MP Gestão:**
- CFO, controller, diretor financeiro (decisor)
- Produtor de eventos, diretor de produção (utilizador intensivo)
- Responsável de bilheteira (utilizador transacional)
- Sócio/parceiro (utilizador limitado via portal)

**Compradores e utilizadores do MP Audience:**
- CMO, diretor de marketing (decisor)
- Gestor de tráfego, especialista de paid media (utilizador intensivo)
- Community manager (utilizador limitado)
- CFO (consulta atribuição e relatórios de ROI)

### 1.3 Propostas de valor

**MP Gestão:** "Gestão financeira ponta-a-ponta construída para a estrutura única da produção de eventos — eventos master/split, rateio virtual, BP versionado, cache de artistas por tier, reconciliação real de settlements."

**MP Audience:** "Plataforma única para captar audiência, gerir tráfego pago no Meta e Google, atribuir vendas de bilhetes à origem, e crescer a base de clientes — tudo em conformidade com RGPD/LGPD desde o desenho."

### 1.4 Mercados

Inicial: Portugal, Brasil. Ambos no âmbito desde o MVP.
Futuro: Espanha (extensão ibérica), outros mercados lusófonos.
Fora do âmbito (atualmente): mercados anglófonos (UK, US, etc.) — dinâmica competitiva e tolerância de preço diferentes.

### 1.5 Modelo arquitetural e caminho de transição

Este documento estabelece **Modelo A → Modelo B** como o caminho arquitetural e comercial:

**Modelo A (atual)** — uma única aplicação, login único, módulos dentro do mesmo produto. CRM/Ads construído como módulo adicional dentro da casca do MP Gestão Eventos, mas com **fronteiras internas estritas** que antecipam a separação.

**Modelo B (alvo, 12-24 meses)** — dois produtos distintos com branding distinto, websites distintos, pricing distinto, motion de vendas distintos. Mesma plataforma técnica por baixo. SSO entre produtos, infraestrutura partilhada, mas comercialmente separados.

**Modelo C (rejeitado para o futuro previsível)** — separação técnica completa (repos separados, deploys separados, bases de dados separadas). Não justificado à escala atual.

**Gatilhos para a transição Modelo A → Modelo B:**
- 20+ clientes pagantes estáveis
- Sinal claro de mercado de que compradores querem um produto sem o outro
- Capacidade de marketing/vendas para manter dois go-to-market distintos
- Receita anual que justifique o investimento de marketing em branding dual

**Ver ADR-001 e ADR-007 para racional detalhado.**

---

## 2. Princípios arquiteturais

Estes princípios aplicam-se a todo o código, dados e decisões operacionais na plataforma.

### 2.1 Multi-tenant por company_id com RLS

Cada tabela que contém dados específicos de tenant tem `company_id UUID NOT NULL` e política Row Level Security: `USING (company_id = current_setting('app.company_id')::uuid)`.

Padrão estabelecido no ERP existente. Tabelas novas do CRM seguem o mesmo padrão sem exceção.

**Não são permitidas queries cross-tenant** no código de aplicação. Se forem necessárias analíticas agregadas entre tenants (ex.: para monitorização de plataforma), passam por Edge Functions dedicadas com `service_role` e auditoria explícita.

### 2.2 Separação de schemas (erp, crm)

Tabelas novas de CRM/Ads vivem no schema PostgreSQL `crm`. Tabelas existentes do ERP permanecem em `public` (renomeação gradual para `erp` é opcional, não bloqueante).

```sql
crm.audience_profiles
crm.ad_campaigns
crm.consent_records
-- etc.
```

Isto:
- Estabelece fronteiras lógicas claras dentro da mesma base de dados
- Permite extração futura (Modelo C) sem reescrever queries
- Torna queries cross-domain acidentais visíveis (têm de ser explícitas: `SELECT FROM erp.events JOIN crm.campaigns`)
- Permite políticas de backup/retenção diferentes por schema

**Foreign keys cross-schema são permitidas mas minimizadas.** Ver secção 3.

### 2.3 Namespacing de Edge Functions

Todas as Edge Functions novas seguem o padrão `<domínio>-<verbo>-<substantivo>`:

```
supabase/functions/
  crm-meta-oauth-callback/
  crm-sync-meta-metrics/
  crm-refresh-ad-tokens/
  crm-anonymize-inactive-profiles/
  erp-import-ticketline/        (existente, pode renomear)
  erp-bp-snapshot/              (existente, pode renomear)
  shared-audit-log-write/       (verdadeiramente cross-domain apenas)
```

As funções **não** podem cruzar domínios. Uma função que precise de dados ERP e CRM ou vive em `shared-` (raro, requer justificação) ou é dividida em duas funções a comunicar via contrato bem definido.

### 2.4 Routing top-level no frontend

Rotas namespaced por domínio de produto ao nível superior:

```
/erp/eventos
/erp/transacoes
/erp/relatorios

/crm/campanhas
/crm/audiencias
/crm/criativos
/crm/atribuicao

/admin/*       (cross-domain, restrito a platform_admin)
/parceiro/*    (existente, portal de parceiro)
```

Permite extração futura para subdomínios (`erp.mpsuite.com`, `crm.mpsuite.com`) sem refator do React Router.

### 2.5 Namespacing de permissões

Strings de permissão usam notação ponto com prefixo de domínio:

```
erp.event.create
erp.transaction.read
erp.report.dre

crm.campaign.create
crm.campaign.publish
crm.audience.export
crm.attribution.view
```

As 26 permissões existentes no ERP serão **renomeadas gradualmente** com prefixo `erp.` numa migração não-disruptiva. Permissões CRM novas usam prefixo `crm.` desde o dia um.

### 2.6 Audit log obrigatório onde toca em dinheiro ou PII

Toda ação que:
- Gasta dinheiro do cliente (mudanças de verba de ads, publicação de campanha)
- Modifica dados pessoais (criação de profile, alteração de consentimento)
- Afeta o billing (mudanças de atribuição, cálculo de fee)
- Altera configuração de plataforma (atribuição de papel, concessão de permissão)

...é registada com `actor_id, action, entity_type, entity_id, payload_before, payload_after, ip_address, user_agent, occurred_at`.

Audit logs são append-only, retidos conforme requisitos legais (7 anos PT financeiro, 5 anos BR fiscal, 6 anos para evidência de breach RGPD), particionados por mês, expirados via DROP PARTITION.

### 2.7 Source of truth é interno

Plataformas externas (Meta, Google, Ticketline, Fever, Coala) são **integrações**, não fontes de verdade. O estado canónico de cada entidade vive no nosso Supabase. IDs externos guardam-se como referências (`external_id`, `external_business_id`, etc.).

Se o Meta cair, o histórico de campanhas, atribuição e analytics do cliente continua disponível na MP Suite.

Se um cliente sair da plataforma, pode exportar tudo (requisito de portabilidade RGPD cumprido).

### 2.8 Idempotência em mutações externas

Qualquer operação que dispare chamadas a APIs externas (criar campanha no Meta, enviar email via Twilio, sincronizar audiência para o Google) leva uma chave de idempotência interna.

Retries em falhas têm de ser seguros — nunca duplicar operações. Especialmente crítico em operações que gastam dinheiro.

Implementação: coluna `idempotency_key` em tabelas relevantes, unique constraint, padrão check-before-create em Edge Functions.

### 2.9 Privacy by design

Para o CRM em particular:
- Tracking off por defeito (cookie wall é ilegal)
- Consentimento granular por finalidade, nunca agrupado
- PII encriptada ao nível da coluna, hash separado para matching
- Retenção por defeito de 24 meses para leads inativos, anonimização automática
- Portal self-service de direitos acessível a titulares de dados sem conta

Ver secção 5.5 para a arquitetura RGPD/LGPD completa.

### 2.10 Documentação como código

Toda decisão arquitetural vive neste documento. Todo schema vive em migrações versionadas. Todo contrato de API vive em tipos TypeScript (auto-gerados a partir do Supabase quando possível). Todo fluxo vive em código de Edge Function com comentários claros.

**Conhecimento tribal é dívida.** Quando IA ou humano pergunta "porque é assim?", a resposta tem de estar no repositório, não na memória de alguém.

---

## 3. Fronteiras entre produtos (ERP ↔ CRM)

### 3.1 Relações cross-schema permitidas

Existem três relações cross-schema explícitas:

**3.1.1 Referência a evento**

Campanhas CRM relacionam-se com eventos ERP:

```sql
crm.campaign_strategies.event_id REFERENCES public.events(id) -- ou erp.events
```

Esta é a única forma de o CRM saber que evento uma campanha promove. Foreign key com `ON DELETE SET NULL` (campanha sobrevive à eliminação do evento em sentido soft-delete).

**3.1.2 Referência a compra de bilhete**

Atribuição liga vendas a campanhas:

```sql
crm.revenue_attribution.ticket_purchase_id REFERENCES public.ticket_purchases(id)
```

Necessário para o billing de performance fee. O CRM não pode calcular atribuição sem ver que vendas aconteceram.

**3.1.3 Referência a profile (canónica)**

O profile de audiência é a entidade canónica "pessoa". Compradores de bilhetes do ERP referenciam profiles CRM quando o consentimento o permite:

```sql
public.ticket_purchases.audience_profile_id REFERENCES crm.audience_profiles(id)  -- nullable
```

Nullable porque:
- Cliente pode comprar sem nunca entrar no CRM (sem Fan Hub, sem consentimento)
- Reconciliação por hash de email faz match comprador → profile se existir
- Sem consentimento para marketing, profile pode existir mas marcado adequadamente

### 3.2 O que NÃO PODE cruzar

Os seguintes dados e conceitos têm de permanecer isolados por finalidade:

**3.2.1 Consentimento de marketing nunca é assumido a partir de compra**

Comprar um bilhete = `lawful_basis: contract`. Isto autoriza apenas comunicação sobre a compra. **Não** autoriza marketing.

Se um cliente compra via importação Ticketline sem entrar no Fan Hub, não tem consentimento de marketing. O ERP sabe da existência dele (comprou um bilhete). O CRM pode ter um profile dele. Mas as campanhas de marketing têm de verificar `current_consents` antes de o incluir.

Este é o erro de compliance mais comum no setor. Evitamo-lo por desenho.

**3.2.2 Dados fiscais não fluem para marketing**

NIF, detalhes de fatura, métodos de pagamento — só ERP. Ferramentas de marketing nunca os recebem. Protege o cliente (menos exposição de PII) e protege-nos (menos superfície de compliance).

**3.2.3 Comportamento de marketing não flui para relatórios financeiros**

DRE, cashflow e outros relatórios financeiros do ERP não incluem métricas de engagement de marketing. Incluem **gasto** de marketing (porque é um custo) mas não detalhes de segmentação/audiência. Audiências diferentes, padrões de acesso diferentes.

### 3.3 Padrão de integração

**MVP (Modelo A):** queries SQL cross-schema diretas dentro do mesmo Supabase. Simples, rápido, consistência transacional.

**Modelo B (alvo):** introdução progressiva de **APIs internas** entre produtos:

- ERP expõe `/internal/events`, `/internal/ticket-purchases` como endpoints autenticados
- CRM consome via auth serviço-a-serviço
- Acoplamento ao nível de schema reduzido com o tempo
- Permite ciclos de deploy independentes

**Modelo C (rejeitado por agora):** exigiria que estas APIs internas se tornassem externas (HTTPS entre instâncias Supabase separadas).

O caminho de migração A → B → C é suportado por este desenho mas só a primeira transição está comprometida.

### 3.4 Responsabilidades de auditoria divididas

- Audit log ERP: ações financeiras, eventos fiscais, payouts de parceiros
- Audit log CRM: ações de campanha, alterações de consentimento, decisões de atribuição, alterações de verba de ads
- Audit log partilhado: eventos de autenticação, alterações de papel, ações de admin de plataforma

Cada domínio é dono da sua própria tabela de audit log, todos usam a mesma forma e políticas de retenção.

---

## 4. Decisões fundamentais e trade-offs

Esta secção sumariza as decisões mais consequentes. Racional detalhado vive nos ADRs (secção 9).

### 4.1 Stack: Lovable + Supabase + Vite/React/TypeScript + Tailwind/shadcn

**Decisão:** continuar com a stack existente. Sem migração.

**Racional:** stack madura em produção, equipa solo + IA, custo de mudança excede benefício. Lovable é a camada de orquestração para UI rápida; Claude Code/Cursor para hardening; Claude (chat) para arquitetura.

### 4.2 Plataformas no MVP: Meta + Google. TikTok em v2.

**Decisão:** o MVP do Ad Manager integra Meta Marketing API e Google Ads API. TikTok adiado.

**Racional:** ~90% do gasto de paid media no mercado de eventos PT/BR. TikTok Marketing API menos madura, risco geopolítico em transferências de dados (China). Ver ADR-006.

### 4.3 Atribuição: last-click 30 dias

**Decisão:** vendas atribuídas ao MP Audience se o comprador tocou num anúncio gerido pelo sistema ou no Fan Hub nos 30 dias antes da compra. Modelo único de atribuição no MVP. Multi-touch adiado (tier Enterprise, 18+ meses).

**Racional:** simples, defensável, padrão de mercado, auditável. Ver ADR-002.

### 4.4 Pricing: híbrido (platform fee + performance fee + cap mensal)

**Decisão:** clientes pagam um platform fee mensal fixo mais um performance fee sobre vendas atribuídas, com um cap mensal específico por tier.

| Tier | Platform Fee | Performance Fee | Cap |
|---|---|---|---|
| Starter | 99 €/mês | 2,5% | 500 €/mês |
| Growth | 249 €/mês | 2,0% | 1.500 €/mês |
| Scale | 599 €/mês | 1,5% | 4.000 €/mês |
| Enterprise | Negociado | 1,0% ou flat | Negociado |

Modulação variável: compromisso anual (-15%), bianual (-25%), exclusividade (-10% no platform fee), spend processado em escrow (-0,5pp no performance fee, em v2).

**Racional:** equilibra previsibilidade de receita (platform fee como floor) com alinhamento de growth (performance variável). Cap protege o cliente em meses fortes, previne churn. Ver ADR-003.

### 4.5 Pagamento de ad spend: cliente paga as plataformas diretamente (MVP)

**Decisão:** cliente paga Meta/Google diretamente com o seu próprio método de pagamento. Sem escrow através da MP Suite no MVP.

**Racional:** mantém a MP Suite fora de intermediação financeira regulada (PSD2 na UE, regulações BACEN no BR). Reduz complexidade, acelera lançamento. Trade-off: sem margem na transação de ads, dados de spend menos granulares. Ver ADR-004. Escrow reconsiderado em v2.

### 4.6 Onboarding: self-service desde o dia um

**Decisão:** clientes ligam Meta Business e Google MCC eles próprios através de fluxos guiados no produto. Sem onboarding assistido por humano.

**Racional:** requisito de escalabilidade. Trade-off: requer UX excelente, deteção de erros, ajuda em contexto. Mitigação: vídeos curtos in-product, deteção automática de má configuração, links de suporte contextuais. Ver ADR-005.

### 4.7 Estratégia de beta: Mundo Propício como cliente zero

**Decisão:** beta inicial no uso próprio da Mundo Propício. Após 4-6 semanas de validação interna, expandir para 2-3 promotores amigos da casa com 50% de desconto durante 6 meses.

**Racional:** dogfooding elimina a incerteza "eu usaria isto?". Beta externo valida "outros usariam isto?" antes de clientes pagantes dependerem disto. Ver ADR-009.

### 4.8 Uso de IA: assistivo, não autónomo

**Decisão:** funcionalidades IA no CRM/Ads são assistivas — gerar copy, sugerir targeting, detetar anomalias, explicar performance. IA não cria autonomamente campanhas, não aloca verba entre plataformas, não modifica material visível ao cliente sem aprovação humana.

**Racional:** contenção de responsabilidade, RGPD Art. 22 (direito a intervenção humana), construção de confiança. Geração de imagem e vídeo explicitamente excluída por risco de IP e políticas das plataformas. Ver ADR-012.

### 4.9 Modelo de desenvolvimento solo + IA

**Decisão:** Pedro + Lovable + Claude Code é a equipa. Sem contratações adicionais planeadas para o MVP.

**Racional:** validado por 30 anos de experiência em IT e entretenimento; o sistema existente já mostra que o modelo escala para 90 tabelas e 38 Edge Functions. Reforço (freelancer especialista em Meta Marketing API) considerado mas adiado até à Fase 4 (Google Ads) se necessário.

---

## 5. Domínios de dados

### 5.1 Domínio ERP (existente)

Documentado em `DATABASE.md`. Sumário das principais entidades:

- `events`, `event_splits` — hierarquia de eventos com rateio master/split
- `transactions`, `business_plan_versions` — movimentos financeiros com BP versionado
- `ticket_offices`, `ticket_purchases`, `settlements` — bilheteira e reconciliação
- `artists`, `cache_tiers` — relações com artistas e pricing por tier
- `partners`, `partner_payouts` — sócios e cálculo de payouts
- `chart_of_accounts` (L1>L2>L3) — plano de contas
- `suppliers`, `quotes`, `vat_records` — fornecedores, cotações, IVA
- `camarim_sessions`, `ocr_extractions` — camarim com OCR Gemini
- `companies`, `profiles`, `user_roles`, `role_permissions` — multi-tenant + RBAC

90 tabelas no total. RLS imposta. Ver `DATABASE.md` para ERD completo.

### 5.2 Domínio CRM (novo)

Principais grupos de entidades:

**5.2.1 Audiência**
- `crm.audience_profiles` — pessoa canónica, PII encriptada, hash para matching
- `crm.audience_events` — timeline comportamental (page views, lead form, compras, aberturas), particionada mensalmente
- `crm.audience_segments` — segmentos guardados para targeting e sync
- `crm.audience_segment_members` — membership em segmentos

**5.2.2 Consentimento**
- `crm.consent_records` — append-only, por finalidade, com prova (hash de IP, versão da política, texto evidence)
- `crm.current_consents` (vista materializada) — estado atual para verificações da aplicação
- `crm.gdpr_requests` — tracking de pedidos de direitos com SLA de 30 dias

**5.2.3 Gestão de Ads**
- `crm.ad_platform_connections` — tokens OAuth encriptados, por plataforma por tenant
- `crm.campaign_strategies` — estratégia de marketing ligada a eventos do ERP
- `crm.ad_campaigns` — campanhas ao nível da plataforma
- `crm.ad_sets` — audiência + targeting + verba
- `crm.ads` — criativo + copy + destino
- `crm.creative_assets` — biblioteca de media uploaded
- `crm.ad_metrics_daily` — particionada mensalmente, sync das plataformas
- `crm.revenue_attribution` — atribuição de vendas last-click 30d

**5.2.4 Auditoria e operacional**
- `crm.ad_manager_audit_log` — particionada mensalmente
- `crm.role_budget_limits` — caps de gasto por papel
- `crm.gdpr_requests` — já notado acima

Total estimado: ~30-40 tabelas quando totalmente construído.

### 5.3 Política de retenção e expurgo

| Tipo de dado | Retenção | Mecanismo |
|---|---|---|
| Audience profiles (ativos) | Enquanto engajados | Manual / orientado por cliente |
| Audience profiles (inativos) | 24 meses | `cron.schedule('anonymize-inactive', '0 3 1 * *')` |
| Audience events | 24 meses | DROP PARTITION mais antigo que 24 meses |
| Consent records | 7 anos (evidência de breach RGPD + auditoria) | Append-only, sem expiry dentro da retenção |
| Ad metrics daily | 24 meses hot, arquivado depois | DROP PARTITION + arquivo S3 |
| Audit logs | 7 anos (PT financeiro) / 5 anos (BR fiscal) | DROP PARTITION |
| GDPR requests | 6 anos | DROP PARTITION |
| Tokens (ativos) | Enquanto válidos | Refresh / substituição |
| Tokens (revogados) | Eliminados imediatamente | DELETE on revogação |

Eliminação é automática via `pg_cron`. Eliminação manual apenas via procedimento documentado e auditado.

### 5.4 Política de encriptação

**Em repouso:**
- Storage do Supabase encriptado ao nível de infraestrutura
- Colunas PII (`email_encrypted`, `phone_encrypted`) adicionalmente encriptadas com `pgcrypto` usando chave por tenant derivada de master key + salt
- Tokens (`access_token_encrypted`) seguem o mesmo padrão
- Colunas hash (`email_hash`, `phone_hash`) SHA-256 com salt global apenas para matching

**Em trânsito:**
- HTTPS apenas para todo o tráfego externo
- TLS para conexões Supabase
- Chamadas Edge Function-to-API sempre sobre HTTPS

**Gestão de chaves:**
- Master key em Supabase Vault (ou variável de ambiente segura para Edge Functions)
- Chaves por tenant derivadas via HKDF
- Sem chaves em controlo de versão
- Política de rotação de chaves: rotação por tenant suportada mas ainda não automatizada; rotação de master key em incidente

**Controlos de acesso:**
- Função Postgres `decrypt_token()` usa `SECURITY DEFINER` e verifica papel do chamador
- Código de aplicação nunca lê tokens em raw; sempre via Edge Function com auditoria
- Administradores de base de dados não têm acesso a PII em plaintext nem a tokens (chaves de encriptação separadas)

### 5.5 Arquitetura RGPD/LGPD

Compliance é estrutural, não bolted-on. Elementos-chave:

**5.5.1 Base legal por finalidade**

Cada uso de dados está ligado a uma base legal específica:
- `marketing_email`: consentimento (Art. 6(1)(a) RGPD)
- `marketing_whatsapp`: consentimento
- `profiling`: consentimento
- `third_party_meta`: consentimento
- `third_party_google`: consentimento
- `transactional_email`: contrato (Art. 6(1)(b))
- `fiscal_records`: obrigação legal (Art. 6(1)(c))
- `audit_logs`: interesse legítimo (Art. 6(1)(f)) com avaliação documentada

Marketing **nunca** usa interesse legítimo. A posição da CNPD/EDPB é inequívoca neste ponto.

**5.5.2 Consentimento granular**

Cada finalidade tem o seu próprio toggle, default OFF, retirável num clique. Recolha de consentimento regista: `purpose, granted, granted_at, ip_hash, user_agent, policy_version, evidence (texto mostrado)`.

**5.5.3 Transferências transfronteiriças**

Meta e Google processam dados nos EUA. Justificadas via:
- Self-certificação DPF (Data Privacy Framework) dos receivers
- SCCs (Standard Contractual Clauses) no DPA com cada subprocessador
- TIA (Transfer Impact Assessment) documentado por subprocessador

Documentadas na DPIA, mencionadas na política de privacidade.

**5.5.4 DPIA**

Obrigatória antes do lançamento. Atualizada anualmente ou em mudança material. DPO externo contratado (~300-500 €/mês) para validar e servir como ponto de contacto.

**5.5.5 Direitos dos titulares**

Portal self-service em `fans.<tenant>.com/meus-dados`:
- Acesso (export do profile + events em JSON)
- Retificação (editar profile)
- Apagamento (pedido de eliminação, registado em `gdpr_requests`)
- Portabilidade (export legível por máquina)
- Retirada de consentimento (um clique, propaga em minutos)
- Oposição (marcar profile como opted-out de todo o marketing)

Edge Function `crm-gdpr-request-handler` responde dentro do SLA de 30 dias, automatizada onde possível, escalonada para DPO quando não.

**5.5.6 Notificação de breach**

Notificação à CNPD/ANPD em 72 horas pré-templatizada. Titulares afetados notificados se "alto risco para direitos e liberdades".

**5.5.7 Records of processing (Art. 30 RGPD)**

ROPA mantido externamente (na ferramenta do DPO ou folha de cálculo simples) conforme legalmente exigido. Atualizado quando há novos fluxos de dados ou subprocessadores.

---

## 6. Operações e desenvolvimento

### 6.1 Stack e versões

- **Frontend:** Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- **Backend:** Supabase (Postgres 15+, PostgREST, Auth, Storage, Edge Functions on Deno)
- **Build/deploy:** Lovable para desenvolvimento principal, GitHub como source of truth
- **Testes:** Vitest (unit/integration), Playwright (E2E)
- **APIs externas:** Meta Marketing API (v19+), Google Ads API (v15+), Twilio, Lovable AI Gateway (Gemini)
- **Monitorização:** Sentry (erros), Better Stack (logs/uptime), UptimeRobot (sintético)
- **CMP:** Didomi (recomendado)

### 6.2 Fluxo de desenvolvimento

**Ciclo de vida de feature:**

1. **Spec** — feature especificada neste chat (ou em documento escrito) antes da implementação
2. **Protótipo UI** — Lovable para protótipo rápido, validação visual imediata
3. **Hardening** — Claude Code (ou Cursor) lê output do Lovable, refatora para produção: tratamento de erros, types, edge cases, cobertura de testes
4. **Migrações de schema** — geradas e revistas em Claude Code, comprometidas em `supabase/migrations/`
5. **Edge Functions** — geradas e revistas em Claude Code
6. **Testes** — Vitest para lógica, Playwright para fluxos. Alvo de cobertura: 70% de linhas para código novo, 100% para caminhos de billing/atribuição/consentimento
7. **Self-review** — Pedro revê com Claude Code fazendo perguntas dirigidas
8. **Merge para main** — push direto ou PR conforme risco
9. **Deploy** — automático em merge (Lovable) ou trigger manual
10. **Monitorização** — Sentry/Better Stack para erros, dashboards customizados para KPIs de negócio

**Caminhos críticos requerem rigor extra:**
- Tudo o que toca em `crm.consent_records`
- Tudo o que toca em `crm.revenue_attribution`
- Tudo o que toca em `crm.ad_platform_connections`
- Tudo o que toca em `public.transactions` (financeiro)
- Políticas RLS (qualquer mudança requer verificação em staging)

### 6.3 Cadência de releases

- **Continuous deployment** para features não-críticas
- **Releases semanais** como cadência estável para mudanças anunciadas
- **Processo de hotfix** documentado para issues críticos (falhas de refresh de token, miscalculações de billing, patches de segurança)

Feature flags via tabela de configuração Supabase, gating de features novas por tenant para rollout graduado.

### 6.4 Monitorização e alertas

**Métricas de saúde monitorizadas:**
- Taxa de erro de Edge Functions por função
- Conexões à base de dados Supabase, queries lentas
- Rate limits de APIs por plataforma (Meta, Google) por tenant
- Taxa de sucesso de cron jobs
- Taxa de sucesso de refresh de tokens (CRÍTICO — alerta imediato em falha)
- Taxa de sync drift
- Conclusão de jobs de atribuição (mensal)

**Canais de alerta:**
- Slack (ou equivalente) para severidade média
- SMS para Pedro para crítico (falhas de token durante campanha ativa, erros de política RLS, falhas de jobs de billing)

**Dashboards:**
- Dashboard admin interno para Pedro: saúde de tenant, saúde de sistema, anomalias
- Dashboards de cliente: métricas do próprio tenant, transparência de atribuição, performance de campanhas

### 6.5 Resposta a incidentes

**Níveis de severidade:**

- **SEV-0 (catastrófico):** fuga de dados, cruzamento de dados multi-tenant, bypass de RLS. Parar tudo, corrigir agora.
- **SEV-1 (crítico):** campanha ativa a perder dados, miscalculação de billing, outage completo da plataforma. Em 1 hora.
- **SEV-2 (alto):** outage de tenant único, feature única partida, sync parado por >24h. No mesmo dia.
- **SEV-3 (médio):** issues de UX, bugs não-críticos. Próximo sprint.

**Runbooks** documentados no repositório (`/runbooks/`):
- Recuperação de falha de refresh de token
- Reconciliação de drift quando sync de API falha
- Procedimento de validação de política RLS
- Ajuste manual de atribuição com audit trail
- Export de dados de cliente (portabilidade RGPD)
- Eliminação de dados de cliente (apagamento RGPD)

Runbooks gerados com Claude Code a partir de código real, não a partir de memória. Atualizados em cada mudança de código relacionada.

### 6.6 Backup e recuperação

- Backups nativos do Supabase (diários, 7 dias de retenção)
- Exports lógicos semanais para storage separado (90 dias de retenção)
- Drill trimestral de recuperação (restaurar para ambiente de teste, validar)
- Alvo de RTO: 4 horas para restauro completo
- Alvo de RPO: 24 horas (aceitável para SaaS à escala atual)

### 6.7 Cadência de revisão de segurança

- **Auditoria interna mensal** com Claude a analisar repo (políticas RLS, secrets em código, permissões de edge functions, pontos de compliance RGPD)
- **Revisão externa trimestral** por profissional de segurança independente (adiada até 50+ tenants pagantes, dispendiosa)
- **Pen test anual** (adiado até transição para Modelo B ou primeiro cliente Enterprise)

---

## 7. Riscos conhecidos e mitigações

### 7.1 Riscos técnicos

**7.1.1 Perda de token Meta durante campanha ativa**

- **Probabilidade:** Média (expiry de tokens, mudanças de permissões da Business, mudanças no fluxo OAuth)
- **Impacto:** Alto (cliente perde sync, pode não notar, performance fee miscalculado)
- **Mitigação:** Monitorização agressiva (validação de 15 min), banner persistente na UI em desconexão, auto-pause em falha sustentada (>24h), alerta por email + SMS ao admin

**7.1.2 Drift entre MP e Meta/Google**

- **Probabilidade:** Alta (clientes vão editar campanhas diretamente nas plataformas)
- **Impacto:** Médio (confusão do utilizador, potencialmente billing incorreto se estado divergir)
- **Mitigação:** Deteção de drift cada 15 min, UI marca claramente entidades em drift, "adoptar externo" como resolução default, audit log de cada adoção

**7.1.3 Atrasos de App Review do Meta**

- **Probabilidade:** Média-Alta (Meta apertou recentemente)
- **Impacto:** Alto (bloqueia lançamento de produção)
- **Mitigação:** Submeter cedo (semana 1 da Fase 1), justificar âmbito explicitamente, preparar para iterar sobre feedback do Meta, ter caminho read-only da Fase 1 pronto como fallback

**7.1.4 Custo de infraestrutura a escalar inesperadamente**

- **Probabilidade:** Média
- **Impacto:** Médio (compressão de margem)
- **Mitigação:** Monitorização de custo por tenant, alertas em uso outlier, arquivamento baseado em partições para storage mais barato, passes de otimização periódicos

**7.1.5 Performance de base de dados sob carga multi-tenant**

- **Probabilidade:** Baixa à escala MVP, aumenta com crescimento
- **Impacto:** Médio-Alto
- **Mitigação:** Índices desde o dia um, particionamento de tabelas de alto volume, revisões de eficiência de políticas RLS, auditorias de query plan

### 7.2 Riscos de compliance

**7.2.1 Inspeção da CNPD**

- **Probabilidade:** Baixa à nossa escala, aumenta com visibilidade pública
- **Impacto:** Alto (multas até 4% da receita global, dano de marca)
- **Mitigação:** DPIA desde o dia um, consentimento granular, audit logs, DPO designado, versionamento de políticas, preservação de evidência

**7.2.2 Pedido de direitos de titular não respondido a tempo**

- **Probabilidade:** Média (volume escala com número de clientes)
- **Impacto:** Alto (violação RGPD)
- **Mitigação:** Portal self-service trata ~80% automaticamente, dashboard interno de SLA, escalonamento para DPO em casos complexos

**7.2.3 Fuga de dados cross-tenant**

- **Probabilidade:** Muito Baixa (RLS imposta, padrão multi-tenant provado no ERP)
- **Impacto:** Catastrófico (risco existencial para a empresa)
- **Mitigação:** RLS em cada tabela tenant, teste automatizado que verifica isolamento, revisão de segurança em cada PR que toque RLS, sem `service_role` em código de aplicação

### 7.3 Riscos comerciais

**7.3.1 Disputas de atribuição com clientes**

- **Probabilidade:** Média (vai acontecer)
- **Impacto:** Médio (carga operacional, potencial churn de cliente)
- **Mitigação:** Dashboard transparente mostrando cada venda atribuída, fluxo de contestação com janela de 7 dias, presunção contratual de atribuição salvo evidence em contrário, audit trail de cada disputa

**7.3.2 Churn de cliente durante transição Modelo A → B**

- **Probabilidade:** Baixa se bem comunicada
- **Impacto:** Médio
- **Mitigação:** Transição é maioritariamente camada de branding/marketing; experiência técnica continua; clientes existentes grandfathered no pricing; comunicação com bastante antecedência

**7.3.3 Concorrência ataca o nicho**

- **Probabilidade:** Baixa-Média
- **Impacto:** Médio-Alto
- **Mitigação:** Especialização vertical (conhecimento de produção de eventos), posicionamento bilingue PT/BR, proposta integrada (CRM + Ads + ERP) difícil de replicar, relações com clientes construídas cedo

### 7.4 Riscos operacionais

**7.4.1 Bottleneck de programador solo (Pedro)**

- **Probabilidade:** Alta (é o modelo operacional)
- **Impacto:** Médio (resposta lenta a incidentes, bandwidth limitado)
- **Mitigação:** Desenvolvimento aumentado com IA, runbooks, monitorização com múltiplos canais de alerta, planeamento para primeira contratação após 30+ clientes pagantes

**7.4.2 Concentração de conhecimento**

- **Probabilidade:** Alta
- **Impacto:** Alto (bus factor de 1)
- **Mitigação:** Este documento, documentação compreensiva de código, runbooks, Claude como memória institucional acessível a qualquer um

---

## 8. Fora do âmbito (não-objetivos explícitos)

Documentar não-objetivos é tão importante como documentar objetivos. Estas são decisões tomadas e comunicadas para evitar drift de scope:

**8.1 Bilheteira própria**

Decisão: integrar via parsers (Ticketline, Fever, Coala) e fazer parceria com fornecedor white-label para necessidades de venda de bilhetes. Não construir engine de ticketing.

**Racional:** ticketing requer operações 24/7 durante noites de evento, compliance regulatório (certificação AT em Portugal), processamento de pagamentos à escala. Fora do modelo operacional solo + IA.

**8.2 Geração de criativos visuais por IA**

Decisão: não incluir geração de imagem ou vídeo no Ad Manager.

**Racional:** risco de IP em likeness de artistas, desafios de consistência de marca, políticas de plataformas a apertar em divulgação de conteúdo IA. Reconsiderado se e quando plataformas fornecerem frameworks mais claros.

**8.3 Multi-touch attribution no MVP**

Decisão: apenas last-click. Multi-touch adiado para tier Enterprise, possivelmente 18+ meses no futuro.

**Racional:** complexidade de explicação a clientes, potencial de disputa, custo de implementação. Ver ADR-002.

**8.4 TikTok no MVP**

Decisão: apenas Meta + Google no lançamento.

**Racional:** TikTok Marketing API menos madura, preocupações geopolíticas/transferência de dados, menor share do gasto de ads PT/BR. Ver ADR-006.

**8.5 Modelo C (separação técnica completa)**

Decisão: não no roadmap previsível.

**Racional:** prematuro à escala atual. Multiplicaria custo de infraestrutura e burden operacional sem benefício claro de produto ou comercial.

**8.6 Apps móveis nativas**

Decisão: PWAs (já existe para Camarim Equipa). Sem apps iOS/Android nativas para o MVP.

**Racional:** custo de manutenção, overhead da App Store, abordagem PWA atual tem funcionado. Reconsiderado se procura de cliente emergir fortemente.

**8.7 Mercados anglófonos**

Decisão: PT e BR apenas. UK/US/etc. não no roadmap.

**Racional:** dinâmica competitiva diferente (HubSpot, Klaviyo, Mailchimp dominantes), tolerância de preço diferente, custo de internacionalização. Especialização em PT/BR é uma força, não uma limitação.

**8.8 Módulo de gestão de patrocínios**

Decisão: identificado como valioso na análise de produto mas **adiado** para pós-MVP do CRM/Ads.

**Racional:** disciplina de scope. Patrocínios é um módulo distinto que merece a sua própria fase de desenho, não tackled no trabalho atual.

**8.9 Módulo de produção (riders, run of show, equipa)**

Decisão: identificado como valioso mas adiado.

**Racional:** mesmo que patrocínios. Disciplina de scope. Forte candidato para próximo módulo grande após CRM/Ads estabilizar.

**8.10 Programa white-label / revendedor**

Decisão: não no MVP.

**Racional:** adiciona complexidade (branding customizado por revendedor, fluxos de billing). Vendas diretas primeiro.

---

## 9. Anexo — Architecture Decision Records (ADRs)

ADRs documentam decisões significativas com o seu contexto e racional. Append-only: ADRs substituídos mantêm-se visíveis com estado atualizado.

### ADR-001: Separação arquitetural Modelo A (schemas, namespaces, routing)

**Estado:** Aceite, 2026-05-09
**Contexto:** Construir um produto CRM/Ads ao lado do ERP existente dentro de uma única aplicação requer decidir quão estritamente separar os dois domínios tecnicamente.
**Decisão:** Separar por schema PostgreSQL (`crm`, futuro `erp`), naming de Edge Functions (`crm-*`, `erp-*`), rotas top-level no frontend (`/crm/*`, `/erp/*`) e namespacing de permissões (`crm.*`, `erp.*`).
**Alternativas consideradas:**
- (a) Sem separação, misturar todas as tabelas em `public`. Rejeitada: cria dívida estrutural que se torna dolorosa na transição para Modelo B.
- (b) Separação Modelo C completa com instâncias Supabase separadas. Rejeitada: prematuramente dispendiosa para a escala atual.

**Consequências:** Pequeno custo upfront (1-2 dias). Grandes poupanças na futura transição para Modelo B. Complexidade adicional marginal em queries cross-domain (agora têm de especificar schema explicitamente), o que é na verdade uma feature (visibilidade).

### ADR-002: Last-click 30 dias como modelo de atribuição do MVP

**Estado:** Aceite, 2026-05-09
**Contexto:** Performance pricing requer um modelo de atribuição defensável. Várias opções existem (last-click, first-click, multi-touch com várias ponderações, data-driven).
**Decisão:** Last-click com janela de 30 dias. Uma venda é atribuída ao MP Audience se o comprador tocou num anúncio gerido pelo sistema ou no Fan Hub nos 30 dias antes da compra.
**Alternativas consideradas:**
- (a) Multi-touch attribution (linear, U-shaped, time-decay). Rejeitada para MVP: complexa de explicar, difícil de calcular com precisão, gera disputas.
- (b) First-click 30 dias. Rejeitada: subvaloriza drivers finais de conversão.
- (c) Modelo data-driven customizado. Rejeitado: volume de dados insuficiente inicialmente, opaco a clientes.

**Consequências:** Algumas vendas "moralmente atribuíveis" não são creditadas (orgânico apanhou o último clique depois de paid ter conduzido a descoberta). Trade-off aceitável por clareza e resistência a disputa. Multi-touch reconsiderado para tier Enterprise em 18+ meses quando volumes de dados o justificarem.

### ADR-003: Pricing híbrido (platform fee + performance fee + cap)

**Estado:** Aceite, 2026-05-09
**Contexto:** Cliente sugeriu pricing baseado em performance (como agências). Performance puro tem armadilhas conhecidas em SaaS (imprevisibilidade de receita, custo de infra não coberto em meses fracos).
**Decisão:** Pricing tiered com platform fee fixo + performance fee variável sobre vendas atribuídas + cap mensal por tier.
**Alternativas consideradas:**
- (a) SaaS puro flat-fee tiered. Rejeitada: não captura upside com clientes em crescimento, não diferencia de SaaS genérico.
- (b) Percentagem pura de performance. Rejeitada: receita imprevisível, custo de infra não coberto em meses lentos, conflito de interesse em decisões de produto.
- (c) Percentagem de ad spend (1-3%). Rejeitada: amarra pricing a spend em vez de outcome, conflito de interesse.

**Consequências:** Melhor de dois mundos para previsibilidade e alinhamento de growth. Requer implementação de motores de atribuição e billing (Fase 3). Cap protege cliente em meses altos, previne churn.

### ADR-004: Cliente paga plataformas diretamente no MVP (sem escrow)

**Estado:** Aceite, 2026-05-09
**Contexto:** Ad spend de cliente pode fluir diretamente cliente→plataforma, ou através da MP Suite como escrow (dando margem e dados).
**Decisão:** MVP — pagamento direto cliente→plataforma.
**Alternativas consideradas:** Escrow via Stripe Connect ou equivalente. Rejeitado para MVP: introduz burden regulatório de PSD2/intermediação financeira, requisitos KYC, handling fiscal complexo. Reconsiderado para v2.

**Consequências:** Margem mais baixa, dados de spend menos granulares, menos lock-in de cliente. Aceitável para MVP. Mais rápido para lançar.

### ADR-005: Onboarding self-service desde o dia um

**Estado:** Aceite, 2026-05-09
**Contexto:** Clientes têm de ligar contas Meta Business e (futuro) Google MCC. Isto tem fricção. Ou humanos ajudam (onboarding assistido) ou produto trata inteiramente (self-service).
**Decisão:** Self-service desde o dia um. Sem onboarding assistido.
**Alternativas consideradas:** Assistido por humano para os primeiros 20 clientes, depois automatizar. Rejeitada: não escala, conhecimento concentra-se em menos humanos, abranda aquisição de clientes.

**Consequências:** UX de onboarding tem de ser excelente. Requer investimento em vídeo in-product, deteção de erros, diagnósticos automatizados. Trade-off aceite: custo estrutural cedo, escalabilidade depois.

### ADR-006: Meta + Google no MVP, TikTok adiado

**Estado:** Aceite, 2026-05-09
**Contexto:** Existem múltiplas plataformas de ads. Cliente perguntou sobre suportar todas — Meta, Google, TikTok, etc.
**Decisão:** MVP integra apenas Meta e Google. TikTok em v2.
**Alternativas consideradas:**
- (a) Os três no lançamento. Rejeitada: triplica scope de integração, abranda MVP.
- (b) Apenas Meta. Rejeitada: deixa clientes Google-heavy mal servidos.

**Consequências:** ~90% do gasto de ads de eventos PT/BR coberto. Clientes TikTok recebem valor parcial inicialmente. A arquitetura suporta adicionar TikTok mais tarde via padrão de adapter.

### ADR-007: Caminho de transição Modelo A → Modelo B

**Estado:** Aceite, 2026-05-09
**Contexto:** ERP e CRM/Ads são produtos comercialmente distintos com compradores distintos. A questão é se começar como um produto (mais rápido, mais simples) ou dois (mais limpo, mais estratégico).
**Decisão:** Modelo A (produto único) para MVP, com separação arquitetural estrita (per ADR-001) preparando Modelo B (dois produtos, mesma plataforma). Transição despoletada por 20+ clientes pagantes estáveis, sinal de mercado de procura por produto único, capacidade de marketing para dual go-to-market.
**Alternativas consideradas:**
- (a) Modelo B desde o dia um. Rejeitada: complexidade de marketing prematura, contagem de clientes demasiado baixa.
- (b) Modelo A indefinidamente. Rejeitada: posicionamento torna-se confuso à medida que produtos amadurecem, motions de vendas divergem.

**Consequências:** Pequeno custo upfront em disciplina arquitetural. Transição futura é maioritariamente marketing/branding/vendas, não refator técnico. Documentado para clareza ao longo do tempo.

### ADR-008: Last-click vs multi-touch (decisão adiada)

**Estado:** Ligado a ADR-002. Ponto de re-avaliação: 18 meses pós-lançamento da Fase 3.
**Contexto:** Multi-touch attribution é mais defensável intelectualmente mas mais complexa.
**Decisão:** Adiar avaliação de multi-touch. Last-click para MVP per ADR-002.
**Trigger para re-avaliação:** Pedidos de cliente Enterprise, volume de dados suficiente para modelo data-driven, volume de disputas a sinalizar limitações de last-click.

### ADR-009: Beta com Mundo Propício como cliente zero

**Estado:** Aceite, 2026-05-09
**Contexto:** Necessidade de validar o produto antes de clientes externos pagantes dependerem dele.
**Decisão:** Mundo Propício usa o produto como cliente zero. Após 4-6 semanas de uso interno validado, expandir para 2-3 promotores amigos com 50% de desconto durante 6 meses em troca de feedback intensivo.
**Alternativas consideradas:**
- (a) Beta externo pago direto. Rejeitada: demasiado arriscado expor clientes pagantes a software early-stage.
- (b) Beta público gratuito. Rejeitada: inunda suporte com utilizadores low-commitment, qualidade de feedback diluída.

**Consequências:** Stress realista no produto através de uso próprio. Motion validada antes de clientes pagantes. Risco: dogfooding confirma o que já achamos que queremos; beta externo corrige por viés próprio.

### ADR-010: System User Tokens para integração Meta

**Estado:** Aceite, 2026-05-09
**Contexto:** Meta suporta múltiplos tipos de token: short-lived user, long-lived user (60 dias) e System User (não expira, business-owned).
**Decisão:** Usar System User Tokens para operações sustentadas.
**Alternativas consideradas:** Long-lived user tokens. Rejeitada para produção: expiry de 60 dias causa falhas silenciosas se refresh falhar; ligados a humanos individuais (problemático se a pessoa sair da organização do cliente).

**Consequências:** Cliente tem de completar Business Verification com Meta (fricção adicional de onboarding). Mitigada por orientação clara in-product.

### ADR-011: Tiers de pricing e caps (valores iniciais)

**Estado:** Aceite como valores iniciais, 2026-05-09. A rever após primeiros 10 clientes pagantes.
**Contexto:** Valores específicos em Euros para pricing tiered.
**Decisão:** Starter 99€+2,5%/cap 500€; Growth 249€+2%/cap 1.500€; Scale 599€+1,5%/cap 4.000€; Enterprise negociado.
**Alternativas consideradas:** Tier de entrada mais alto (rejeitado, exclui promotores pequenos); percentagens de performance mais baixas (rejeitado, não captura crescimento); sem caps (rejeitado, risco de churn).

**Consequências:** Posição de pricing competitiva vs. agências (mais baixo por outcome), defensável vs. SaaS flat-fee (mais alinhado com sucesso do cliente). Ajustável conforme resposta de mercado.

### ADR-012: IA é assistiva, não autónoma

**Estado:** Aceite, 2026-05-09
**Contexto:** IA pode fazer muitas coisas em advertising — gerar copy, criar audiências, alocar verba, até gerar criativos. Onde traçar a linha?
**Decisão:** IA assiste humanos (sugere copy, sugere targeting, deteta anomalias, explica performance). IA não cria autonomamente campanhas, não aloca verba entre plataformas, não modifica material visível ao cliente. Geração de imagem e vídeo explicitamente excluída.
**Alternativas consideradas:**
- (a) Otimização IA autónoma. Rejeitada: preocupações de responsabilidade, issues de RGPD Art. 22, erosão de confiança.
- (b) Sem features de IA. Rejeitada: deixa ganhos óbvios de produtividade na mesa.

**Consequências:** Humanos mantêm-se em controlo. IA acelera o seu trabalho sem substituir julgamento. Compliance com RGPD Art. 22 (direito a intervenção humana) preservada.

---

## 10. Manutenção do documento

**Owners:** Pedro (primário), assistentes IA em colaboração
**Cadência de atualização:** Em cada decisão significativa (ADRs aditivos); revisão estrutural trimestral
**Formato:** Markdown, source of truth no repositório (`/ARCHITECTURE.md`)
**Versionamento:** Semantic versioning do próprio documento
- v1.x — período pré-lançamento do MVP, atualizações frequentes esperadas
- v2.x — pós-MVP, mais estável

**Processo de mudança:** Mudanças materiais (novo ADR, ADR descontinuado, mudança de princípio) requerem commit explícito com racional na mensagem de commit.

---

*Fim do documento.*

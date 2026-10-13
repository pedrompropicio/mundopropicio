# ESTADO — newgang-portal (portal newgangfestival.pt)

Atualizado: 2026-10-13 · Decisões: D-ERP256, D-ERP257, D-ERP262

## Em que pé está
- Site no ar em https://newgangfestival.pt (projeto Lovable `1a915f50-55ca-4bb6-9abe-8f241c54647a`), com a demo `/teste` para os sócios.
- ERP F1+F2 publicado (D-ERP257): API `newgang-portal`, ecrã `/crm/sites/newgang`, Clube Newgang, email automático de confirmação.
- Tracking testado ponta a ponta a 13/10: Meta Lead + CompleteRegistration com eventID; TikTok; GA4 `ng27_clube_inscricao` via GTM-KBWT46HF v2; conversão Google Ads 7838816133 "NG27 - Inscrição Clube".
- Números (query de 13/10, 06:00 UTC): 1 site (`newgangfestival.pt`, ativo, GTM-KBWT46HF) ligado a "Newgang Festival 2027"; 5 edições na história; 2 membros do Clube (0 confirmados); 0 revelações (0 agendadas).

## A trabalhar agora
Nada.

## Próximo passo concreto
1. Preencher no CRM o link da Fever (`events.ticketing_url` está vazio), os textos (`portal_sites.content` está vazio) e a og:image (`og_image_url` está vazio).
2. Primeira revelação do line-up.
3. Remover `/teste` antes do lançamento.

## Bloqueios
- Fotos e aftermovies reais — Newgang Produções.
- Textos dos prémios e dos níveis — Pedro.
- Plano Resend antes de 03/11 — plataforma-e-infra.

## Factos que não se reinvestigam
- Sem contagens de atrações (nenhuma resposta da API traz totais).
- Cada revelação tem `club_at` (o Clube vê primeiro) e `public_at` (todos), com `public_at >= club_at`.
- A história é ordenada por ordem ascendente.
- Sem sorteio.
- O acesso ao Clube é por link pessoal (sem password).
- Os ids de pixel nunca ficam no código: vêm do CRM (`portal_sites` / `event_trackers`).
- Nas campanhas Google Newgang, a meta é só "NG27 - Inscrição Clube", para não contar a dobrar com o upload "offline (upload)".

## Clube Newgang no portal MP (mundopropicio.com)
Conteúdo movido de `estado-crm-portal-e-leads.md` a 13/10 (D-ERP262).

- **Página `/pt/newgang-festival-2027/clube` (#306, fases 1–3 publicadas a 11/10)** — standalone com a identidade do festival (logo oficial, Anton/Barlow Condensed); serve `mundopropicio.com`. Formulário: nome\*, email\*, telemóvel, e data de nascimento/cidade/código postal no `raw` de `lead_capture`. Fonte `clube_newgang`. Confirmação com partilha. Assinatura Newgang Produções + Mundo Propício + Fever. As inscrições desta página (source `clube_newgang`) também criam membros do Clube pelo trigger. A página vai ter redireção 301 para `newgangfestival.pt/clube` (F3).
- **Captação** pela edge function `portal-track`, com `company_id` definido no servidor a partir do Origin já validado — linhas novas nunca nascem órfãs. Detalhe de IP/geo em `estado-plataforma-e-infra.md` e `.lovable/memory/features/ip-geo-cache.md`.
- **Pixels:** Meta Lead (pixel do evento em `events.meta_pixel_id`); TikTok ViewContent + CompleteRegistration (pixel `DB5VO83C77U5NP31S1P0`, só com consentimento de marketing, `event_id` = `client_event_id`); GA4 `sign_up` `{event_slug, method}` no dataLayer.
- **Trackers** lidos de `public.event_trackers_public` (D-ERP251), com fallback no Clube enquanto o evento estiver `portal_visible = false`. TikTok ViewContent/InitiateCheckout também nas páginas de evento com tracker — o InitiateCheckout leva o `client_event_id` da `portal-track`, para dedupe futura com a CAPI TikTok.
- **Envios à lista (12/10)** — `process-email-queue` encaminha `news.newgangfestival.pt` pelo Resend com o segredo `RESEND_API_KEY_NEWGANG` (deploy feito; segredo ainda por colar pelo Pedro). Migração `0117_derp256_enqueue_email_batch.sql`: `enqueue_email_batch(queue, payloads jsonb[], batch_size=5000, interval_minutes=50)` (só service_role) enfileira listas grandes em lotes com atraso pgmq, e o `queued_at` = momento visível, para o TTL de 60 min não expirar mensagens. Email de teste (from "Clube Newgang <clube@news.newgangfestival.pt>", purpose marketing, com unsubscribe) pendente do segredo e do domínio Verified no Resend. Fase 4 da #306 (email de boas-vindas pelo Resend) pendente: texto a definir pelo Pedro.
- **Acompanhamento no MP CRM (#308, P1 até 02/11)** — construído a 12/10, aguarda Publish. Página `/crm/clube-newgang` no menu do MP CRM: cartões total/hoje/7 dias + barra da meta 15.000 até 02/11, agregados por dia/cidade/UTM/faixa etária (hora de Lisboa), tabela paginada com pesquisa e consentimentos, export CSV formato Fever da base completa. Migração `0111_derp252_clube_newgang_crm.sql`: RPCs SECURITY DEFINER `clube_newgang_summary` e `clube_newgang_list` (anon sem acesso; papéis admin/platform_admin/marketing_manager/content_manager; filtro à empresa ativa). Formato da data de nascimento confirmado AAAA-MM-DD (o portal valida antes de gravar no raw). Pendentes: Publish do #308; confirmar com a Fever se os consentimentos no CSV devem ser "sim"/"não" ou true/false.

## Onde ler mais
- `docs/specs/portal-newgangfestival.md`
- `docs/handoffs/2026-10-13-newgang-portal.md`

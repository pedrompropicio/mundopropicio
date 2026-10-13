# ESTADO — newgang-portal (portal newgangfestival.pt)

Atualizado: 2026-10-13 · Decisões: D-ERP256, D-ERP257, D-ERP262, D-ERP269, D-ERP270, D-ERP271, D-ERP272

## Em que pé está (13/10)
- newgangfestival.pt publicado; `/teste` removido.
- CRM `/crm/sites/newgang`: separador Geral com as 25 chaves de texto (contrato `text(site, key, fallback)` no site); 24 preenchidas em pt-PT (`ranking_prizes` vazio); og:image preenchida.
- História (consulta de 13/10, 19:38 UTC): 2023 Lisboa 20 fotos + 1 vídeo; 2023 Porto 0 fotos + 1 vídeo (Summer Edition); 2024 Lisboa 20 fotos; 2025 Lisboa vazio; 2026 Lisboa 18 fotos + 1 vídeo. Upload de fotos no CRM corrigido (caminho `<company_id>/festival-editions/...`).
- Clube: níveis Gang (0) · Elite (500) · Lenda (1.500) com benefícios no CRM. A ação "site" devolve `club.levels` e `club.rules` (só configuração, sem totais).
- `/meu-clube` sem sessão = montra do Clube, renderizada no servidor; com sessão guardada mostra "A carregar o teu Clube…" e depois o cartão do membro.
- Desempenho: cache stale-while-revalidate no SSR do site (`site`/`history` 60 s, `lineup` público 15 s, com expiração forçada em `next_reveal.public_at`; nada com token entra na cache); Cache-Control nas rotas públicas e private/no-store em `/meu-clube` e `/clube/entrar`. Na `newgang-portal`, ação "site" com consultas em paralelo e `getSite()` em cache de 60 s por instância. TTFB medido em produção: 2–4,5 s → ~0,1 s (a 1.ª visita após arranque da instância continua lenta, ~4 s). Função: leituras públicas numa só ida à base, ação `bundle` e cron `newgang-portal-quente` (4 em 4 min) — D-ERP270; servidor ~0,16–0,25 s.
- Regulamento do Clube (D-ERP271): gerido no CRM, publicado por versões; v1 em rascunho (ação `regulation` dá 404 até publicar). O site tem de mostrar o regulamento e enviar `raw.terms_version` na inscrição (trabalho no projeto do portal).
- Missões de criativos fase 1 (D-ERP272): base, CRM (Missões + Fila de moderação) e API (`missions`, `mission_upload_url`, `submit_mission`, `profile`) prontos; 0 missões criadas. Falta o ecrã no site do portal. Fase 2 (Instagram Graph API) por fazer.
- Correção (13/10, 23:11 UTC): `submit_mission` responde **401 `{error:"no_session"}`** sempre que a sessão falta ou não está confirmada — inclusive quando o `no_session` vem da RPC `club_mission_submit` (antes esse caso sairia como 400). Mesma regra das outras ações com token (`me`, `guess`, `attendance_claim`, `profile`, `mission_upload_url`). Mapeamento puro em `supabase/functions/newgang-portal/missions.ts` (`submitErrorStatus`) com teste.
- Membros do Clube: 2 (0 confirmados); revelações: 0 (consulta de 13/10, 19:38 UTC).

## A trabalhar agora
Nada.

## Próximo passo concreto
1. Link da Fever no CRM (`events.ticketing_url` vazio).
2. Primeira revelação do line-up.
3. Alargar os benefícios dos níveis (ensaios dos artistas, meet & greet) — Pedro.

## Bloqueios
- Fotos 2023 Porto e 2025; aftermovies 2024 e 2025 — equipa/Newgang Produções.
- Early entry dos Lenda no festival: suspenso até validação com a MEO Arena.
- Plano Resend antes de 03/11 — plataforma-e-infra.

## Factos que não se reinvestigam
- Sem contagens de atrações (nenhuma resposta da API traz totais).
- Cada revelação tem `club_at` (o Clube vê primeiro) e `public_at` (todos), com `public_at >= club_at`.
- A história é ordenada por ordem ascendente.
- Sem sorteio.
- O acesso ao Clube é por link pessoal (sem password).
- Os ids de pixel nunca ficam no código: vêm do CRM (`portal_sites` / `event_trackers`).
- Nas campanhas Google Newgang, a meta é só "NG27 - Inscrição Clube", para não contar a dobrar com o upload "offline (upload)".
- Alterações no CRM do site demoram até 60 s a aparecer no portal (cache); as revelações não esperam (expiração em public_at).
- Merch oficial é produto à venda, não prémio; membros têm acesso antecipado.

## Clube Newgang no portal MP (mundopropicio.com)
Conteúdo movido de `estado-crm-portal-e-leads.md` a 13/10 (D-ERP262).

- **Página `/pt/newgang-festival-2027/clube` (#306, fases 1–3 publicadas a 11/10)** — standalone com a identidade do festival (logo oficial, Anton/Barlow Condensed); serve `mundopropicio.com`. Formulário: nome\*, email\*, telemóvel, e data de nascimento/cidade/código postal no `raw` de `lead_capture`. Fonte `clube_newgang`. Confirmação com partilha. Assinatura Newgang Produções + Mundo Propício + Fever. As inscrições desta página (source `clube_newgang`) também criam membros do Clube pelo trigger. A página vai ter redireção 301 para `newgangfestival.pt/clube` (F3).
- **Captação** pela edge function `portal-track`, com `company_id` definido no servidor a partir do Origin já validado — linhas novas nunca nascem órfãs. Detalhe de IP/geo em `estado-plataforma-e-infra.md` e `.lovable/memory/features/ip-geo-cache.md`.
- **Pixels:** Meta Lead (pixel do evento em `events.meta_pixel_id`); TikTok ViewContent + CompleteRegistration (pixel `DB5VO83C77U5NP31S1P0`, só com consentimento de marketing, `event_id` = `client_event_id`); GA4 `sign_up` `{event_slug, method}` no dataLayer.
- **Trackers** lidos de `public.event_trackers_public` (D-ERP251), com fallback no Clube enquanto o evento estiver `portal_visible = false`. TikTok ViewContent/InitiateCheckout também nas páginas de evento com tracker — o InitiateCheckout leva o `client_event_id` da `portal-track`, para dedupe futura com a CAPI TikTok.
- **Envios à lista (12/10)** — `process-email-queue` encaminha `news.newgangfestival.pt` pelo Resend com o segredo `RESEND_API_KEY_NEWGANG` (deploy feito; segredo ainda por colar pelo Pedro). Migração `0117_derp256_enqueue_email_batch.sql`: `enqueue_email_batch(queue, payloads jsonb[], batch_size=5000, interval_minutes=50)` (só service_role) enfileira listas grandes em lotes com atraso pgmq, e o `queued_at` = momento visível, para o TTL de 60 min não expirar mensagens. Email de teste (from "Clube Newgang <clube@news.newgangfestival.pt>", purpose marketing, com unsubscribe) pendente do segredo e do domínio Verified no Resend. Fase 4 da #306 (email de boas-vindas pelo Resend) pendente: texto a definir pelo Pedro.
- **Acompanhamento no MP CRM (#308, P1 até 02/11)** — construído a 12/10, aguarda Publish. Página `/crm/clube-newgang` no menu do MP CRM: cartões total/hoje/7 dias + barra da meta 15.000 até 02/11, agregados por dia/cidade/UTM/faixa etária (hora de Lisboa), tabela paginada com pesquisa e consentimentos, export CSV formato Fever da base completa. Migração `0111_derp252_clube_newgang_crm.sql`: RPCs SECURITY DEFINER `clube_newgang_summary` e `clube_newgang_list` (anon sem acesso; papéis admin/platform_admin/marketing_manager/content_manager; filtro à empresa ativa). Formato da data de nascimento confirmado AAAA-MM-DD (o portal valida antes de gravar no raw). Pendentes: Publish do #308; confirmar com a Fever se os consentimentos no CSV devem ser "sim"/"não" ou true/false.

- 13/10/2026: "me" passou a devolver `history` (extrato de pontos; soma = points; sem emails; anulações negativas). Deployado; frontend do portal ainda não o mostra.

- 13/10/2026 (D-ERP273): anulações de pontos ficam no histórico (linhas void com motivo, reaprovação = geração #N); botão "Anular pontos" no CRM. Função deployada; frontend por publicar.

## Onde ler mais
- `docs/specs/portal-newgangfestival.md`
- `docs/handoffs/2026-10-13-newgang-portal.md`

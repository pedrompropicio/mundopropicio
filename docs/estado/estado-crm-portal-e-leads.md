# ESTADO — MP CRM, Portal & Leads

Atualizado: 2026-10-12 · Issues: #251, #252, #306, #308 · Fechadas: #253 (24/09), #254 (10/10) · Bloqueio: #62

## Em que pé está
Dois portais distintos, dois projetos Lovable, a mesma base Supabase:
- `mundopropicio.com` — projeto `26b95793-17b6-478c-a6e8-745c0cfb7ed9`.
- `coalafestival.pt` — projeto **Coala Portal** `bef9c59c-c2a4-453d-9aec-dae7d16c9171`.

A Early Bird 2027 do Coala está a captar em contínuo (`lead_capture`, origens `coala_hero_email` e `coala_early_bird`). Os emails do Coala saem pela API do Resend nos dois domínios verificados, `notify.coalafestival.pt` e `news.coalafestival.pt`, com chave única no segredo `RESEND_API_KEY_COALA`.

A 24/09/2026 foi resolvido o incidente que punha o ecrã "Algo correu mal" a 100% do tráfego pago da Meta (#253, fechada). A geolocalização do Coala passou a funcionar e o registo de erros de front está em produção.

## A trabalhar agora
**Clube Newgang (#306, P0 até 19/10)** — fases 1–3 feitas e publicadas a 11/10.

- **Página** `/pt/newgang-festival-2027/clube` em produção: standalone com a identidade do festival (logo oficial, Anton/Barlow Condensed); serve `mundopropicio.com` e será linkada de `newgang.pt`. Formulário: nome\*, email\*, telemóvel, e data de nascimento/cidade/código postal no `raw` de `lead_capture`. Fonte `clube_newgang`. Confirmação com partilha. Assinatura Newgang Produções + Mundo Propício + Fever.
- **Captação** pela edge function `portal-track`, com `company_id` definido no servidor a partir do Origin já validado (fase 1 da #306) — linhas novas nunca nascem órfãs; fecha o caminho da #56 para a captação nova. Detalhe de IP/geo em `estado-plataforma-e-infra.md` e `.lovable/memory/features/ip-geo-cache.md`.
- **Pixels:** Meta Lead (pixel do evento em `events.meta_pixel_id`); TikTok ViewContent + CompleteRegistration (pixel `DB5VO83C77U5NP31S1P0`, só com consentimento de marketing, `event_id` = `client_event_id`); GA4 `sign_up` `{event_slug, method}` no dataLayer.
- **Trackers** lidos de `public.event_trackers_public` (D-ERP251), com fallback no Clube enquanto o evento estiver `portal_visible = false`. TikTok ViewContent/InitiateCheckout também nas páginas de evento com tracker — o InitiateCheckout leva o `client_event_id` da `portal-track`, para dedupe futura com a CAPI TikTok.

**Acompanhamento no MP CRM (#308, P1 até 02/11)** — construído a 12/10, aguarda Publish. Página `/crm/clube-newgang` no menu do MP CRM: cartões total/hoje/7 dias + barra da meta 15.000 até 02/11, agregados por dia/cidade/UTM/faixa etária (hora de Lisboa), tabela paginada com pesquisa e consentimentos, export CSV formato Fever da base completa. Migração `0111_derp252_clube_newgang_crm.sql`: RPCs SECURITY DEFINER `clube_newgang_summary` e `clube_newgang_list` (anon sem acesso; papéis admin/platform_admin/marketing_manager/content_manager; filtro à empresa ativa). Formato da data de nascimento confirmado AAAA-MM-DD (o portal valida antes de gravar no raw). Pendente: confirmar com a Fever se os consentimentos no CSV devem ser "sim"/"não" ou true/false.

## Próximo passo concreto
1. **Fase 4 da #306** — email de boas-vindas pelo Resend; texto a definir pelo Pedro.
2. **Pedro no ERP** — artes do evento + `portal_visible = true`: activa a página do evento, a vista de trackers e dispensa o fallback do pixel no Clube.
3. **Audience — Google** — evento derivado `ng27_clube_inscricao` no GA4 e importação no Google Ads.
4. **Publish do ERP** com a página #308 — e depois envios email/WhatsApp à lista (resto da linha P1 do quadro).

## Bloqueios
- **#62** (frente Google) — os leads do CRM não alimentam o Google Ads.

## Factos que não se reinvestigam
- **Armadilha de nomenclatura:** o schema `crm.*` na BD pertence ao **MP Audience**, não ao módulo MP CRM.
- **`coalafestival.pt` é servido pelo projeto `bef9c59c-…`, não pelo `26b95793-…`.** A empresa servida vem de `VITE_PORTAL_COMPANY_ID`; Coala = `7d831e59-6e82-427b-95a0-64904aae5dd2`.
- **Os anúncios da Meta mandam `utm_campaign`/`utm_content`/`utm_term` como NÚMEROS puros** (IDs de campanha, conjunto e anúncio). O TanStack Router converte-os em `number` ao interpretar a query string. Qualquer `validateSearch` que exija `z.string()` rebenta com 100% do tráfego pago. Ver D-ERP142.
- **O ecrã "Algo correu mal" é o `errorComponent` da raiz do portal** (`src/routes/__root.tsx`), nunca uma página do Instagram. Se aparece, a nossa aplicação carregou e rebentou depois.
- **A raiz `/` não redirecciona no servidor:** devolve 200 e a ida para `/pt` é navegação do cliente. Desde 23/09 o idioma é decidido localmente, sem ida à rede — mas o salto continua a custar uma navegação. Por isso o tráfego pago aponta directamente a `/pt`.
- **Erros de front ficam em `public.portal_error_log`** — `anon` com INSERT e sem SELECT, mesmo molde do `lead_capture`. Foi esta tabela que deu a causa do #253 à primeira consulta.
- **Um Publish pode não assentar:** a 24/09 o primeiro Publish do Coala serviu HTML novo com os ficheiros JS a devolverem **503** (CSS a 200). O segundo resolveu. Confirmar sempre um Publish por dois sinais — o comportamento em produção e o registo — nunca por ter carregado no botão.
- A `geo-lookup` tem allowlist de Origin. Até 24/09 só aceitava `mundopropicio.com`: o Coala levou 403 em silêncio e perdeu geolocalização em 920 captações de setembro, que não se recuperam.
- O `SITE_URL` do Coala Portal ainda aponta para `coalafestival.lovable.app`: `canonical` e `og:url` errados (#251).
- Atribuição cross-domain portal→Ticketline depende do cookie `_fbc` criado **antes** de atrasos de GTM/consent.
- **Magic link cross-project não funciona** — o Lovable Auth sobrescreve `redirect_to` para o Published URL do projeto dono.
- DNS de `mundopropicio.com` na Cloudflare (plano free); nameservers `bayan`/`ollie.ns.cloudflare.com`.

## Onde ler mais
- `docs/handoffs/` — analise-critica-portal-2026-08-12, plano-conversao-portal-2026-08-12

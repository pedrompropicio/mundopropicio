# ESTADO — MP CRM, Portal & Leads

Atualizado: 2026-10-15 · Issues: #251, #252, #320 (em verificação) · Fechadas: #253 (24/09), #254 (10/10) · Bloqueio: #62

## Em que pé está
Dois portais distintos, dois projetos Lovable, a mesma base Supabase:
- `mundopropicio.com` — projeto `26b95793-17b6-478c-a6e8-745c0cfb7ed9`.
- `coalafestival.pt` — projeto **Coala Portal** `bef9c59c-c2a4-453d-9aec-dae7d16c9171`.

A Early Bird 2027 do Coala está a captar em contínuo (`lead_capture`, origens `coala_hero_email` e `coala_early_bird`). Os emails do Coala saem pela API do Resend nos dois domínios verificados, `notify.coalafestival.pt` e `news.coalafestival.pt`, com chave única no segredo `RESEND_API_KEY_COALA`.

**CAPI Meta do ERP — SUSPENSO desde 15/10/2026 21:50 UTC (#320, D-ERP281).** Os crons 33, 34, 44 e 45 foram removidos e o interruptor `capi_dispatch_control` está em `suspended=true`; as 4 edge functions de envio respondem 423. Nenhum Lead, InitiateCheckout ou ViewContent sai do ERP. Mesmo sem suspensão, nada sai sem prova de consentimento por interacção, que ainda não existe. Ver `docs/features/capi-p1-erp.md`.

Efeito colateral da suspensão: `lead_capture` e `redirect_log` deixam de ser processados para `contacts`/`leads` (os ticks fazem as duas coisas). Ficam guardados, não se perdem.

## A trabalhar agora
#320 — implementação P1 concluída; aguarda verificação independente do Pedro. Reserva no QUADRO mantida.

**Portal newgangfestival.pt e Clube Newgang (#306, #308, envios à lista)** — passaram para o chat `newgang-portal` (estado em `docs/estado/estado-newgang-portal.md`).

**Risco registado:** a policy `lead_capture_public_insert` (anon insert em `lead_capture`) mantém-se.

## Próximo passo concreto
1. **Pedro** — verificar #320 (provas em `claude-outputs/2026-10-15-2200-issue320-depois.md`).
2. **Decisão P2/P3** — registo de consentimento marketing por interacção no portal (proposta em `docs/features/capi-p1-erp.md`); e se a ingestão `lead_capture`→`contacts` deve voltar a correr separada do envio.
3. **Pedro no ERP** — artes do evento + `portal_visible = true`.
4. **Audience — Google** — evento derivado `ng27_clube_inscricao` no GA4 e importação no Google Ads.

## Bloqueios
- **#62** (frente Google) — os leads do CRM não alimentam o Google Ads.
- **CAPI** — sem registo de consentimento por interacção (P2/P3) não há envio possível.

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



## 13/10/2026 — D-ERP268
Menu MP CRM: Clube/Site Newgang gated por company_features. Filtro de listas dos Contactos passa a incluir origens. Sementeira das chaves na MP pendente de OK.

# ESTADO — MP CRM, Portal & Leads

Atualizado: 2026-10-16 · Issues: #251, #252, #321 (validada e publicada 16/10; Issue fechada pelo ChatGPT), #320 (P1 validado; fecho documental autorizado; Pedro fecha a Issue) · Fechadas: #253 (24/09), #254 (10/10) · Bloqueio: #62

## Em que pé está
Dois portais distintos, dois projetos Lovable, a mesma base Supabase:
- `mundopropicio.com` — projeto `26b95793-17b6-478c-a6e8-745c0cfb7ed9`.
- `coalafestival.pt` — projeto **Coala Portal** `bef9c59c-c2a4-453d-9aec-dae7d16c9171`.

A Early Bird 2027 do Coala está a captar em contínuo (`lead_capture`, origens `coala_hero_email` e `coala_early_bird`). Os emails do Coala saem pela API do Resend nos dois domínios verificados, `notify.coalafestival.pt` e `news.coalafestival.pt`, com chave única no segredo `RESEND_API_KEY_COALA`.

A 24/09/2026 foi resolvido o incidente que punha o ecrã "Algo correu mal" a 100% do tráfego pago da Meta (#253, fechada). A geolocalização do Coala passou a funcionar e o registo de erros de front está em produção.

## A trabalhar agora
**Ingestão de contactos #321 (D-ERP282)** — em Live desde 16/10: `crm_ingest_lead_captures` + cron 2398 (5 min), sem CAPI nem rede; leads `blocked_no_consent`. MP (portal) e Coala, e desde 16/10 00:38 também `clube_newgang` (MP) em contínuo (migrações 0168/0169): marcar processada dispara o fluxo normal do Clube (membro + email de confirmação uma vez). 2 casos Clube anteriores feitos por ID (0167). Fora de âmbito já não bloqueia o lote. Provas: `docs/testes/issue321/01-…`, `04-…`, `06-clube-continuo.md`. Email `sent` = aceite pelo envio, entrega não comprovada. Desde 16/10 ~00:55 o welcome tem reserva atómica por membro antes do envio (0170/0171; `08-welcome-reserva-live.md`) — fecha o risco de duplicado em concorrência. Validada e publicada em 16/10 (CI run 38831811638, SHA 2130204b…; `09-fecho-documental.md`). Consentimento P2/P3 e retoma CAPI NÃO concluídos — proposta em `docs/features/proposta-p2-p3-consentimento.md` (não aprovada).

**CAPI P1 no ERP (#320, D-ERP281)** — aplicado em Live e validado independentemente; fecho documental autorizado pelo Pedro a 15/10/2026, 23:49 UTC. CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log). Prova consolidada: `docs/testes/issue320/07-fecho-documental-ci.md`. Diagnóstico sensível removido confirmado por leitura; 11 corpos SQL repo × Live iguais, grants anon/authenticated false e service_role true; sent_n 29550 e hash `b1738fd8ecdd96d7c54466ad7c81e112` preservados. Isto fecha apenas P1, não o projeto CAPI.

**CAPI continua suspenso:** `capi_dispatch_control.suspended=true`, crons 33/34/44/45 ausentes, ticks SQL desactivados, sem retoma automática. A ingestão `lead_capture` → contacts/leads foi retomada pela #321 (fora da CAPI, incluindo o Clube); `redirect_log` continua suspenso. Consentimento por interação P2/P3 e separação da ingestão ficaram fora do âmbito. Retoma depende de autorização própria; abrir o interruptor não basta enquanto `capi_consent_proof()` devolver false. Detalhe em `docs/features/capi-p1-erp.md`.

**Portal newgangfestival.pt e Clube Newgang (#306, #308, envios à lista)** — passaram para o chat `newgang-portal` (estado em `docs/estado/estado-newgang-portal.md`).

**Risco registado:** a policy `lead_capture_public_insert` (anon insert em `lead_capture`) mantém-se; não foi alterada neste pedido.

## Próximo passo concreto
1. **Pedro no ERP** — artes do evento + `portal_visible = true`: activa a página do evento, a vista de trackers e dispensa o fallback do pixel no Clube.
2. **Audience — Google** — evento derivado `ng27_clube_inscricao` no GA4 e importação no Google Ads.

## Bloqueios
- **CAPI após P1** — suspenso; P2/P3 por implementar e retoma dependente de autorização própria. #320 validada; Pedro fecha a Issue pelo conector após a entrega.
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



## 13/10/2026 — D-ERP268
Menu MP CRM: Clube/Site Newgang gated por company_features. Filtro de listas dos Contactos passa a incluir origens. Sementeira das chaves na MP pendente de OK.

**Rasto do incidente #320.** O diagnóstico sensível foi removido na etapa anterior, com deploy da função sem Publish. Os `.txt` citados eram ignorados pelo Git e não serviam de prova versionada; foram substituídos pelas provas Markdown `06-tsgo.md`, `06-vitest.md` e `06-build.md`, verificadas no commit validado. A pendência de CI foi resolvida pela confirmação independente acima. Neste fecho só mudou documentação, sem testes repetidos, deploy, Publish, envios ou alterações a SQL, dados, fila, consentimento, crons ou configurações.

# ESTADO — MP CRM, Portal & Leads

Atualizado: 2026-10-10 · Issues: #251, #252 · Fechadas: #253 (24/09), #254 (10/10) · Bloqueio: #62

## Em que pé está
Dois portais distintos, dois projetos Lovable, a mesma base Supabase:
- `mundopropicio.com` — projeto `26b95793-17b6-478c-a6e8-745c0cfb7ed9`.
- `coalafestival.pt` — projeto **Coala Portal** `bef9c59c-c2a4-453d-9aec-dae7d16c9171`.

A Early Bird 2027 do Coala está a captar em contínuo (`lead_capture`, origens `coala_hero_email` e `coala_early_bird`). Os emails do Coala saem pela API do Resend nos dois domínios verificados, `notify.coalafestival.pt` e `news.coalafestival.pt`, com chave única no segredo `RESEND_API_KEY_COALA`.

A 24/09/2026 foi resolvido o incidente que punha o ecrã "Algo correu mal" a 100% do tráfego pago da Meta (#253, fechada). A geolocalização do Coala passou a funcionar e o registo de erros de front está em produção.

## A trabalhar agora
Nada em execução. A 10/10 a captação de `redirect_log` e `lead_capture` passou a fazer-se no servidor, pela edge function `portal-track` (IP lido do `x-forwarded-for`, geo pela cache `public.ip_geo_cache`, só com consentimento) — detalhe na secção própria de `estado-plataforma-e-infra.md` e em `.lovable/memory/features/ip-geo-cache.md`.

## Próximo passo concreto
Reavaliar o rácio sem-IP em `redirect_log`/`lead_capture` na revisão semanal (`procedimentos/PROC-revisao-semanal.md`). Medir o rácio de consumo do ipinfo deixou de ser métrica: a conta migrou para o modelo **"Lite"**, sem quota.

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

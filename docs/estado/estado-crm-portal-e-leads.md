# ESTADO — MP CRM, Portal & Leads

Atualizado: 2026-08-29 (parcial — completar na próxima sessão) · Issues: `a-seguir` #12, #17

## Em que pé está
Portal público em `mundopropicio.com` (projeto Lovable `26b95793-17b6-478c-a6e8-745c0cfb7ed9`), com contactos, leads e promotores. Campanhas de promoção de grupo e indicação lançadas para a Ivete 2026.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
Por definir na próxima sessão desta frente.

## Bloqueios
- **#62** (frente Google) — os leads do CRM não alimentam o Google Ads.

## Factos que não se reinvestigam
- **Armadilha de nomenclatura:** o schema `crm.*` na BD pertence ao **MP Audience**, não ao módulo MP CRM.
- Atribuição cross-domain portal→Ticketline depende do cookie `_fbc` criado **antes** de atrasos de GTM/consent.
- **Magic link cross-project não funciona** — o Lovable Auth sobrescreve `redirect_to` para o Published URL do projeto dono.
- DNS de `mundopropicio.com` na Cloudflare (plano free); nameservers `bayan`/`ollie.ns.cloudflare.com`.

## Onde ler mais
- `docs/handoffs/` — analise-critica-portal-2026-08-12, plano-conversao-portal-2026-08-12

---
name: Multi-tenant email branding
description: Templates de auth (signup, recovery, invite, magic-link, email-change, reauthentication) leem branding por empresa via lookup profiles.email→company_id; UI em /admin/empresas para editar logo + display_name + primary_color
type: feature
---

## Como funciona

`auth-email-hook` faz lookup do recipient:
1. `profiles.email = payload.data.email` → obtém `company_id`
2. `companies` → `display_name`, `logo_url`, `theme_config.primary_color`
3. Passa como props extras `brandName`, `brandLogoUrl`, `brandPrimaryColor` aos 6 templates
4. Fallback para defaults MP ("MP Gestão Eventos", `#1a6fb8`, sem logo) se lookup falhar ou recipient não existir em profiles

O `From:` header também usa `${brandName ?? SITE_NAME} <noreply@mpgestaoeventos.com>` — o domínio de envio continua fixo (MP), mas o nome apresentado é o da empresa-cliente.

## Templates

Helper partilhado em `_shared/email-templates/branding.tsx`:
- `BrandingProps` interface (3 props opcionais)
- `<BrandHeader />` renderiza `<Img>` no topo se `brandLogoUrl` existir
- `resolvePrimary()` aplica fallback `#1a6fb8`

Todos os 6 templates (signup, recovery, invite, magic-link, email-change, reauthentication) integram `BrandingProps` e aplicam cor ao botão / código OTP.

## UI — /admin/empresas

Botão "Editar" em cada card abre `EditCompanyDialog`:
- Nome de apresentação + nome legal
- Upload de logo → bucket público `company-logos` (path `${company.id}/logo-${ts}.${ext}`, máx 2 MB)
- Color picker para `theme_config.primary_color`

## Bucket company-logos

Público (necessário para emails). RLS:
- SELECT: público
- INSERT/UPDATE/DELETE: apenas `platform_admin` ou `admin`

## Limitações conhecidas

- `From:` domínio não muda por empresa (precisaria de DNS verificado por cliente — não implementado)
- Footer de unsubscribe é gerido pelo Lovable, sem branding por empresa
- Templates do app (transactional emails) ainda não implementados — só auth emails

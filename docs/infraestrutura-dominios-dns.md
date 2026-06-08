# Infraestrutura — Domínios e DNS

Fonte de verdade confirmada pelo Pedro em 08/06/2026.

Dois domínios distintos, em dois provedores distintos:

- **mpgestaoeventos.com** — domínio do ERP interno (MP Gestão Eventos). DNS/registrar: **IONOS** (ionos.com). Tem email hosting no IONOS (MX ionos.com; nameservers ui-dns; SOA 1und1.com). É aqui que se mexe em registos DNS deste domínio.
- **mundopropicio.com** — domínio do portal público. DNS/registrar: **Google** (Google Domains / Google Cloud DNS). É aqui que se mexe em registos DNS deste domínio (relevante para o cutover do portal).

## Nota importante

NÃO confundir os dois. A configuração DNS detalhada no IONOS (ui-dns / 1und1 / MX ionos) pertence ao **mpgestaoeventos.com**. O **mundopropicio.com** é gerido no **Google**.

## Contexto de cutover (08/06/2026)

O `mundopropicio.com` está atualmente ligado, via custom domain do Lovable, ao projeto antigo do portal. Está em curso a migração para o portal novo (projeto Lovable "Mundo Propício Portal"). Qualquer alteração de registos DNS para o cutover faz-se no painel do **Google**.

# Infraestrutura — Domínios e DNS

Fonte de verdade confirmada pelo Pedro em 08/06/2026.

Dois domínios distintos, em dois provedores distintos:

- **mpgestaoeventos.com** — domínio do ERP interno (MP Gestão Eventos). DNS/registrar: **IONOS** (ionos.com). Tem email hosting no IONOS (MX ionos.com; nameservers ui-dns; SOA 1und1.com). É aqui que se mexe em registos DNS deste domínio.
- **mundopropicio.com** — domínio do portal público. DNS/registrar: **Hostinger** (hostinger.com). É aqui que se mexe em registos DNS deste domínio (relevante para o cutover do portal). Conta de acesso: producao@mundopropicio.com. NÃO está no Google Cloud DNS (foi onde se procurou inicialmente por engano).

## Nota importante

NÃO confundir os dois. A configuração DNS detalhada no IONOS (ui-dns / 1und1 / MX ionos) pertence ao **mpgestaoeventos.com**. O **mundopropicio.com** é gerido no **Hostinger**.

Histórico de descoberta (08/06/2026): inicialmente assumiu-se IONOS, depois Google; verificação direta confirmou que o registrar/DNS do mundopropicio.com é o Hostinger.

## Contexto de cutover (08/06/2026)

O `mundopropicio.com` está atualmente ligado, via custom domain do Lovable, ao projeto antigo do portal. Está em curso a migração para o portal novo (projeto Lovable "Mundo Propício Portal"). Qualquer alteração de registos DNS para o cutover faz-se no painel do **Hostinger** (ou via o fluxo automático "Connect domain" do Lovable, que faz login no Hostinger e escreve os registos por nós).

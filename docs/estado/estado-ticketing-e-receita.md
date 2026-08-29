# ESTADO — Ticketing & Receita

Atualizado: 2026-08-29 (parcial — completar na próxima sessão) · Issues: `a-seguir` #73, #78

## Em que pé está
Sync de vendas com a Ticketline a funcionar; bilheteira é a principal fonte de receita e está **em nome da MP**. Ocupação por zona e captura de tipos de bilhete implementadas.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
Por definir na próxima sessão desta frente.

## Bloqueios
- **#78** — o import da Ticketline não limpa a série antiga quando o formato muda.
- **#73** — corte por tipo de bilhete.

## Factos que não se reinvestigam
- **`ticket_sales` é agregada** — sem comprador individual, email ou gclid.
- Bilheteira liga-se ao evento por `zone_id → event_ticket_zones.event_id` (**não há `event_id` direto em `ticket_sales`**).
- IVA da bilheteira: **6%**. Conferência Anitta 29/08: 27.047 bilhetes · 2.424.200,00 c/IVA → 2.286.981,13 s/IVA.
- Contactos Ticketline: Luísa Rodrigues, Ana Ribeiro.

## Onde ler mais
- `.lovable/memory/features/bilheteira-sync.md`, `bol-sync.md`

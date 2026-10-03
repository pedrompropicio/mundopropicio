---
name: Natureza económica do evento
description: Separa a natureza económica do evento da visibilidade management_type; cinco valores e fase 2 pendente
---

# Natureza económica do evento

- `management_type` controla visibilidade: `own` aparece nos módulos internos; `partner_managed` pode ficar escondido dos ecrãs que filtram eventos próprios.
- `event_nature` descreve a natureza económica, sem alterar visibilidade nem filtros: `producao_propria`, `intermediacao`, `coproducao`, `parceiro_local`, `temporada`.
- Na fase 1, `event_nature` é opcional e os sub-eventos herdam o valor do Master quando são criados.
- Fase 2 pendente: retro-preencher os eventos, tornar o campo obrigatório na criação/na base e rever explicitamente os relatórios.
- Nunca reaproveitar `management_type` para representar produção própria ou intermediação.
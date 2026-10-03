---
name: Natureza económica do evento
description: event_nature NOT NULL e obrigatório na criação, distinto de management_type; relatórios filtram por natureza sem alterar cálculos
type: feature
---

# Natureza económica do evento

- `management_type` controla visibilidade: `own` aparece nos módulos internos; `partner_managed` pode ficar escondido dos ecrãs que filtram eventos próprios.
- `event_nature` descreve a natureza económica: `producao_propria`, `intermediacao`, `coproducao`, `parceiro_local`, `temporada`.
- Fase 2 feita (03/10/2026): coluna NOT NULL sem default; obrigatória em todos os caminhos de criação (ERP, CRM, calendário, implementação); sem opção vazia na edição; sub-eventos herdam do Master.
- Relatórios financeiros (DRE, BP, Rentabilidade, DRE Brasil, DRE Empresarial, Desvio) e a grelha de Eventos filtram por natureza; o filtro só restringe o conjunto de eventos, nunca altera cálculos — todas seleccionadas = resultado idêntico.
- Nunca reaproveitar `management_type` para representar produção própria ou intermediação.

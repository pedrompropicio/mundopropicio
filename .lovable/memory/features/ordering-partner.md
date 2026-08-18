---
name: Ordenador de despesas por sócio
description: Coluna ordering_partner_id (event_partners) em event_forecasts e transactions; opcional, só despesas, herança BP→TX e filtros no BP e na lista de transações
type: feature
---

# Ordenador de despesas por sócio

- Coluna nullable `ordering_partner_id` em `event_forecasts` e `transactions`, FK para `event_partners.id` (a mesma entidade que representa sócio do evento; `event_partners` referencia `suppliers`).
- **Opcional**: vazio = "MP / comum" (maioria dos eventos tem a própria MP como único ordenador).
- **Só despesas** (`type='expense'`). Receitas não têm o campo.
- SSoT em `src/lib/ordering-partner.ts`: `matchesOrderingPartnerFilter`, `buildInheritedOrdererMap`, `effectiveTransactionOrderer`, `orderingPartnerInitials`.
- **Herança**: TX de despesa sem ordenador próprio herda o da linha BP que a reclama (usa o matching existente de `bp-tx-matching`, sem criar matching novo). Geração em lote do BP preenche no vínculo. Edição manual na TX prevalece sempre.
- UI: badge/select discreto nas linhas de despesa do BP (visão agrupada) + filtro Todos | MP/comum | cada sócio que também afeta previsto/realizado; select nos modais de criação/edição de transação (só se o evento tiver sócios); filtro igual na lista de transações do evento.
- Sem trigger de validação dura — a UI só oferece os sócios do evento.
- Não mexe no PDF do parceiro nem nos agregadores de Fecho de Parceiros.

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

# Pagador da despesa (conceito distinto)

- Coluna nullable `paying_partner_id` em `event_forecasts` e `transactions`, FK para `event_partners.id`, índices `idx_*_paying_partner`.
- **Ordenador** = quem gera a especificação que faz o custo existir. **Pagador** = quem desembolsa. São campos independentes e ambos só se aplicam a despesas.
- `NULL` em qualquer dos dois = **a empresa configurada no evento** (`events.company_id` → `companies.display_name`). A empresa NUNCA existe em `event_partners` — não criar.
- Regra de omissão: um preenchido e o outro vazio ⇒ são o mesmo. Ambos vazios ⇒ empresa configurada.
- Rótulo da casa NÃO é hardcoded ("MP"): resolve-se por `useEventHouseLabel(eventId)`, fallback "Empresa". `ORDERING_HOUSE_LABEL` / `PAYING_HOUSE_LABEL_FALLBACK` são só fallbacks.
- SSoT em `src/lib/paying-partner.ts` (espelho de `ordering-partner.ts`): `matchesPayingPartnerFilter`, `buildInheritedPayerMap`, `effectiveTransactionPayer`, `payingPartnerInitials`, `payerIdFromRow`.
- **Snapshots congelados**: em `bp_versions.snapshot_payload` a chave `ordering_partner_id` significa **pagador** (é anterior à separação). Ler sempre com `payerIdFromRow(row)` = `paying_partner_id ?? ordering_partner_id ?? null`. Snapshots novos gravam ambos (`to_jsonb(f.*)`).
- **Tudo o que soma dinheiro por sócio usa o Pagador**: `bp-closing-data.ts` (`OutRow.payer`, `bundle.houseLabel`), PDF e XLSX de fecho do BP com coluna **"Pagador"**.
- UI: badge `PayingPartnerBadge` (ícone `Wallet`) ao lado do badge de ordenador (`UserCog`); filtros "Pagador" no BP e na lista de transações do evento; selects nos modais de criação/edição de transação (com audit log). Ambos os controlos ficam escondidos em eventos sem `event_partners`.
- Anitta EDA 2026 (`fdfb39fe-45f2-43f5-9ec9-7cb536360ae1`): pagador EVERYTHINGISNEW 123 linhas / 1.153.942,10 €; empresa (NULL) 63 / 449.533,34 €.

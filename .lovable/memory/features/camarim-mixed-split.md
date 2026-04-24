---
name: Camarim - Divisão de talões mistos (A+B híbrido)
description: Talões com bp_scope=mixed podem ser divididos pela equipa no momento ou pelo gestor antes do fecho. Pai fica status=split (fora dos cálculos), filhos herdam categoria/anexo via lookup ao pai.
type: feature
---

## Conceito
Quando uma compra tem parte para Master (rateio comum da turnê) e parte para uma cidade específica, é "mista". O sistema suporta dois fluxos:

- **Equipa divide na origem (A)**: no `CamarimItemModal`, ao escolher `bp_scope=mixed` aparece o botão "Dividir agora". Se o item ainda não existe, é gravado primeiro como `submitted` + `mixed` e só depois abre o `SplitItemModal`.
- **Gestor divide no fecho (B)**: itens `bp_scope=mixed` que ainda não foram divididos aparecem numa secção destacada (roxa) no topo de `/camarim/:id` com botão "Dividir" por linha.

## Modelo de dados
- Coluna `parent_item_id` (uuid, FK self-reference com `ON DELETE CASCADE`) em `camarim_items`.
- Status `split` (string) no item-pai → fica fora de TODOS os cálculos:
  - `totals.spent`, `totals.cashOnHand`, `totals.byScope`, `totals.pending` em `CamarimSessionDetail`.
  - Edge function `close-camarim-session` já filtra `status=approved`, portanto `split` é ignorado naturalmente.
- Filhos herdam: supplier, doc_number/date, payment_origin, category_id, currency, ocr_payload, has_document, notes do pai. IVA é prorrateado pela proporção do total.

## Componente novo
- `src/components/camarim/SplitItemModal.tsx` — modal único reutilizado nos dois fluxos. Suporta `allowResplit` (apaga filhos antigos e recria) para o gestor corrigir uma divisão errada da equipa.
- Validação: soma das linhas tem de bater com total do pai (tolerância 0.005). Mínimo 2 linhas. Linhas `local_city` exigem `event_id` da sessão.
- Botão "Auto-completar última" preenche o restante na última linha.

## Anexos partilhados
Os filhos NÃO duplicam o registo em `camarim_item_documents` — partilham via lookup ao pai. Isto está OK porque o pai com `status=split` continua na BD, só não conta para fecho. Se for preciso ver o talão de um filho, hoje o `CamarimItemAttachmentButton` vai ao item específico — ponto a melhorar no futuro (fallback para parent_item_id).

## UI
- `CamarimItemModal`: aviso roxo abaixo do select Verba quando `mixed`; botão "Dividir agora" no footer.
- `CamarimSessionDetail`: card roxo "Talões mistos por dividir" entre o alerta de categorias e os KPIs.
- `BP_SCOPE_LABELS` em `camarim-helpers.ts` agora inclui `mixed: "Misto (a dividir)"`.
- `ITEM_STATUS_LABELS` agora inclui `split: "Dividido"` (badge roxa).

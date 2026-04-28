---
name: Camarim - UI e equipa de montagem
description: Páginas /camarim (gestão), /camarim/:id (detalhe) e /camarim-equipa (mobile), com OCR imediato de talões via edge function
type: feature
---

## Pontos de entrada
- `/camarim` — listagem de sessões + abertura (admin/manager ou permissão `camarim_manage`). Acessível via sidebar (ícone ShoppingBag).
- `/camarim/:id` — detalhe da sessão para gestão (mesma regra acima): KPIs (orçamento, gasto, caixa em mão, pendentes), abas Itens/Fundos, aprovação/rejeição inline, transição open → in_review → closed.
- `/camarim-equipa` — fora do `ProtectedLayout` (mobile-first, sem sidebar). FAB câmara para nova conta. Lista apenas sessões `open`/`in_review`. Apenas admin ou utilizadores com permissão `camarim_team`.

## Permissões
- `camarim_team` (admin + manager por defeito): permite usar a vista mobile `/camarim-equipa`.
- `camarim_manage` (admin + manager + **editor** por defeito): permite criar e gerir sessões/itens em `/camarim` e `/camarim/:id` (criar sessão, editar, aprovar/rejeitar itens, mover fundos). Pode ser concedida individualmente a viewers via UserPermissionsModal. RLS de `camarim_sessions` e `camarim_items` aceita esta permissão.
- **Fecho da sessão** (Enviar para revisão → Fechar → Integrar) está restrito a `isAdmin || isManager` no UI (`canCloseSession`). Editores com `camarim_manage` veem a sessão mas não veem os botões de fecho.
- **Edição de conteúdo** (adicionar/editar/eliminar itens e fundos) segue `canEditContent`: equipa (editor com `camarim_team`/`camarim_manage`) só com sessão `open`; manager/admin enquanto não estiver `integrated`. RLS espelha (policies "team"/"session members" passam a exigir `s.status = 'open'`). Botão **"Reabrir sessão"** (manager/admin) volta de `in_review`/`closed` para `open`.

## OCR imediato
- Edge function: `extract-camarim-receipt` (Lovable AI Gateway, modelo `google/gemini-2.5-flash`, sem JWT).
- Disparado ao escolher/tirar foto no `CamarimItemModal` (capture="environment"). Pré-preenche supplier/data/total/IVA/descrição.
- Trata erros 429/402 e devolve `confidence` (high/medium/low) + `ocr_raw_payload` guardado em `camarim_items`.

## Modos de sessão (modal abertura)
- `single_event`: 1 evento.
- `tour_consolidated`: 1 sessão liga várias cidades de um Master.
- `city_session`: cria N sessões (uma por cidade) num único submit, todas com o mesmo título base + nome da cidade.

## Componentes criados
- `src/lib/camarim-helpers.ts` — labels, variantes de cor, `formatCurrency`.
- `src/components/camarim/OpenSessionModal.tsx`
- `src/components/camarim/CamarimItemModal.tsx` (mode `team` → submeter, mode `manager` → guardar/aprovar)
- `src/components/camarim/CamarimFundMoveModal.tsx`

## Notas operacionais
- Equipa: status default ao submeter = `submitted`. Manager: `draft` ou `approved`.
- Fundos: tipos advance/reinforcement/refund/adjustment. Caixa em mão = adiantamentos − devoluções − itens com `payment_origin=advance`.
- Documentos: bucket `camarim-documents` (privado), path `${sessionId}/${itemId}/${ts}.${ext}`.
- Schema events: campo é `date` (não `start_date`).

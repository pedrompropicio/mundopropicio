
# Portal do Sócio — "Realizados do evento"

Feature nova que expõe ao sócio o realizado por rubrica (L3), sem nunca enviar transações individuais ao cliente. Ligada a uma nova permissão custom.

## 1. Permissão nova `view_partner_realized`

- Adicionar entrada em `ALL_PERMISSIONS` (`src/contexts/AuthContext.tsx`), grupo **Geral**, label **"Ver Realizados do Evento"**, imediatamente a seguir a `view_bp`.
- Default: desligada para todos os roles (nenhum `INSERT` em `role_permissions`). Fica ligável só por override individual no modal existente `UserPermissionsModal` — usa a mesma UI (toggle + tag CUSTOM) sem alterações.
- Migration só adiciona a permission ao `ALL_PERMISSIONS`; sem RLS nova (a RPC é que valida).

## 2. RPC `get_partner_bp_realized(p_event_id uuid)` — SECURITY DEFINER

Fonte única do realizado do sócio. Nunca devolve linhas de transação.

Validações (todas obrigatórias, aborta com `raise exception` se falhar):
1. `auth.uid()` não nulo.
2. Utilizador tem acesso ao evento via `partner_event_access` (linha ativa, ou acesso ao Master quando o evento é Split — replicar a regra já usada em `PartnerEventDetail`).
3. `has_permission(auth.uid(), 'view_partner_realized')` = true.

Cálculo:
- Espelha o cálculo do `ReportPL` em modo `comparison` para despesas: para cada `event_forecast` do evento (incluindo `is_overhead`, incluindo linhas com `master_forecast_id` — mesmas linhas que a aba BP do sócio já lê), junta a `transactions` pelo `transaction_id` **direct** e por match de `category_id` (UNION direct+category — parcelas BP), replicando a "memoria core" `bp-installments`.
- Agrega por `category_id` da transação e resolve L3 via `account_categories`.
- Devolve `JSONB` array de `{ l3_category_id, l3_code, l3_name, l2_code, l1_code, real_base, real_iva, real_total }` (despesas c/IVA). Nenhum campo `is_overhead` na saída (invisível).

Grants: `GRANT EXECUTE ON FUNCTION public.get_partner_bp_realized(uuid) TO authenticated`.

## 3. UI — aba BP do `PartnerEventDetail.tsx`

- Novo `useQuery` `["partner_bp_realized", eventId]` que chama a RPC **só se `hasPermission('view_partner_realized')`**. Sem a permissão, query desativada — payload de rede fica idêntico ao atual.
- Extender `bpGroupedHier` (memo) para mesclar realizados por `l3.id` a partir do resultado da RPC, propagando totais realizados para L2 e L1.
- Renderização (apenas quando permissão ativa):
  - Linhas L1 / L2 / L3 (subtotais) ganham 2 colunas extra à direita: **Realizado** (mesmo formato monetário) e **Variação** (colorida verde/vermelho). Barra `<Progress>` fininha por baixo do L3 mostrando `min(100, real/previsto*100)`.
  - Itens individuais (linha 1214) — inalterados, continuam a mostrar só previsão.
  - Card "Total previsto" (linha 1151) ganha versão comparativa: total realizado + variação.
- Header layout mantém-se; só ajustamos larguras.

## 4. Exportação Excel/PDF

- `exportPLToExcel`/`exportPLToPDF` já suportam `mode="comparison"` a partir das `transactions` recebidas. Como não podemos enviar transações ao sócio, fazemos **shim**: construímos um array `pseudoTransactions` local, uma linha por agregado da RPC, com `{ event_id: activeEventId, type: 'expense', category_id: l3_id, amount: real_base, iva_rate: real_base>0 ? real_iva/real_base*100 : 0 }`. Nada mais.
- `buildExportPayload` passa a devolver também `pseudoTransactions` e `mode` (`"comparison"` se permissão ligada, senão `"forecast"` como hoje).
- Handlers `handleExportBPExcel`/`Pdf` passam `mode` dinâmico + `pseudoTransactions`. Mantidos `typeFilter="expense"`, `hideOverheadTag=true`, todos os arrays de bilheteira/cache vazios.

## 5. Não mexer

- Spike Univer, `ReportPL` staff, `BPGridEditor`, RLS de `event_forecasts`/`transactions`.
- Nenhuma escrita direta a `transactions` no cliente do sócio.

## Ficheiros afetados

- `supabase/migrations/<ts>_partner_bp_realized.sql` — nova RPC + grant.
- `src/contexts/AuthContext.tsx` — nova permission em `ALL_PERMISSIONS`.
- `src/pages/PartnerEventDetail.tsx` — query da RPC, merge nos subtotais, colunas extra na UI, shim de export.
- `.lovable/memory/features/event-view-permissions.md` — regista `view_partner_realized`.

## Critério de aceitação

- (a) Toggle novo aparece no `UserPermissionsModal` e persiste em `user_permissions`.
- (b) Sem toggle: portal do sócio idêntico ao atual (mesmo payload de rede).
- (c) Com toggle: subtotais L1/L2/L3 mostram Realizado + Variação; total realizado coincide com o do Relatório BP staff (modo comparação, `typeFilter=expense`, `includeOverhead=true`) para o mesmo evento.
- (d) DevTools → Network: request do sócio a `get_partner_bp_realized` devolve só agregados por L3, sem `transaction_id`, `supplier`, `description` nem datas.
- (e) Excel/PDF exportados pelo sócio com permissão ativa entram no modo Previsão vs Realizado com os mesmos números.

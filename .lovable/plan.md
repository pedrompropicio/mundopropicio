

## Badge real = nº de listas de pagamento pendentes de aprovação

Substituir o badge fixo "1" por um contador dinâmico que reflete apenas as **listas de pagamento com `status = pending_approval`** visíveis para o utilizador (admin/manager). Quando não houver, o badge é limpo automaticamente.

### Comportamento

- **Ao abrir/focar a app**: consulta o nº de listas pendentes → atualiza badge (ou limpa se = 0).
- **Quando uma lista é criada/aprovada/devolvida**: o cliente que faz a ação volta a recalcular o badge localmente, e o push enviado a admins/managers passa a transportar o nº real (não mais "1" fixo).
- **Ao receber um push**: o service worker já honra `data.badge_count`, então o número fica correto em todos os dispositivos onde o utilizador tem o PWA instalado.
- **Realtime**: subscrição na tabela `payment_lists` para recalcular badge quando outro utilizador altera estado (sem precisar reabrir a app).
- **Logout**: limpa o badge.

### Alterações técnicas

**1. Novo helper `src/lib/app-badge.ts`**
- `refreshBadgeFromDB()`: faz `SELECT count FROM payment_lists WHERE status = 'pending_approval'` filtrado pela visibilidade do utilizador, e chama `navigator.setAppBadge(n)` ou `navigator.clearAppBadge()` se 0.
- `clearBadge()`: utilitário para logout / quando o utilizador entra na página de listas.

**2. `src/App.tsx`**
- No `AuthenticatedApp` (após login confirmado), montar um `useEffect` que:
  - Chama `refreshBadgeFromDB()` no mount e em `visibilitychange` (quando o app volta a foco).
  - Cria canal realtime em `payment_lists` (eventos INSERT/UPDATE) que dispara `refreshBadgeFromDB()`.
  - Cleanup no unmount.
- Só roda se `isPushSupported()` + role admin/manager (editores não veem listas).

**3. `src/lib/push-notifications.ts`**
- `sendPushToAdminsAndManagers()` ganha parâmetro opcional `badgeCount?: number`. Quando fornecido, é repassado ao edge function.
- Caller-side: antes de enviar, calcula `pendingCount` (count após a alteração) e passa.

**4. `src/components/PaymentListsTab.tsx`**
- Nas 4 chamadas de `sendPushToAdminsAndManagers` (criar, devolver, reenviar, aprovar), recalcular nº de pendentes pós-mutation e passar como `badgeCount`.
- Após cada mutation bem-sucedida, chamar `refreshBadgeFromDB()` localmente (para atualizar o próprio iPhone do aprovador imediatamente).

**5. `src/pages/ReportPaymentListsPage.tsx`**
- No mount, chamar `refreshBadgeFromDB()` (entrar na página = utilizador "viu" → badge fica coerente).

**6. `src/contexts/AuthContext.tsx`** (logout)
- Chamar `clearBadge()` antes de `supabase.auth.signOut()`.

### Edge cases tratados

- iOS Safari sem suporte a `setAppBadge` → no-op silencioso.
- Editor (sem permissão para aprovar) → não vê badge (skip do `useEffect`).
- Múltiplos dispositivos → cada push transporta o count atual; ao abrir qualquer device, recalcula a partir da DB (fonte de verdade).
- Lista aprovada por outro admin → realtime atualiza o badge do meu device sem reabrir a app.

### Ficheiros editados
- `src/lib/app-badge.ts` (novo)
- `src/lib/push-notifications.ts`
- `src/components/PaymentListsTab.tsx`
- `src/pages/ReportPaymentListsPage.tsx`
- `src/App.tsx`
- `src/contexts/AuthContext.tsx`
- `supabase/functions/send-push-notification/index.ts` (default `badge_count` deixa de ser `?? 1` — passa a `?? 0` para não fixar quando não enviado)


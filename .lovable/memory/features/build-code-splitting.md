---
name: Build — code-splitting e verificação pós-Publish
description: Rotas lazy vs eager em src/App.tsx, manualChunks do vite.config, handler de vite:preloadError, campos de version.json e como confirmar que um Publish chegou a produção
type: feature
---

# Code-splitting do bundle (Issue #231)

## Eager (shell)
Em `src/App.tsx` ficam com import estático apenas: `Index`, `Auth`,
`ResetPassword`, `NotFound`, `Unsubscribe`, `AcceptInvitation`,
`ModuleSelector`, `PostLoginRedirect`, `Reports` (layout de relatórios),
`OperacaoLayout`, `AudienceLayout`, `AudiencePrintGuard`, `CrmLayout`,
`PartnerLayout`, `AppSidebar` e tudo o que vive no cabeçalho.

## Lazy
Todas as restantes páginas (~190) via `lazy(() => import(...))`. Cada `<Routes>`
(o de `App` e o de `ProtectedLayout`) está envolvido por um único
`<Suspense fallback={<RouteFallback />}>`; `RouteFallback` reproduz o
"A carregar…" do `ProtectedLayout`. Rotas, redirects, guardas e a lógica de
role (`isCamarimOnly`, `marketing_manager`, `content_manager`, `accountant`,
`camarim_team_default_landing`) ficaram inalteradas; `BlogEditor` continua a
receber `mode="new" | "edit"`.

## Chunks manuais (`vite.config.ts` → `build.rollupOptions.output.manualChunks`)
`vendor-react` (react, react-dom, react-router-dom, scheduler, @tanstack),
`vendor-ui` (@radix-ui, lucide-react), `vendor-handsontable`
(handsontable, @handsontable, hyperformula), `vendor-pdf` (jspdf,
jspdf-autotable), `vendor-xlsx` (xlsx, exceljs), `vendor-charts`
(recharts, d3-*, internmap, victory-vendor), `vendor-supabase` (@supabase).
React **não** pode ser partido em dois chunks — os `alias`/`dedupe` de `react`
e `@radix-ui/react-slot` existem por isso.

`workbox.maximumFileSizeToCacheInBytes` = **6 MiB** (maior ficheiro actual:
`heic-to`, ~2,9 MiB). Se voltar a faltar espaço, investigar o chunk que cresceu
em vez de subir o limite.

## Chunk desactualizado depois de um Publish
`src/main.tsx` escuta `vite:preloadError` e faz **um** reload por sessão,
guardado por `sessionStorage["mp_preload_error_reloaded"]`. Guarda própria, de
propósito: não colide com `claimReloadGuard()` de `src/lib/versionCheck.ts`
(que é por build e serve o poller do `version.json` e o service worker).

## `dist/version.json`
`{ buildId, builtAt, commit }`. `buildId` é o único campo que
`src/lib/versionCheck.ts` compara (ignora campos extra). `builtAt` é ISO UTC do
mesmo instante do `buildId`; `commit` vem de `git rev-parse HEAD` com fallback
`VITE_COMMIT_SHA` / `COMMIT_REF` / `GIT_COMMIT` e `null` — nunca faz o build
falhar.

## Regra de verificação pós-Publish
Depois de cada Publish, abrir `/version.json` em produção: `buildId`/`builtAt`
têm de ser posteriores ao deploy e `commit` igual ao HEAD publicado. Se não
mudarem, o build morreu e o Publish não chegou a produção — foi exactamente o
que aconteceu a 2026-09-22 às 05:12 (workbox rebentou por o chunk principal ter
passado os 10 MiB).

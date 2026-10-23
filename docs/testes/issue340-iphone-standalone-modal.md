# #340 — iPhone standalone: X dos modais sob a barra de estado (23/10/2026, chat 5, R1)

## Causa: (c)
- (a) refutada: cabeçalho da app `z-50` (src/App.tsx:484); overlays dos modais recebem z ≥ 1000 (src/lib/overlay-layer.ts:16 `LAYER_BASE = 1000`).
- (b) refutada: no CSS final (`vite build`, index-*.css) `.modal-safe-overlay{padding-top:max(1rem,env(safe-area-inset-top))…}` está na posição 102363, depois de `.p-4{padding:1rem}` (73773); mesma especificidade → ganha.
- (c) confirmada: Dialog base em `top:50%; translate-y:-50%` com `max-height: 100dvh − max(1rem,topo) − max(1rem,fundo)`. Em standalone (black-translucent, viewport-fit=cover) o ecrã inclui a barra de estado; com topo 59px e fundo 34px, o modal no máximo começa a (59+34)/2 = 46,5px < 59px → título e X sob a barra (o "desfoque" é a barra translúcida). Nos modais manuais o shell dependia de `100dvh − insets`, que em standalone não coincide com a caixa do overlay; com `items-center` o excesso transbordava por cima.

## Correção (só src/index.css, partilhado)
- `.modal-safe-overlay`: `padding: calc(env(safe-area-inset-*) + 1rem)` e `align-items: safe center` (nunca transborda por cima).
- `.manual-modal-shell`: `max-height: min(var(--modal-*), 100%)` — cabe na caixa do overlay.
- `.mobile-dialog-content` (<640px): `top: calc(50% + (topo − fundo)/2)` e `max-height` = viewport − safe-areas − 2rem.
- X: 44×44 já existente (`.mobile-dialog-close`, `.manual-modal-header button`). Desktop e Safari normal: insets 0 → comportamento igual.

## Testes
- Novo: src/test/issue340-standalone-modal-safe-area.test.tsx (4 testes).
- vitest: antes 2325 → depois 2329 PASS (6 skipped, 11 todo). tsc (tsgo) 0 erros.

## O Pedro verifica (após Publish)
App do ecrã inicial no iPhone: abrir Editar Transação, Editar BP (ForecastEditModal) e um Dialog base (ex.: confirmação) — título nítido abaixo da barra de estado, X visível e tocável, scroll do corpo com cabeçalho fixo. Repetir no Safari normal e no Mac (sem mudanças).

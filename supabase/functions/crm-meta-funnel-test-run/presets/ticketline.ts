import type { FlowPreset } from "./types.ts";

/**
 * Ticketline (PT) — flow preset.
 *
 * Validado end-to-end via run #83289745 (Live, 2026-05-14):
 * - 6/6 steps PASSED em 44.32s (margem 10.7s vs AbortController 55s)
 * - 30 pixel events com `step` annotated (PageView×15, AddToCart×4,
 *   SubscribedButtonClick×7, InitiateCheckout×4 — 1ª vez detectado)
 *
 * Notas críticas sobre o flow real Ticketline:
 *
 * 1. **AddToCart Pixel dispara em `select_quantity`** (click COMPRAR no modal
 *    venue), NÃO em `add_to_cart`. O step `add_to_cart` clica o link
 *    `<a id="addToCart" href="/carrinho?confirm">CONTINUAR</a>` para
 *    navegação real — o nome do step é nominal, não Meta-Pixel-aligned.
 *
 * 2. **Modal "Ticketline Premium" (#secureModalWindow) aparece DUAS vezes:**
 *    - Page load da `/carrinho?confirm` → resolvido em step `add_to_cart` via
 *      `dismissAfterClick: ['.lb-close', 'a.button.close[data-element="close"]', ...]`
 *    - Click "Finalizar compra" → modal REABRE, intercepta navegação.
 *      Botão "Fechar" só fecha sem proceder. Resolvido em step
 *      `initiate_checkout` via `clickAgainAfterDismiss: true` (re-click do
 *      handle original; 2ª click não dispara modal porque Ticketline trackeia
 *      que já mostrou).
 *
 * 3. **Botão "Finalizar compra"** é `<a href="/carrinho/checkout"
 *    class="button large confirm">Finalizar compra</a>`. Text Title Case
 *    (NÃO uppercase). Selector primary `a[href="/carrinho/checkout"]` é único
 *    no DOM (o outro `<a class="confirm">` é "Adicionar" do upsell seguro,
 *    distinguível pela ausência de `.large`).
 *
 * 4. **Bug real do client (não nosso):** Ticketline não dispara `ViewContent`
 *    em `/sessao/...`. Identificável pelo Veredicto IA como recomendação ao
 *    operador. Auditoria documenta o gap.
 *
 * History:
 * - 1.0.0 (2026-05-14): G.5 fechou flow end-to-end pós-Publish (run #83289745).
 *   Stack: G.1 (TICKETLINE_FLOW array) + G.2 (selectores zonas + COMPRAR) +
 *   G.3 (#addToCart link discovery) + G.4 (modal Premium dismiss step 4) +
 *   G.5 (clickAgainAfterDismiss + navigationTimeoutMs per-step).
 */
export const TICKETLINE_PRESET: FlowPreset = {
  id: "ticketline-pt",
  name: "Ticketline (PT)",
  domain: "ticketline.pt",
  domains: ["ticketline.pt", "www.ticketline.pt"],
  version: "1.0.0",
  steps: [
    {
      id: "navigate_home",
      label: "Navegar para sessão",
      isNavigate: true,
      lhKey: "home",
    },
    {
      id: "select_zone",
      label: "Selecionar zona",
      // G.2: lista de zonas usa <li id="listZone_<id>" data-zone-id="<id>">
      // com <p class="zone"> contendo o nome (Arena - Lote 2 etc.).
      selectors: [
        'li[id^="listZone_"]',
        "li[data-zone-id]",
        'li:has-text("Arena")',
      ],
      expectNavigation: false,
      postWaitMs: 1500,
      lhKey: "product",
    },
    {
      id: "select_quantity",
      label: "Selecionar quantidade",
      // G.2: modal venue tem <a id="venueMapModalWindowReserveButton"
      // class="button confirm reserve">Comprar</a> pré-renderizado.
      selectors: [
        "#venueMapModalWindowReserveButton",
        "a.button.confirm.reserve",
        'a:has-text("Comprar")',
      ],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    {
      id: "add_to_cart",
      label: "Adicionar ao carrinho",
      // Ver JSDoc do preset: AddToCart Pixel dispara no clique COMPRAR (step
      // anterior), NÃO neste. Aqui o user clica "Continuar" para navegar para
      // /carrinho?confirm. `#addToCart` é o LINK real (href=/carrinho?confirm);
      // `#venueMapModalWindowContinueButton` é só close do modal (href="#").
      selectors: [
        "#addToCart",
        'a[href*="/carrinho?confirm"]',
        "#venueMapModalWindowContinueButton",
        "a.button.confirm.continue",
        'a:has-text("Continuar")',
      ],
      expectNavigation: true,
      // G.4 + G.5: dismissAfterClick para fechar modal "Ticketline Premium" que
      // aparece via JS injection após nav para /carrinho?confirm.
      postWaitMs: 2000,
      dismissAfterClick: [
        ".lb-close",
        'a.button.close[data-element="close"]',
        'a[data-element="close"]',
        ".modal-premium .close",
        '[role="dialog"] button[aria-label*="fechar" i]',
        '[role="dialog"] button[aria-label*="close" i]',
      ],
    },
    {
      id: "open_cart_page",
      label: "Validar carrinho",
      // G.4: validateOnly — verifica que botão Finalizar compra está visível.
      validateOnly: true,
      selectors: [
        'a[href="/carrinho/checkout"]',
        'a[href*="/carrinho/checkout"]',
        "a.button.large.confirm",
        'a:has-text("Finalizar compra")',
      ],
      expectNavigation: false,
      postWaitMs: 800,
      lhKey: "cart",
    },
    {
      id: "initiate_checkout",
      label: "Iniciar checkout",
      // G.5: clickAgainAfterDismiss = true porque modal Premium reabre no click
      // Finalizar compra e o botão Fechar só fecha sem navegar. Re-click do
      // handle após dismiss procede com a navegação.
      selectors: [
        'a[href="/carrinho/checkout"]',
        'a[href*="/carrinho/checkout"]',
        "a.button.large.confirm",
        'a:has-text("Finalizar compra")',
      ],
      expectNavigation: true,
      navigationTimeoutMs: 5000, // G.5: override do default 7000ms
      postWaitMs: 1500,
      clickAgainAfterDismiss: true,
      dismissAfterClick: [
        ".lb-close",
        'a.button.close[data-element="close"]',
        'a[data-element="close"]',
        ".modal-premium .close",
        '[role="dialog"] button[aria-label*="fechar" i]',
        '[role="dialog"] button[aria-label*="close" i]',
      ],
      lhKey: "checkout",
    },
  ],
};

// Funnel Test 360 — flow preset types.
// Cada preset descreve o fluxo de checkout de uma bilheteira específica.

export interface FlowStep {
  /** ID estável do step (usado como `step_name` na BD `crm.funnel_test_steps`). */
  id: string;
  /** Label visível ao utilizador (UI label). */
  label: string;
  /**
   * Selectores a tentar em ordem. CSS standard + suporte para `:has-text("...")`
   * via helper `evaluateHandle` no `_puppeteer_script.ts` (Patch H.1).
   * Optional para steps com `isNavigate: true` (que usam `page.goto` direto).
   */
  selectors?: string[];
  /**
   * Se true, executa `page.goto(targetUrl, { waitUntil: 'networkidle2' })`
   * em vez de procurar selector e clicar. Usado no primeiro step (entry point).
   */
  isNavigate?: boolean;
  /**
   * Se true, espera navegação (waitForNavigation) após o click + valida que
   * URL mudou (Patch I). Se URL não mudar, step é marcado como failed.
   */
  expectNavigation?: boolean;
  /**
   * Se true, apenas verifica que o selector existe (sem click, sem nav).
   * Útil para steps de validação (ex: confirmar que estamos na página certa).
   */
  validateOnly?: boolean;
  /** Wait em ms após o click (default 1500ms). */
  postWaitMs?: number;
  /**
   * Selectores a tentar dismiss entre o click e o postWait. Usado para fechar
   * modais aplicacionais que aparecem após o click (ex: upsell modal).
   * Ordem importa — primeiro match wins.
   */
  dismissAfterClick?: string[];
  /**
   * Se true E `expectNavigation` true E `dismissAfterClick` correu E URL ainda
   * não mudou: re-click o handle original. Padrão para sites com modal
   * interceptor duplo (G.5) — modal abre na 1ª click; dismiss fecha; 2ª click
   * navega porque o site trackeia que já mostrou.
   */
  clickAgainAfterDismiss?: boolean;
  /**
   * Override per-step do `waitForNavigation` timeout (default 7000ms).
   * Útil quando se sabe que nav real acontece rapidamente (ex: 5000ms para
   * cortar nav wait mais cedo em sites com modal interceptor — G.5).
   */
  navigationTimeoutMs?: number;
  /**
   * Mapeamento opcional para Lighthouse audit keys (`home` / `product` / `cart`
   * / `checkout`). Steps sem `lhKey` não disparam fetchLighthouse.
   */
  lhKey?: "home" | "product" | "cart" | "checkout" | string;
}

export interface FlowPreset {
  /** ID estável do preset (snake-case, ex: "ticketline-pt"). */
  id: string;
  /** Display name (ex: "Ticketline (PT)"). */
  name: string;
  /** Domínio primário (hostname sem `www.`, ex: "ticketline.pt"). */
  domain: string;
  /**
   * Domínios adicionais que devem matchar este preset (ex: `["ticketline.pt",
   * "www.ticketline.pt"]`). Default: apenas `domain`.
   */
  domains?: string[];
  /** Semver. Incrementar quando selectores/comportamento mudam. */
  version: string;
  /** Steps em ordem de execução. */
  steps: FlowStep[];
}

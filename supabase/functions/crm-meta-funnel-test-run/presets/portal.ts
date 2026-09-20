import type { FlowPreset } from "./types.ts";

/**
 * Portal Mundo Propício (mundopropicio.com) — flow preset.
 *
 * Âmbito deliberadamente curto: o portal **não tem checkout** (a venda é
 * delegada à bilheteira, que tem preset próprio). Aqui validamos apenas a
 * landing do evento:
 *
 *   1. `navigate_landing`  — entrada na landing do evento (lhKey "home")
 *   2. `accept_consent`    — aceitar o banner de cookies (consentimento é
 *                            pré-requisito: sem ele o Pixel não dispara)
 *   3. `validate_pageview` — PageView pós-consentimento (validateOnly)
 *   4. `validate_view_content` — ViewContent da landing (validateOnly, lhKey
 *                            "product" — a landing do evento É a página de
 *                            produto do portal)
 *
 * Notas:
 * - Os `pixel_events` de cada step são capturados pelo core
 *   (`_puppeteer_script.ts`) e é isso que prova PageView/ViewContent; o preset
 *   só garante a ordem e o consentimento.
 * - `accept_consent` usa selectores genéricos do banner (id/class com
 *   "cookie"/"consent" + texto "Aceitar"/"Concordo"). Se o banner não existir
 *   (consentimento já dado ou banner removido) o step falha sem quebrar a
 *   cadeia útil — por isso `validateOnly` NÃO é usado aqui: queremos o click
 *   real quando existe.
 * - Sem `expectNavigation` em nenhum step depois do primeiro: a landing é
 *   single-page para efeitos de tracking.
 *
 * History:
 * - 1.0.0 (2026-09-20): Issue #12 — primeiro preset não-bilheteira.
 */
export const PORTAL_PRESET: FlowPreset = {
  id: "portal-mundopropicio",
  name: "Portal Mundo Propício",
  domain: "mundopropicio.com",
  domains: ["mundopropicio.com", "www.mundopropicio.com"],
  version: "1.0.0",
  steps: [
    {
      id: "navigate_landing",
      label: "Abrir landing do evento",
      isNavigate: true,
      postWaitMs: 2000,
      lhKey: "home",
    },
    {
      id: "accept_consent",
      label: "Aceitar cookies (consentimento)",
      selectors: [
        '[id*="cookie" i] button:has-text("Aceitar")',
        '[class*="cookie" i] button:has-text("Aceitar")',
        '[id*="consent" i] button:has-text("Aceitar")',
        '[class*="consent" i] button:has-text("Aceitar")',
        'button:has-text("Aceitar todos")',
        'button:has-text("Aceitar")',
        'button:has-text("Concordo")',
      ],
      expectNavigation: false,
      postWaitMs: 2000,
    },
    {
      id: "validate_pageview",
      label: "Validar PageView com consentimento",
      // validateOnly: não há click — o que interessa é o pixel_events do step.
      validateOnly: true,
      selectors: ["body"],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    {
      id: "validate_view_content",
      label: "Validar ViewContent da landing",
      validateOnly: true,
      selectors: [
        "main",
        '[data-event-slug]',
        "article",
        "body",
      ],
      expectNavigation: false,
      postWaitMs: 1500,
      lhKey: "product",
    },
  ],
};

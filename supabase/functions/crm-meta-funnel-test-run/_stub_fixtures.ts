// TODO[browserless-stub]: substituir todo este ficheiro por chamadas reais
// à API Browserless (https://browserless.io) quando BROWSERLESS_API_KEY
// estiver configurada nos secrets. As fixtures abaixo simulam o output
// que esperamos receber para validar a UI end-to-end.

// G.1: step IDs renomeados (ver _browserless.ts para mapeamento legado→novo).
export type StepName =
  | "navigate_home"
  | "select_zone"
  | "select_quantity"
  | "add_to_cart"
  | "open_cart_page"
  | "initiate_checkout";

export interface PixelEvent {
  event: string;
  fired_at_ms: number;
  value?: number;
  currency?: string;
  content_ids?: string[];
  raw_url: string;
}

export interface ConsoleError {
  level: "error" | "warn";
  message: string;
  source?: string;
}

export interface LighthouseScore {
  lcp: number;
  tbt: number;
  tti: number;
  cls: number;
  performance?: number;
}

export interface StubStepResult {
  step_status: "passed" | "failed" | "skipped";
  duration_ms: number;
  url_at_step: string;
  screenshot_url: string | null;
  pixel_events: PixelEvent[];
  console_errors: ConsoleError[];
  lighthouse: LighthouseScore | null;
  notes?: string;
}

export const STEP_SEQUENCE: StepName[] = [
  "navigate_home",
  "select_zone",
  "select_quantity",
  "add_to_cart",
  "open_cart_page",
  "initiate_checkout",
];

const placeholderShot = (label: string) =>
  `https://placehold.co/1280x800/0a0a0a/ffffff?text=${encodeURIComponent(label)}`;

export const STUB_FIXTURES: Record<StepName, StubStepResult> = {
  navigate_home: {
    step_status: "passed",
    duration_ms: 1820,
    url_at_step: "https://example.com/",
    screenshot_url: placeholderShot("home"),
    pixel_events: [
      {
        event: "PageView",
        fired_at_ms: 540,
        raw_url:
          "https://www.facebook.com/tr/?id=1234567890&ev=PageView&dl=https%3A%2F%2Fexample.com%2F",
      },
    ],
    console_errors: [],
    lighthouse: { lcp: 1900, tbt: 80, tti: 2400, cls: 0.04, performance: 0.92 },
  },
  select_zone: {
    step_status: "passed",
    duration_ms: 1240,
    url_at_step: "https://example.com/event/abc-123",
    screenshot_url: placeholderShot("event"),
    pixel_events: [
      {
        event: "ViewContent",
        fired_at_ms: 410,
        value: 35,
        currency: "EUR",
        content_ids: ["abc-123"],
        raw_url:
          "https://www.facebook.com/tr/?id=1234567890&ev=ViewContent&cd[content_ids]=%5B%22abc-123%22%5D",
      },
    ],
    console_errors: [],
    lighthouse: { lcp: 2100, tbt: 120, tti: 2700, cls: 0.05, performance: 0.88 },
  },
  select_quantity: {
    step_status: "passed",
    duration_ms: 760,
    url_at_step: "https://example.com/event/abc-123#ticket",
    screenshot_url: placeholderShot("ticket"),
    pixel_events: [],
    console_errors: [],
    lighthouse: null,
  },
  add_to_cart: {
    step_status: "passed",
    duration_ms: 980,
    url_at_step: "https://example.com/event/abc-123#cart",
    screenshot_url: placeholderShot("add_to_cart"),
    pixel_events: [
      {
        event: "AddToCart",
        fired_at_ms: 320,
        value: 35,
        currency: "EUR",
        content_ids: ["abc-123"],
        raw_url:
          "https://www.facebook.com/tr/?id=1234567890&ev=AddToCart&cd[value]=35&cd[currency]=EUR",
      },
    ],
    console_errors: [
      {
        level: "warn",
        message: "Mixed content: insecure image loaded over HTTP.",
        source: "https://example.com/static/banner.jpg",
      },
    ],
    lighthouse: null,
  },
  open_cart_page: {
    step_status: "passed",
    duration_ms: 1120,
    url_at_step: "https://example.com/cart",
    screenshot_url: placeholderShot("cart"),
    pixel_events: [],
    console_errors: [],
    lighthouse: { lcp: 2300, tbt: 180, tti: 3000, cls: 0.06, performance: 0.84 },
  },
  initiate_checkout: {
    step_status: "passed",
    duration_ms: 1640,
    url_at_step: "https://example.com/checkout",
    screenshot_url: placeholderShot("checkout"),
    pixel_events: [
      {
        event: "InitiateCheckout",
        fired_at_ms: 510,
        value: 35,
        currency: "EUR",
        content_ids: ["abc-123"],
        raw_url:
          "https://www.facebook.com/tr/?id=1234567890&ev=InitiateCheckout&cd[value]=35&cd[currency]=EUR",
      },
    ],
    console_errors: [],
    lighthouse: { lcp: 2500, tbt: 220, tti: 3300, cls: 0.07, performance: 0.81 },
  },
};

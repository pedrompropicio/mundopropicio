// IMPORTANTE: este ficheiro é serializado via .toString() e enviado a Browserless.
// Tem de ser válido JavaScript runtime (sem type annotations no corpo) e correr
// como `export default async function({page, context})` no /function endpoint.
//
// Cobre 4 patches:
//   Patch 2 — listener Pixel multi-página (page + CDP + novas tabs)
//   Patch 4 — fluxo real Ticketline (zona → COMPRAR → CONTINUAR → FINALIZAR → close upsell)
//   Patch 5 — dismissOverlayIfPresent entre steps (cookies/newsletter, não fecha upsell)
//   Patch 6 — captureFailureContext em FAILED (full-page screenshot + DOM + console recente)
export const browserlessPuppeteerScript = async function ({ page, context }) {
  const { targetUrl } = context;
  const sessionStart = Date.now();
  const allPixel = [];
  const allConsole = [];
  const seenPixelUrls = new Set();

  // ---- PIXEL LISTENERS (Patch 2) ----
  const isPixelUrl = (url) =>
    !!url && (url.includes('facebook.com/tr') || url.includes('connect.facebook.net/signals'));

  const recordPixel = (url) => {
    if (!isPixelUrl(url) || seenPixelUrls.has(url)) return;
    try {
      const u = new URL(url);
      const ev = u.searchParams.get('ev');
      if (!ev) return;
      let contentIds = null;
      const cidRaw = u.searchParams.get('cd[content_ids]');
      if (cidRaw) {
        try { contentIds = JSON.parse(cidRaw); } catch (_) { contentIds = [cidRaw]; }
      }
      const valueStr = u.searchParams.get('cd[value]');
      allPixel.push({
        event: ev,
        fired_at_ms: Date.now() - sessionStart,
        value: valueStr ? parseFloat(valueStr) : null,
        currency: u.searchParams.get('cd[currency]'),
        content_ids: contentIds,
        raw_url: url,
        _ts: Date.now(),
      });
      seenPixelUrls.add(url);
    } catch (_) { /* noop */ }
  };

  const attachPageListeners = (p) => {
    try {
      p.on('request', (req) => { try { recordPixel(req.url()); } catch (_) {} });
      p.on('console', (msg) => {
        const t = msg.type();
        if (t === 'error' || t === 'warning') {
          allConsole.push({
            level: t === 'warning' ? 'warn' : 'error',
            message: msg.text().slice(0, 500),
            source: msg.location()?.url,
            _ts: Date.now(),
          });
        }
      });
      p.on('pageerror', (err) => {
        allConsole.push({ level: 'error', message: String(err).slice(0, 500), _ts: Date.now() });
      });
    } catch (_) { /* noop */ }
  };

  const attachCDP = async (p) => {
    try {
      const client = await p.target().createCDPSession();
      await client.send('Network.enable');
      client.on('Network.requestWillBeSent', (params) => {
        try { recordPixel(params && params.request && params.request.url); } catch (_) {}
      });
    } catch (_) { /* noop */ }
  };

  attachPageListeners(page);
  await attachCDP(page);

  // Cobre popups/novas tabs (ex.: Ticketline pode abrir checkout em nova janela)
  try {
    const browser = page.browser();
    browser.on('targetcreated', async (target) => {
      try {
        if (target.type() !== 'page') return;
        const np = await target.page();
        if (!np) return;
        attachPageListeners(np);
        await attachCDP(np);
      } catch (_) { /* noop */ }
    });
  } catch (_) { /* noop */ }

  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  // ---- HELPERS ----
  const sliceSince = (arrName, sinceTs) => {
    const arr = arrName === 'pixel' ? allPixel : allConsole;
    return arr.filter(x => x._ts >= sinceTs).map(({_ts, ...r}) => r);
  };

  // F.1: usa encoding:'base64' nativo do Puppeteer (sidestep ao Buffer vs
  // Uint8Array return type da v2). 3 fallbacks: (1) Buffer.from() se Node
  // padrão; (2) Uint8Array → String.fromCharCode → btoa manual se Buffer
  // ausente; final null + warn para telemetria.
  const screenshot = async (full) => {
    try {
      const out = await page.screenshot({ type: 'png', fullPage: !!full, encoding: 'base64' });
      if (typeof out === 'string' && out.length > 4) return out;
      if (typeof Buffer !== 'undefined' && out) return Buffer.from(out).toString('base64');
      if (out && out.length) {
        let bin = '';
        for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
        return btoa(bin);
      }
      return null;
    } catch (e) {
      console.warn('[puppeteer] screenshot failed:', e && e.message);
      return null;
    }
  };

  const getDomB64 = async () => {
    try {
      const html = await page.content();
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(html, 'utf8').toString('base64');
      }
      // Fallback: TextEncoder + btoa manual (sem Buffer)
      const bytes = new TextEncoder().encode(html);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    } catch (e) {
      console.warn('[puppeteer] getDomB64 failed:', e && e.message);
      return null;
    }
  };

  const trySelectors = async (selectors, timeoutMs) => {
    const deadline = Date.now() + (timeoutMs || 8000);
    while (Date.now() < deadline) {
      for (const sel of selectors) {
        try {
          if (sel.includes(':has-text(')) {
            const m = sel.match(/^([a-zA-Z*]+):has-text\("(.+)"\)$/);
            if (m) {
              const tag = m[1]; const text = m[2];
              // H.1: substitui page.$x (removido em Puppeteer 23+) por
              // evaluateHandle (API core estável desde 1.x). Normalize NFD
              // remove acentos (ã→a, é→e) e match é case-insensitive +
              // includes — compatível com sites pt-PT/pt-BR/es.
              console.warn(`[puppeteer] :has-text resolve via evaluateHandle tag="${tag}" text="${text}"`);
              let jsh = null;
              try {
                jsh = await page.evaluateHandle((tag, text) => {
                  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                  const target = norm(text);
                  const els = document.querySelectorAll(tag);
                  for (const el of els) {
                    if (norm(el.innerText || el.textContent).includes(target)) return el;
                  }
                  return null;
                }, tag, text);
                const el = jsh.asElement();
                if (el) return el; // caller usa para .click() (mesmo padrão pré-H.1)
                await jsh.dispose();
              } catch (e) {
                if (jsh) { try { await jsh.dispose(); } catch (_) {} }
                /* try next selector */
              }
              continue;
            }
          }
          const handle = await page.$(sel);
          if (handle) return handle;
        } catch (_) { /* try next */ }
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  };

  // ---- Patch 5: dismissOverlayIfPresent ----
  // Limpa modais BENIGNOS (cookies / newsletter) que possam interferir.
  // Deliberadamente NÃO fecha modais aplicacionais (ex.: upsell Ticketline Premium) —
  // esses são clicados explicitamente pelo step próprio.
  const dismissOverlayIfPresent = async () => {
    const OVERLAY_DISMISS = [
      '#onetrust-accept-btn-handler',
      '#CybotCookiebotDialogBodyButtonAccept',
      '[id*="cookie" i] button:has-text("Aceitar")',
      '[class*="cookie" i] button:has-text("Aceitar")',
      '[id*="cookie" i] button:has-text("Concordo")',
      '[class*="cookie" i] button:has-text("Concordo")',
      'button:has-text("Aceitar todos")',
      'button:has-text("Accept all")',
      '[class*="newsletter" i] [aria-label*="close" i]',
      '[class*="newsletter" i] .close',
      '[class*="newsletter" i] button:has-text("Não obrigado")',
    ];
    for (let i = 0; i < 3; i++) {
      const h = await trySelectors(OVERLAY_DISMISS, 600);
      if (!h) return;
      try {
        await h.click({ delay: 50 });
        await new Promise(r => setTimeout(r, 400));
      } catch (_) { return; }
    }
  };

  // ---- G.1: TICKETLINE_FLOW (array, schema declarativo) ----
  // Substitui o objeto TICKETLINE_STEPS por um array ordenado. Cada item:
  //   { id, label, selectors[], expectNavigation, postWaitMs,
  //     validateOnly?, dismissAfterClick?, isNavigate? }
  // Migração futura para preset-by-domain (Opção 2) torna-se trivial: bastará
  // exportar TICKETLINE_FLOW / GENERIC_FLOW como entradas de um Record<domain,Flow[]>.
  //
  // Fluxo Ticketline real (descoberto via diagnóstico screenshots manuais 2026-05-13):
  //   1. navigate_home     navegar URL sessão                                 → PageView
  //   2. select_zone       clicar linha da tabela de zonas ("Arena - Lote 2")  → modal abre → ViewContent
  //   3. select_quantity   clicar COMPRAR no modal de quantidade              → modal fecha, tab "Lugares Escolhidos"
  //   4. add_to_cart       clicar CONTINUAR                                   → navega /carrinho?confirm → AddToCart
  //   5. open_cart_page    validateOnly: verifica FINALIZAR COMPRA visível    → sem click, sem navegação
  //   6. initiate_checkout clicar FINALIZAR COMPRA + dismiss upsell Premium   → navega checkout real → InitiateCheckout
  //
  // TODO G.2: selectores actuais são Phase 1 best-guess (sem DOM real). Refinar
  // após primeira run pós-G.1 (esperado: step `select_zone` falha e o
  // failure_context grava o DOM da página de sessão → input directo para G.2).
  const isTicketline = (() => {
    try { return /(?:^|\.)ticketline\.pt$/i.test(new URL(targetUrl).hostname); }
    catch (_) { return false; }
  })();

  const TICKETLINE_FLOW = [
    {
      id: 'navigate_home',
      label: 'Navegar para sessão',
      isNavigate: true,
    },
    {
      id: 'select_zone',
      label: 'Selecionar zona',
      // TODO G.2: substituir por classe CSS real da tabela de zonas.
      selectors: [
        'tr:has-text("Arena - Lote 2")',
        'table tr:nth-child(2)',
        'tbody tr:first-of-type',
      ],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    {
      id: 'select_quantity',
      label: 'Selecionar quantidade',
      // TODO G.2: refinar selector específico do modal de quantidade.
      selectors: [
        'button:has-text("COMPRAR")',
        '.modal button.primary',
        '[role="dialog"] button:not(.close)',
      ],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    {
      id: 'add_to_cart',
      label: 'Adicionar ao carrinho',
      // TODO G.2: confirmar texto exacto (CONTINUAR vs Continuar) + classe real.
      selectors: [
        'button:has-text("CONTINUAR")',
        '.btn-continue',
        'button.primary:visible',
      ],
      expectNavigation: true,
      postWaitMs: 1800,
    },
    {
      id: 'open_cart_page',
      label: 'Validar carrinho',
      // validateOnly: já estamos em /carrinho?confirm; só verifica
      // que FINALIZAR COMPRA está visível (= página renderizada). Sem click.
      validateOnly: true,
      selectors: [
        'button:has-text("FINALIZAR COMPRA")',
        '.checkout-btn',
      ],
      expectNavigation: false,
      postWaitMs: 800,
    },
    {
      id: 'initiate_checkout',
      label: 'Iniciar checkout',
      // Clica FINALIZAR COMPRA → modal upsell Premium pode aparecer →
      // dismissAfterClick tenta fechar entre click e postWait para liberar
      // a navegação para o checkout real.
      // TODO G.2: refinar selectors do close button do upsell.
      selectors: [
        'button:has-text("FINALIZAR COMPRA")',
        '.checkout-btn',
      ],
      expectNavigation: true,
      postWaitMs: 2200,
      dismissAfterClick: [
        '.modal-premium .close',
        '[role="dialog"] button[aria-label*="fechar" i]',
        '.modal.show button[data-dismiss="modal"]',
      ],
    },
  ];

  // Fluxo genérico (não-Ticketline) — mantém IDs unificados pós-G.1 mas com
  // selectores best-effort para qualquer site de bilheteira.
  const GENERIC_FLOW = [
    { id: 'navigate_home', label: 'Navegar para home', isNavigate: true },
    {
      id: 'select_zone',
      label: 'Clicar no evento',
      selectors: ['a[href*="/evento/"]','a[href*="/event/"]','.event-card a','article a[href*="/"]','a:has(img)'],
      expectNavigation: true,
      postWaitMs: 1500,
    },
    {
      id: 'select_quantity',
      label: 'Selecionar bilhete',
      selectors: ['button:has-text("Comprar")','button:has-text("Bilhetes")','a:has-text("Comprar")','[data-testid*="ticket"]','button.btn-primary'],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    {
      id: 'add_to_cart',
      label: 'Adicionar ao carrinho',
      selectors: ['button:has-text("Adicionar")','button:has-text("Cesto")','button:has-text("Cart")','[data-testid*="add"]','input[type="submit"][value*="dicionar"]'],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    {
      id: 'open_cart_page',
      label: 'Abrir carrinho',
      selectors: ['a[href*="/cesto"]','a[href*="/cart"]','a[href*="/carrinho"]','[aria-label*="cart" i]'],
      expectNavigation: true,
      postWaitMs: 1500,
    },
    {
      id: 'initiate_checkout',
      label: 'Iniciar checkout',
      selectors: ['button:has-text("Continuar")','button:has-text("Finalizar")','a:has-text("Checkout")','button[type="submit"]'],
      expectNavigation: true,
      postWaitMs: 1800,
    },
  ];

  const FLOW = isTicketline ? TICKETLINE_FLOW : GENERIC_FLOW;

  const steps = [];
  // Patch B: assim que um step falha, os subsequentes são marcados skipped sem
  // tentar selectores/cliques/screenshots — wall-clock no worst-case cai ~70%.
  // index.ts ancestorsOf vê step_status === "skipped" e continua (no-op).
  let cascadeBrokenAt = null;

  for (const cfg of FLOW) {
    const name = cfg.id;
    const stepStart = Date.now();
    const sinceTs = stepStart;

    // Patch B: short-circuit — não desperdiçar tempo se a cadeia já quebrou.
    if (cascadeBrokenAt !== null) {
      steps.push({
        name,
        step_status: 'skipped',
        duration_ms: 0,
        url_at_step: page.url(),
        screenshot_b64: null,
        pixel_events: [],
        console_errors: [],
        notes: `skipped_after_chain_fail: cadeia quebrada por step "${cascadeBrokenAt}"`,
        failure_context: null,
      });
      continue;
    }

    // Patch 5: limpa cookies/newsletter antes de cada step (especialmente importante entre 5 e 6)
    try { await dismissOverlayIfPresent(); } catch (_) { /* noop */ }

    let status = 'passed';
    let note = null;

    try {
      if (cfg.isNavigate) {
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } else {
        // Patch A + E.1: timeouts conservadores para manter wall-clock total
        // bem abaixo dos 55s do AbortController e 60s do cap Browserless.
        // Budget worst-case actual: 18s realista, 43s patológico — margem 12s
        // antes do AbortController disparar.
        const handle = await trySelectors(cfg.selectors || [], 5000);
        if (!handle) {
          status = 'failed';
          note = cfg.validateOnly ? 'validation_selector_not_found' : 'selector_not_found';
        } else if (cfg.validateOnly) {
          // G.1: validateOnly = só verifica existência, sem click nem nav.
          await new Promise(r => setTimeout(r, cfg.postWaitMs || 600));
        } else if (cfg.expectNavigation) {
          const navP = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 7000 }).catch(() => null);
          await handle.click().catch(() => null);
          await navP;
          // G.1: dismissAfterClick — tenta fechar overlays específicos entre
          // o click e o postWait (e.g., modal upsell Premium da Ticketline).
          if (cfg.dismissAfterClick && cfg.dismissAfterClick.length) {
            const dh = await trySelectors(cfg.dismissAfterClick, 1500);
            if (dh) {
              try { await dh.click(); await new Promise(r => setTimeout(r, 500)); } catch (_) { /* noop */ }
            }
          }
          await new Promise(r => setTimeout(r, cfg.postWaitMs || 1500));
        } else {
          await handle.click().catch(() => null);
          if (cfg.dismissAfterClick && cfg.dismissAfterClick.length) {
            const dh = await trySelectors(cfg.dismissAfterClick, 1500);
            if (dh) {
              try { await dh.click(); await new Promise(r => setTimeout(r, 500)); } catch (_) { /* noop */ }
            }
          }
          await new Promise(r => setTimeout(r, cfg.postWaitMs || 1500));
        }
      }
    } catch (e) {
      status = 'failed';
      note = String(e).slice(0, 300);
    }

    const stepEnd = Date.now();

    // Patch 6: captureFailureContext quando o step falha
    let failureContext = null;
    if (status === 'failed') {
      try {
        const fullShot = await screenshot(true);
        const domB64 = await getDomB64();
        const recent = allConsole.slice(-30).map(({ _ts, ...r }) => r);
        failureContext = {
          full_screenshot_b64: fullShot,
          dom_b64: domB64,
          recent_console: recent,
        };
      } catch (_) { /* noop */ }
    }

    const shot = await screenshot(false);
    const url = page.url();
    steps.push({
      name,
      step_status: status,
      duration_ms: stepEnd - stepStart,
      url_at_step: url,
      screenshot_b64: shot,
      pixel_events: sliceSince('pixel', sinceTs),
      console_errors: sliceSince('console', sinceTs),
      notes: note,
      failure_context: failureContext,
    });

    // Patch B: arma o short-circuit para os steps seguintes assim que algo falha
    if (status === 'failed') {
      cascadeBrokenAt = name;
    }
  }

  return {
    data: { steps, flow: isTicketline ? 'ticketline' : 'generic' },
    type: 'application/json',
  };
};

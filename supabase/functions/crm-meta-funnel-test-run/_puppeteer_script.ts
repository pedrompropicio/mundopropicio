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

  const screenshot = async (full) => {
    try {
      const buf = await page.screenshot({ type: 'png', fullPage: !!full });
      return buf.toString('base64');
    } catch (_) { return null; }
  };

  const getDomB64 = async () => {
    try {
      const html = await page.content();
      // Buffer existe no Node.js runtime de Browserless
      return Buffer.from(html, 'utf8').toString('base64');
    } catch (_) { return null; }
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
              const xp = `//${tag}[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÀÂÊÔÃÕÇ', 'abcdefghijklmnopqrstuvwxyzáéíóúàâêôãõç'), '${text.toLowerCase()}')]`;
              const handles = await page.$x(xp);
              if (handles.length) return handles[0];
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

  // ---- Patch 4: Ticketline real flow ----
  // Fluxo descoberto via diagnóstico (sessão → zona → COMPRAR → CONTINUAR → FINALIZAR → close upsell):
  //   1. navigate_home   navegar URL sessão                                  → PageView
  //   2. click_event     clicar linha de zona ("Arena" etc.) na tabela       → ViewContent (modal abre)
  //   3. select_ticket   clicar COMPRAR no modal de quantidade               → modal fecha, muda tab "Lugares Escolhidos"
  //   4. add_to_cart     clicar CONTINUAR                                    → navega /carrinho?confirm → AddToCart
  //   5. open_cart       clicar FINALIZAR COMPRA                             → modal upsell "Ticketline Premium" aparece
  //   6. begin_checkout  clicar X do modal upsell                            → navega checkout real → InitiateCheckout
  const isTicketline = (() => {
    try { return /(?:^|\.)ticketline\.pt$/i.test(new URL(targetUrl).hostname); }
    catch (_) { return false; }
  })();

  const GENERIC_STEPS = {
    click_event:    { selectors: ['a[href*="/evento/"]','a[href*="/event/"]','.event-card a','article a[href*="/"]','a:has(img)'], expectNavigation: true,  postWaitMs: 1500 },
    select_ticket:  { selectors: ['button:has-text("Comprar")','button:has-text("Bilhetes")','a:has-text("Comprar")','[data-testid*="ticket"]','button.btn-primary'], expectNavigation: false, postWaitMs: 1500 },
    add_to_cart:    { selectors: ['button:has-text("Adicionar")','button:has-text("Cesto")','button:has-text("Cart")','[data-testid*="add"]','input[type="submit"][value*="dicionar"]'], expectNavigation: false, postWaitMs: 1500 },
    open_cart:      { selectors: ['a[href*="/cesto"]','a[href*="/cart"]','a[href*="/carrinho"]','[aria-label*="cart" i]'], expectNavigation: true,  postWaitMs: 1500 },
    begin_checkout: { selectors: ['button:has-text("Continuar")','button:has-text("Finalizar")','a:has-text("Checkout")','button[type="submit"]'], expectNavigation: true,  postWaitMs: 1800 },
  };

  const TICKETLINE_STEPS = {
    click_event: {
      // Tabela de zonas — qualquer linha tr clicável (procurar "Arena" / "Plateia" etc.; cair em qualquer tr de tbody)
      selectors: ['tr:has-text("Arena")','tr:has-text("Plateia")','tr:has-text("Bancada")','tbody tr[role="button"]','tbody tr.zona','table tbody tr'],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    select_ticket: {
      // Modal de quantidade → botão COMPRAR
      selectors: ['.modal.show button:has-text("Comprar")','.modal button:has-text("Comprar")','.modal .btn-primary:has-text("Comprar")','button:has-text("Comprar")'],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    add_to_cart: {
      // CONTINUAR — provoca navegação para /carrinho?confirm
      selectors: ['button:has-text("Continuar")','a:has-text("Continuar")','.btn:has-text("Continuar")','input[type="submit"][value*="ontinuar"]'],
      expectNavigation: true,
      postWaitMs: 1800,
    },
    open_cart: {
      // FINALIZAR COMPRA — abre modal upsell, NÃO navega
      selectors: ['button:has-text("Finalizar Compra")','button:has-text("Finalizar compra")','a:has-text("Finalizar")','.btn:has-text("Finalizar")','button:has-text("FINALIZAR")'],
      expectNavigation: false,
      postWaitMs: 1500,
    },
    begin_checkout: {
      // Fechar X do modal upsell "Ticketline Premium" — provoca navegação checkout real
      selectors: [
        '.modal.show button.close',
        '.modal.show button[aria-label*="close" i]',
        '.modal.show button[aria-label*="fechar" i]',
        '.modal.show button[data-dismiss="modal"]',
        '.modal[style*="display: block"] button.close',
        '.modal[style*="display: block"] button[aria-label*="close" i]',
        // Fallbacks textuais
        '.modal.show button:has-text("×")',
        '.modal.show button:has-text("X")',
      ],
      expectNavigation: true,
      postWaitMs: 2000,
    },
  };

  const STEP_CONFIG = isTicketline ? TICKETLINE_STEPS : GENERIC_STEPS;
  const STEP_SEQ = ['navigate_home','click_event','select_ticket','add_to_cart','open_cart','begin_checkout'];

  const steps = [];

  for (const name of STEP_SEQ) {
    // Patch 5: limpa cookies/newsletter antes de cada step (especialmente importante entre 5 e 6)
    try { await dismissOverlayIfPresent(); } catch (_) { /* noop */ }

    const stepStart = Date.now();
    const sinceTs = stepStart;
    let status = 'passed';
    let note = null;

    try {
      if (name === 'navigate_home') {
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } else {
        const cfg = STEP_CONFIG[name];
        const handle = await trySelectors(cfg.selectors, 10000);
        if (!handle) {
          status = 'failed';
          note = 'selector_not_found';
        } else if (cfg.expectNavigation) {
          const navP = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 12000 }).catch(() => null);
          await handle.click().catch(() => null);
          await navP;
          await new Promise(r => setTimeout(r, cfg.postWaitMs || 1500));
        } else {
          await handle.click().catch(() => null);
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
  }

  return {
    data: { steps, flow: isTicketline ? 'ticketline' : 'generic' },
    type: 'application/json',
  };
};

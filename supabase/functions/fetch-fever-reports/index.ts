// fetch-fever-reports
// Faz login na Fever via Browserless, baixa 2 relatórios XLSX e importa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseFeverXlsxBuffers, groupFeverLots } from "../_shared/fever-parser.ts";
import { runFeverImport } from "../_shared/fever-import-server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BROWSERLESS_KEY = Deno.env.get("BROWSERLESS_API_KEY");

interface Body {
  configId: string;
  mode?: "manual" | "cron";
  triggeredBy?: string;
}

async function updateRun(admin: any, runId: string, patch: Record<string, any>) {
  const { error } = await admin.from("fever_sync_runs").update(patch).eq("id", runId);
  if (error) console.error("updateRun error:", error.message);
}

async function updateConfig(admin: any, configId: string, patch: Record<string, any>) {
  await admin.from("fever_sync_config").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", configId);
}

/**
 * Playwright script enviado para Browserless via /function endpoint.
 * Devolve { sales: base64, prices: base64, salesName, pricesName }.
 *
 * Selectors: prefere texto visível (PT) ou data-* attributes; CSS evitado.
 */
function buildPuppeteerScript(args: {
  username: string;
  password: string;
  organization: string;
  cityId: string;
  planId: string;
  venueId: string;
}): string {
  const a = JSON.stringify(args);
  return `
export default async function ({ page }) {
  const args = ${a};

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  });

  const logs = [];
  const log = (m) => { const s = '[' + Date.now() + '] ' + m; logs.push(s); try { console.log(s); } catch (_) {} };
  log('VERSION_MARKER_2026_05_15_v23');

  let lastScreenshot = null;
  const snap = async (label) => {
    try {
      lastScreenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      log('snap ' + label + ' url=' + page.url());
    } catch (e) { log('snap fail: ' + (e && e.message)); }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Capturar URL do download via interceptação de requests
  let lastDownloadUrl = null;
  const downloadUrlRegex = /(\\.xlsx|\\.csv|export|download)/i;
  page.on('request', (req) => {
    const u = req.url();
    if (downloadUrlRegex.test(u) && !u.includes('fonts') && !u.includes('static')) {
      lastDownloadUrl = u;
      log('download url candidato: ' + u);
    }
  });

  const clickByText = async (text, opts = {}) => {
    const timeout = opts.timeout || 15000;
    await page.waitForFunction((needle) => {
      const all = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"], li, div, span'));
      return all.some(el => {
        const t = (el.textContent || '').trim();
        return t.includes(needle) && t.length < 300;
      });
    }, { timeout }, text);

    const clicked = await page.evaluate((needle) => {
      const all = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"], li, div, span'));
      const candidates = all.filter(el => {
        const t = (el.textContent || '').trim();
        return t.includes(needle) && t.length < 300;
      });
      if (!candidates.length) return false;
      candidates.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
      const el = candidates[0];
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    }, text);

    if (!clicked) throw new Error('texto nao encontrado: ' + text);
  };

  const clickByTextMulti = async (texts, opts = {}) => {
    const timeout = opts.timeout || 8000;
    try {
      await page.waitForFunction((needles) => {
        const all = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"], li, div, span'));
        return needles.some(n => all.some(el => {
          const t = (el.textContent || '').trim();
          return t.includes(n) && t.length < 300;
        }));
      }, { timeout }, texts);
    } catch (_) {}

    return await page.evaluate((needles) => {
      const all = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"], li, div, span'));
      for (const n of needles) {
        const candidates = all.filter(el => {
          const t = (el.textContent || '').trim();
          return t.includes(n) && t.length < 300;
        });
        if (candidates.length) {
          candidates.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
          const innerEl = candidates[0];
          const clickable = innerEl.closest('a, button, [role="tab"], [role="button"], [onclick], [tabindex]') || innerEl;
          const info = {
            clicked: true,
            matched: n,
            text: (innerEl.textContent || '').trim().slice(0, 100),
            innerTag: innerEl.tagName.toLowerCase(),
            clickableTag: clickable.tagName.toLowerCase(),
            clickableRole: clickable.getAttribute('role') || null,
            clickableHref: clickable.getAttribute('href') || null,
          };
          clickable.scrollIntoView({ block: 'center' });
          clickable.click();
          return info;
        }
      }
      const available = Array.from(document.querySelectorAll('[role="tab"], button, a'))
        .map(el => (el.textContent || '').trim())
        .filter(t => t && t.length > 1 && t.length < 60);
      return { clicked: false, available: Array.from(new Set(available)).slice(0, 30) };
    }, texts);
  };

  try {
    // Emular iPhone (Pedro faz login com sucesso no celular)
    await page.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1');
    log('viewport set to iPhone mobile');

    // Forçar idioma pt-PT (Fever pode servir UI diferente baseado em locale)
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.5',
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', { get: () => 'pt-PT' });
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-PT', 'pt', 'en'] });
    });
    log('locale set to pt-PT');

    // 1. LOGIN
    log('goto login');
    await page.goto('https://partners.feverup.com/login', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1500);

    const emailSel = 'input[type="email"], input[name="email"], input[id*="email" i]';
    const passSel  = 'input[type="password"], input[name="password"]';
    await page.waitForSelector(emailSel, { timeout: 15000 });

    // Helper React-aware
    const setReactInput = async (selector, value) => {
      await page.evaluate(({ sel, val }) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error('input nao encontrado: ' + sel);
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
      }, { sel: selector, val: value });
    };

    // Helper para clicar botão por texto (case-insensitive, multilíngue)
    const clickButtonByText = async (textPatterns) => {
      const result = await page.evaluate((patterns) => {
        const regex = new RegExp(patterns.join('|'), 'i');
        const btns = Array.from(document.querySelectorAll('button'));
        const match = btns.find(b => regex.test((b.textContent || '').trim()));
        if (!match) return { found: false, available: btns.map(b => (b.textContent || '').trim()).slice(0, 10) };
        if (match.disabled) return { found: true, disabled: true, text: match.textContent.trim() };
        match.click();
        return { found: true, clicked: true, text: match.textContent.trim() };
      }, textPatterns);
      return result;
    };

    // ETAPA 1: email + Continue
    await setReactInput(emailSel, args.username);
    log('email filled');
    await snap('step1-email-filled');
    await sleep(1500);

    const continueResult = await clickButtonByText(['continue', 'continuar', 'next', 'próximo', 'siguiente']);
    log('step1 continue button: ' + JSON.stringify(continueResult));

    if (!continueResult.found || !continueResult.clicked) {
      await snap('step1-no-continue');
      let pageText = '';
      try {
        pageText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
      } catch (_) {}
      log('step1 page text: ' + pageText.replace(/\\n+/g, ' | '));
      throw new Error('etapa 1 falhou: botão Continue não encontrado/clicado. State: ' + JSON.stringify(continueResult));
    }

    // Esperar campo password aparecer (etapa 2)
    await sleep(2000);
    try {
      await page.waitForSelector(passSel, { timeout: 10000 });
      log('password field appeared');
    } catch (_) {
      await snap('step2-no-password-field');
      let pageText = '';
      try {
        pageText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
      } catch (_) {}
      log('step2 page text: ' + pageText.replace(/\\n+/g, ' | '));
      throw new Error('etapa 2 falhou: campo password não apareceu após Continue');
    }

    // ETAPA 2: password + Sign in
    await setReactInput(passSel, args.password);
    log('password filled');
    await snap('step2-pass-filled');
    await sleep(1500);

    const signInResult = await clickButtonByText(['sign in', 'log in', 'entrar', 'iniciar sessão', 'acessar', 'acceder']);
    log('step2 sign-in button: ' + JSON.stringify(signInResult));

    if (!signInResult.found || !signInResult.clicked) {
      await snap('step2-no-signin');
      let pageText = '';
      try {
        pageText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
      } catch (_) {}
      log('step2 page text: ' + pageText.replace(/\\n+/g, ' | '));
      throw new Error('etapa 2 falhou: botão Sign in não encontrado/clicado. State: ' + JSON.stringify(signInResult));
    }

    // Esperar redirect pós-login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 4000 }).catch((e) => {
      log('no navigation after sign in (expected): ' + (e && e.message));
    });
    log('post-signin url=' + page.url());
    await snap('post-signin');

    // Capturar page text para decidir próximo passo (URL pode continuar /login mas conteúdo mudou)
    let postSigninText = '';
    try {
      postSigninText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 3000) : '');
    } catch (_) {}
    log('post-signin page text: ' + postSigninText.replace(/\\n+/g, ' | ').slice(0, 800));

    // Credenciais inválidas → mensagem clara de erro
    if (/do not match|don't match|incorrect|inválida|invalid/i.test(postSigninText)) {
      throw new Error('credenciais rejeitadas: ' + postSigninText.slice(0, 300));
    }

    // Org picker → clicar org configurada
    if (/welcome back|bem-vindo|select.*organization|escolha.*organização|multiple organizations|múltiplas organizações/i.test(postSigninText)) {
      log('detected org picker — clicking org: ' + args.organization);
      await snap('org-picker');

      const orgClickResult = await page.evaluate((orgName) => {
        const all = Array.from(document.querySelectorAll('button, div[role="button"], a, [class*="card"], [class*="organization"]'));
        const candidates = all.filter(el => {
          const t = (el.textContent || '').trim();
          return t.includes(orgName) && t.length < 500;
        });
        if (!candidates.length) {
          const all2 = Array.from(document.querySelectorAll('*'));
          const fallback = all2.filter(el => {
            const t = (el.textContent || '').trim();
            return t.includes(orgName) && t.length < 200;
          });
          if (!fallback.length) return { found: false };
          fallback.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
          fallback[0].click();
          return { found: true, clicked: true, via: 'fallback', text: (fallback[0].textContent || '').trim().slice(0, 100) };
        }
        candidates.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
        candidates[0].click();
        return { found: true, clicked: true, via: 'card', text: (candidates[0].textContent || '').trim().slice(0, 100) };
      }, args.organization);

      log('org click result: ' + JSON.stringify(orgClickResult));

      if (!orgClickResult.found || !orgClickResult.clicked) {
        throw new Error('org picker: não encontrou ou não clicou em "' + args.organization + '"');
      }

      await sleep(3000);

      const postOrgText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '').catch(() => '');
      log('post-org page text: ' + postOrgText.replace(/\\n+/g, ' | ').slice(0, 500));

      if (/não tem acesso|no access|access denied|not authorized/i.test(postOrgText)) {
        log('popup "no access" detected — clicking OK');
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const ok = btns.find(b => /^(ok|okay|aceitar|aceito|fechar|close)$/i.test((b.textContent || '').trim()));
          if (ok) ok.click();
        });
        await sleep(1500);
      }
    }

    log('login flow complete, url=' + page.url());

    try {
      const cookies = await page.cookies();
      log('cookies count: ' + cookies.length + ' | names: ' + cookies.map(c => c.name).slice(0, 20).join(','));
    } catch (e) {
      log('cookies error: ' + (e && e.message));
    }
    await snap('login-complete');

    // 3. Dashboard do plano
    const dashUrl = 'https://partners.feverup.com/plans/dashboard?cityId=' + args.cityId +
                    '&planId=' + args.planId + '&venueId=' + args.venueId;
    log('goto dashboard ' + dashUrl);
    await page.goto(dashUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await snap('dashboard');

    // CRÍTICO: clicar "Show" / "Mostrar" para ativar os filtros e tornar a página interactiva
    log('clicking Show button to activate filters');
    const showMarked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const showBtn = btns.find(b => {
        const t = (b.textContent || '').trim().toLowerCase();
        return /^(show|mostrar|aplicar|apply)$/i.test(t);
      });
      if (!showBtn) return { found: false, buttons: btns.map(b => (b.textContent || '').trim().slice(0, 30)).slice(0, 20) };
      showBtn.setAttribute('data-claude-target', 'show-btn');
      showBtn.scrollIntoView({ block: 'center' });
      return { found: true, text: (showBtn.textContent || '').trim() };
    });
    log('show button mark: ' + JSON.stringify(showMarked));

    if (showMarked.found) {
      await sleep(300);
      try {
        await page.click('[data-claude-target="show-btn"]', { delay: 50 });
        log('Show button clicked');
      } catch (e) {
        log('show button click error: ' + (e && e.message));
      }
      await sleep(6000);
      await snap('after-show');
      const afterShowText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 5000) : '').catch(() => '');
      log('after-show page text: ' + afterShowText.replace(/\\n+/g, ' | ').slice(0, 2500));
    } else {
      log('Show button not found, continuing anyway');
    }

    // DESCOBERTA: logar page text e tabs disponíveis (Fever em EN no Browserless)
    const dashboardText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 4000) : '').catch(() => '');
    log('dashboard page text: ' + dashboardText.replace(/\\n+/g, ' | ').slice(0, 2000));

    const tabsInfo = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"], button, a, li'));
      return tabs.map(t => (t.textContent || '').trim()).filter(t => t && t.length < 60).slice(0, 50);
    });
    log('dashboard tabs/clickables: ' + JSON.stringify(tabsInfo));

    // 4. Aba "Detalhamento de vendas" / "Sales detail" (multi-variante numa única chamada)
    // Discovery: estrutura do elemento "Sales breakdown"
    const breakdownStructure = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const found = all.filter(el => {
        const t = (el.textContent || '').trim();
        return t === 'Detalhes de vendas' || t === 'Detalhamento de vendas' || t === 'Sales breakdown' ||
               ((t.includes('Detalhes de vendas') || t.includes('Detalhamento de vendas') || t.includes('Sales breakdown')) && t.length < 30);
      });
      if (!found.length) return { found: false };
      return found.slice(0, 3).map(el => {
        const ancestors = [];
        let cur = el;
        for (let i = 0; i < 6 && cur && cur.parentElement; i++) {
          cur = cur.parentElement;
          ancestors.push({
            tag: cur.tagName.toLowerCase(),
            role: cur.getAttribute('role') || null,
            href: cur.getAttribute('href') || null,
            cls: (cur.className || '').toString().slice(0, 100),
            hasOnclick: !!cur.onclick || cur.hasAttribute('onclick'),
          });
        }
        return {
          el: { tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim() },
          ancestors,
        };
      });
    });
    log('breakdown structure: ' + JSON.stringify(breakdownStructure));

    // 4. Click via page.click() real (simula browser real, dispara React synthetic events)
    log('click tab Sales breakdown via page.click()');
    const marked = await page.evaluate(() => {
      const names = ['Detalhes de vendas', 'Detalhamento de vendas', 'Sales detail', 'Sales breakdown', 'Sales overview', 'Sales analytics'];
      const all = Array.from(document.querySelectorAll('div, span, button, a, li, [role]'));
      for (const n of names) {
        const candidates = all.filter(el => {
          const t = (el.textContent || '').trim();
          return t === n || (t.includes(n) && t.length < 30);
        });
        if (candidates.length) {
          candidates.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
          const el = candidates[0];
          el.setAttribute('data-claude-target', 'sales-tab');
          el.scrollIntoView({ block: 'center' });
          return { found: true, matched: n, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 80) };
        }
      }
      return { found: false };
    });
    log('mark sales tab: ' + JSON.stringify(marked));

    if (!marked.found) {
      throw new Error('Sales breakdown não encontrado para marcar');
    }

    // Scroll explícito horizontal+vertical (carousel mobile)
    await page.evaluate(() => {
      const el = document.querySelector('[data-claude-target="sales-tab"]');
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      }
    });
    await sleep(1000);
    try {
      await page.click('[data-claude-target="sales-tab"]', { delay: 50 });
      log('page.click() executed on Sales breakdown');
    } catch (e) {
      log('page.click error: ' + (e && e.message));
      const box = await page.evaluate(() => {
        const el = document.querySelector('[data-claude-target="sales-tab"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (box) {
        log('fallback mouse.click at ' + JSON.stringify(box));
        await page.mouse.click(box.x, box.y, { delay: 50 });
      } else {
        throw new Error('não consegui clicar Sales breakdown');
      }
    }

    await sleep(3000);
    log('after-breakdown url: ' + page.url());

    // Scroll para baixo da página para forçar lazy-load dos cards
    log('scrolling to bottom for lazy-load');
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
    });
    await sleep(1500);
    await snap('after-sales-breakdown');

    const afterText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 5000) : '').catch(() => '');
    log('after-breakdown page text: ' + afterText.replace(/\\n+/g, ' | ').slice(0, 2500));

    const afterClickables = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="tab"], button, [class*="card-title"], [class*="cardTitle"], [class*="title"]'));
      return els
        .map(el => ({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 80) }))
        .filter(x => x.text && x.text.length > 2 && x.text.length < 80)
        .slice(0, 50);
    });
    log('after-breakdown titles/clickables: ' + JSON.stringify(afterClickables));

    log('attempting subtab click (optional)');
    const subtabResult = await clickByTextMulti(
      ['Vendas por tipo de bilhete', 'Vendas por tipo de ingresso', 'Sales by ticket type', 'Ticket type sales', 'By ticket type', 'Per ticket type'],
      { timeout: 3000 }
    );
    log('subtab result: ' + JSON.stringify(subtabResult));
    if (subtabResult.clicked) {
      await sleep(1500);
      await snap('after-subtab');
    }

    async function downloadCard(cardTitle) {
      log('download card: ' + cardTitle);

      const menuClicked = await page.evaluate((title) => {
        const titles = Array.from(document.querySelectorAll('*')).filter(el => {
          const t = (el.textContent || '').trim();
          return t.includes(title) && t.length < 300;
        });
        if (!titles.length) return { found: false, reason: 'no title element' };
        titles.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
        const titleEl = titles[0];
        titleEl.scrollIntoView({ block: 'center' });

        let section = titleEl.closest('section, article, [class*="card"], [class*="Card"]') || titleEl.parentElement;
        for (let depth = 0; depth < 5 && section; depth++) {
          const btns = Array.from(section.querySelectorAll('button'));
          const menu = btns.find(b => {
            const t = (b.textContent || '').trim();
            const al = (b.getAttribute('aria-label') || '').toLowerCase();
            return /^[.…⋯⋮]+$/.test(t) || /more|opções|opciones|options/i.test(al) || b.getAttribute('aria-haspopup') === 'true';
          });
          if (menu) {
            menu.click();
            return { found: true, clicked: true, depth };
          }
          section = section.parentElement;
        }
        return { found: true, clicked: false, reason: 'no menu button in card' };
      }, cardTitle);

      log('menu click: ' + JSON.stringify(menuClicked));
      if (!menuClicked.found) throw new Error('card não encontrado: ' + cardTitle);
      if (!menuClicked.clicked) throw new Error('menu (...) não encontrado para card: ' + cardTitle);

      await page.waitForFunction(() => {
        const text = document.body ? document.body.innerText : '';
        return /baixar dados|download data|descargar datos/i.test(text);
      }, { timeout: 10000 });
      await sleep(400);

      lastDownloadUrl = null;

      const downloadClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const candidates = btns.filter(b => {
          const t = (b.textContent || '').trim().toLowerCase();
          return /^(baixar|download|descargar)$/i.test(t) || (t.length < 30 && /(baixar|download|descargar)/i.test(t));
        });
        if (!candidates.length) return false;
        candidates[candidates.length - 1].click();
        return true;
      });

      if (!downloadClicked) throw new Error('botao Baixar nao encontrado');
      log('baixar clicked, aguardar URL');

      let tries = 0;
      while (!lastDownloadUrl && tries < 120) {
        await sleep(500);
        tries++;
      }
      if (!lastDownloadUrl) {
        await snap('no-download-url');
        throw new Error('URL de download nao foi capturada apos clicar Baixar');
      }

      const result = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) throw new Error('fetch ' + r.status + ' ' + url);
        const cd = r.headers.get('content-disposition') || '';
        let filename = 'fever_download.xlsx';
        const m = cd.match(/filename[^;=\\n]*=(?:UTF-\\d['"]*)?([^;\\n"']+)/i);
        if (m && m[1]) filename = decodeURIComponent(m[1].replace(/^["']|["']$/g, '').trim());
        const blob = await r.blob();
        const ab = await blob.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return { b64: btoa(binary), name: filename };
      }, lastDownloadUrl);

      log('downloaded: ' + result.name);

      try { await page.keyboard.press('Escape'); } catch (_) {}
      await sleep(800);
      return result;
    }

    const card1 = await downloadCard('Vendas por tipo de bilhete')
      .catch(async () => await downloadCard('Vendas por tipo de ingresso'))
      .catch(async () => await downloadCard('Sales by ticket type'))
      .catch(async () => await downloadCard('Ticket type sales'));
    const card2 = await downloadCard('Bilhetes por tipo de bilhete e data de compra')
      .catch(async () => await downloadCard('Ingressos por tipo de ingresso e data de compra'))
      .catch(async () => await downloadCard('Tickets by ticket type and purchase date'))
      .catch(async () => await downloadCard('Tickets per ticket type and purchase date'));

    return {
      data: {
        sales:      card2.b64,
        salesName:  card2.name,
        prices:     card1.b64,
        pricesName: card1.name,
        logs,
      },
      type: 'application/json',
    };
  } catch (e) {
    const msg = (e && e.message) || String(e);
    log('FATAL: ' + msg);
    await snap('fatal');
    return {
      data: { error: msg, logs, screenshot: lastScreenshot, url: page.url() },
      type: 'application/json',
    };
  }
}
`;
}

async function runBrowserless(script: string): Promise<any> {
  if (!BROWSERLESS_KEY) throw new Error("BROWSERLESS_API_KEY não configurado");
  const url = `https://production-sfo.browserless.io/function?token=${BROWSERLESS_KEY}&stealth=true`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/javascript" },
    body: script,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Browserless ${resp.status}: ${text.slice(0, 500)}`);
  }
  return await resp.json();
}

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: Body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { configId, mode = "manual", triggeredBy } = body;
  if (!configId) {
    return new Response(JSON.stringify({ error: "configId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 1. Carrega config
  const { data: cfg, error: cfgErr } = await admin
    .from("fever_sync_config").select("*").eq("id", configId).single();
  if (cfgErr || !cfg) {
    return new Response(JSON.stringify({ error: "config not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!cfg.enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 2. Cria run
  const { data: run, error: runErr } = await admin.from("fever_sync_runs").insert({
    config_id: cfg.id, company_id: cfg.company_id, status: "started",
    mode, triggered_by: triggeredBy || null,
  }).select("id").single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: runErr?.message || "could not create run" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const runId = run.id;

  try {
    // 3. Lê credenciais do Vault
    const { data: secretRows, error: secErr } = await admin
      .from("vault.decrypted_secrets" as any)
      .select("decrypted_secret").eq("name", cfg.vault_secret_name).maybeSingle();
    let creds: { username: string; password: string } | null = null;
    if (!secErr && secretRows?.decrypted_secret) {
      try { creds = JSON.parse(secretRows.decrypted_secret); } catch { /* ignore */ }
    }
    if (!creds || !creds.username || !creds.password) {
      // fallback via RPC se a SDK não conseguir ler a vault directamente
      const { data: rpcData, error: rpcErr } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
      if (!rpcErr && rpcData) {
        try { creds = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData; } catch { /* ignore */ }
      }
    }
    if (!creds || !creds.username || !creds.password) {
      throw Object.assign(new Error(`Credenciais ausentes no Vault (${cfg.vault_secret_name})`), { phase: "auth_failed" });
    }

    // 4. Browserless → Puppeteer → 2 XLSX
    const script = buildPuppeteerScript({
      username: creds.username, password: creds.password,
      organization: cfg.organization_name,
      cityId: cfg.city_id, planId: cfg.plan_id, venueId: cfg.venue_id,
    });

    let downloadResult: any;
    try {
      downloadResult = await runBrowserless(script);
      console.log("[fetch-fever] browserless raw keys:", downloadResult ? Object.keys(downloadResult) : 'null');
      if (typeof downloadResult === 'object' && downloadResult !== null) {
        const summary: Record<string, any> = {};
        for (const [k, v] of Object.entries(downloadResult)) {
          summary[k] = typeof v === 'string' ? `string(len=${v.length})` :
                       Array.isArray(v) ? `array(len=${v.length})` :
                       v === null ? 'null' :
                       typeof v === 'object' ? `object(keys=${Object.keys(v as any).join(',')})` :
                       typeof v;
        }
        console.log("[fetch-fever] browserless raw summary:", JSON.stringify(summary));
      }
    } catch (e: any) {
      throw Object.assign(new Error(e?.message || "Browserless falhou"), { phase: "navigation_failed" });
    }
    // Defensivo: se Browserless envolveu em { data: {...} }, desembrulhar
    if (downloadResult && !downloadResult.sales && !downloadResult.prices && !downloadResult.error && downloadResult.data && typeof downloadResult.data === 'object') {
      console.log("[fetch-fever] desembrulhando downloadResult.data");
      downloadResult = downloadResult.data;
    }
    const browserlessLogs: string[] = Array.isArray(downloadResult?.logs) ? downloadResult.logs : [];
    if (downloadResult?.error) {
      console.error("[fetch-fever] script error:", downloadResult.error);
      console.error("[fetch-fever] last url:", downloadResult.url);
      if (browserlessLogs.length) console.error("[fetch-fever] script logs:\n" + browserlessLogs.join("\n"));
      throw Object.assign(new Error(`Browserless script: ${downloadResult.error}`), {
        phase: "navigation_failed",
        filesAudit: { browserless_logs: browserlessLogs, screenshot_b64: downloadResult.screenshot || null, last_url: downloadResult.url || null },
      });
    }
    let { sales, prices, salesName, pricesName } = downloadResult || {};
    if (!sales || !prices) {
      const rawTruncated = JSON.stringify(downloadResult ?? null).slice(0, 8000);
      console.error("[fetch-fever] raw downloadResult:", rawTruncated);
      throw Object.assign(new Error("Browserless devolveu ficheiros vazios"), {
        phase: "download_failed",
        filesAudit: {
          browserless_logs: browserlessLogs,
          raw_response_truncated: rawTruncated,
          raw_response_keys: downloadResult ? Object.keys(downloadResult) : null,
        },
      });
    }
    if (browserlessLogs.length) console.log("[fetch-fever] browserless logs:\n" + browserlessLogs.join("\n"));

    // Re-mapear por filename pattern (defensivo: caso Fever reordene cards na UI)
    // - sales_per_ticket_type_and_ticket_price_*  → "prices" (Relatório 1: Ticket Type+Price+Gross)
    // - tickets_per_ticket_type_and_purchase_date_* → "sales" (Relatório 2: Date+Weekday+Type+Qty)
    const isPricesName = (n?: string) => !!n && /sales_per_ticket_type_and_ticket_price/i.test(n);
    const isSalesName  = (n?: string) => !!n && /tickets_per_ticket_type_and_purchase_date/i.test(n);
    if (isPricesName(salesName) && isSalesName(pricesName)) {
      console.log("[fetch-fever] swap detectado por filename → trocar sales↔prices");
      [sales, prices] = [prices, sales];
      [salesName, pricesName] = [pricesName, salesName];
    }
    console.log(`[fetch-fever] prices file="${pricesName}" sales file="${salesName}"`);

    const filesAudit = [
      { name: salesName || "fever_sales.xlsx", size: Math.round((sales.length * 3) / 4), sheet_name: "sales" },
      { name: pricesName || "fever_prices.xlsx", size: Math.round((prices.length * 3) / 4), sheet_name: "prices" },
    ];

    // 5. Parser
    let parseResult: any, grouped: any;
    try {
      parseResult = parseFeverXlsxBuffers(b64ToArrayBuffer(sales), b64ToArrayBuffer(prices));
      console.log(`[fetch-fever] parsed: ${parseResult.lots.length} lotes, ${parseResult.sales.length} linhas venda, período ${parseResult.totals.periodFrom}→${parseResult.totals.periodTo}, qty=${parseResult.totals.totalQty}, gross=${parseResult.totals.totalGross}, warnings=${parseResult.warnings.length}`);
      if (parseResult.warnings.length) console.log("[fetch-fever] warnings:", parseResult.warnings.slice(0, 10));
      grouped = groupFeverLots(parseResult.lots);
    } catch (e: any) {
      throw Object.assign(new Error(`Parser: ${e?.message || e}`), { phase: "parse_failed", filesAudit });
    }

    // 6. Resolver fever_account_id (1ª conta ticket_office com 'fever' no nome dentro da company)
    const { data: feverAcc } = await admin.from("financial_accounts")
      .select("id, name").eq("type", "ticket_office").eq("company_id", cfg.company_id)
      .ilike("name", "%fever%").limit(1).maybeSingle();
    if (!feverAcc) {
      throw Object.assign(new Error("Conta financeira Fever não encontrada"), { phase: "import_failed", filesAudit });
    }

    // 7. Import
    let audit: any;
    try {
      audit = await runFeverImport({
        supabase: admin, eventId: cfg.event_id, feverAccountId: feverAcc.id,
        parseResult, grouped, filenames: { sales: salesName || "fever_sales.xlsx", prices: pricesName || "fever_prices.xlsx" },
        triggeredBy: triggeredBy || null,
      });
    } catch (e: any) {
      throw Object.assign(new Error(`Import: ${e?.message || e}`), { phase: "import_failed", filesAudit });
    }

    // 8. Sucesso
    await updateRun(admin, runId, {
      status: "success", finished_at: new Date().toISOString(),
      files_downloaded: filesAudit, import_audit: { ...audit, browserless_logs: browserlessLogs },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: "success" });

    return new Response(JSON.stringify({ ok: true, runId, audit }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const phase = e?.phase || "navigation_failed";
    const msg = e?.message || String(e);
    await updateRun(admin, runId, {
      status: phase, finished_at: new Date().toISOString(),
      error_message: msg, files_downloaded: e?.filesAudit || null,
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: phase });
    console.error(`[fever-sync ${runId}] ${phase}: ${msg}`);
    return new Response(JSON.stringify({ ok: false, runId, phase, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

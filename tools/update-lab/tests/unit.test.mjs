import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { startServer, verifySources } from '../server.mjs';

async function harness(mode = 'baseline') {
  const lab = await startServer();
  const events = new Map();
  const session = new Map();
  const calls = { reload: [], requests: [], cleared: [], intervals: [] };
  const nodes = new Map(['#update', '#update-help', '#update-now'].map(id => [id, { hidden: true, textContent: '', disabled: false }]));
  const model = { modal: false };
  const listeners = type => { if (!events.has(type)) events.set(type, []); return events.get(type); };
  const location = { href: lab.origin + '/', hostname: '127.0.0.1', search: '', replace: url => calls.reload.push({ type: 'replace', url }), reload: () => calls.reload.push({ type: 'reload' }) };
  const safeFetch = async (input, init) => {
    const url = new URL(input, lab.origin);
    if (url.origin !== lab.origin) throw new Error('Non-local request refused');
    calls.requests.push(url.href);
    return fetch(url, init);
  };
  const window = {
    location, addEventListener: (type, callback) => listeners(type).push(callback),
    setInterval: (callback, ms) => { calls.intervals.push({ callback, ms }); return calls.intervals.length; },
    caches: { keys: async () => ['lab-cache'], delete: async key => { calls.cleared.push(key); return true; } },
  };
  window.self = window; window.top = window;
  const workerEvents = new Map();
  const navigator = { serviceWorker: { addEventListener: (type, callback) => workerEvents.set(type, callback), register: async () => ({ addEventListener() {}, update() {} }) } };
  const document = {
    visibilityState: 'visible',
    querySelector: selector => selector.startsWith('[role=') ? (model.modal ? {} : null) : nodes.get(selector),
    addEventListener: (type, callback) => listeners('document:' + type).push(callback),
  };
  const context = vm.createContext({
    window, document, navigator, console, URL, URLSearchParams,
    fetch: safeFetch, caches: window.caches,
    sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) },
  });
  const imports = {
    react: '/adapters.js', '@tanstack/react-query': '/adapters.js', sonner: '/adapters.js',
    '@/lib/pwa': '/lib/pwa.js', '@/lib/versionCheck': '/lib/versionCheck.js',
    'virtual:pwa-register': '/sw-register.js',
  };
  const modules = new Map();
  const loading = new Map();
  async function moduleFor(specifier) {
    const route = imports[specifier] || specifier;
    if (!route.startsWith('/')) throw new Error(`Unexpected import: ${specifier}`);
    if (!loading.has(route)) loading.set(route, (async () => {
      const response = await safeFetch(route);
      assert.equal(response.status, 200);
      const source = await response.text();
      const mod = new vm.SourceTextModule(source, { context, identifier: route });
      modules.set(route, mod);
      return mod;
    })());
    return loading.get(route);
  }
  const manager = await moduleFor('/manager.js?mode=' + mode);
  await manager.link(moduleFor);
  await manager.evaluate();
  const adapter = modules.get('/adapters.js').namespace;
  const version = modules.get('/lib/versionCheck.js').namespace;
  const pwa = modules.get('/lib/pwa.js').namespace;
  const render = () => adapter.rerender(manager.namespace.PWAUpdateManager);
  const flush = async () => { await new Promise(resolve => setTimeout(resolve, 40)); };
  render(); version.startVersionCheck(); await flush();
  return {
    lab, model, state: context.__updateLab, calls, nodes, render, version,
    publish: async () => {
      await safeFetch('/__lab/deploy', { method: 'POST' });
      listeners('focus').forEach(callback => callback());
      await flush();
    },
    signalWorker: async () => { pwa.registerPWA(); workerEvents.get('controllerchange')(); await flush(); },
    close: lab.close,
  };
}

async function withHarness(mode, run) {
  const h = await harness(mode);
  try { await run(h); assert.ok(h.calls.requests.every(url => new URL(url).origin === h.lab.origin)); }
  finally { await h.close(); }
}

test('Exact source fingerprints match the pinned repository revision', async () => {
  const s = await verifySources();
  assert.equal(s.commit, '29e18c96f4ebcc76bd1471cd4a68b333f966f12f');
  assert.equal(Object.keys(s.files).length, 5);
});

test('BASELINE: version notification requests navigation despite a dirty form', async () => withHarness('baseline', async h => {
  h.state.dirty = true; h.render();
  await h.publish();
  assert.equal(h.calls.reload.length, 1);
  assert.equal(h.calls.reload[0].type, 'replace');
  assert.match(h.calls.reload[0].url, /v=lab-2/);
  assert.deepEqual(h.calls.cleared, ['lab-cache']);
}));

test('BASELINE: current mutation guard offers the notification instead of navigation', async () => withHarness('baseline', async h => {
  h.state.busy = true; h.render();
  await h.publish();
  assert.equal(h.calls.reload.length, 0);
  assert.equal(h.nodes.get('#update').hidden, false);
}));

test('BASELINE: current modal guard postpones navigation', async () => withHarness('baseline', async h => {
  h.model.modal = true; h.render(); await h.publish();
  assert.equal(h.calls.reload.length, 0);
}));

test('BASELINE: service-worker controller change requests a reload despite dirty state', async () => withHarness('baseline', async h => {
  h.state.dirty = true; h.render(); await h.signalWorker();
  assert.deepEqual(h.calls.reload, [{ type: 'reload' }]);
}));

test('PROPOSAL: dirty state blocks updating; saving alone never reloads; explicit action navigates once', async () => withHarness('proposal', async h => {
  h.state.dirty = true; h.render(); await h.publish();
  assert.equal(h.calls.reload.length, 0);
  assert.equal(h.nodes.get('#update-now').disabled, true);
  await h.state.action(); assert.equal(h.calls.reload.length, 0);
  h.state.dirty = false; h.render();
  assert.equal(h.nodes.get('#update-now').disabled, false);
  assert.equal(h.calls.reload.length, 0);
  await h.state.action(); await h.state.action();
  assert.equal(h.calls.reload.length, 1);
  assert.match(h.calls.reload[0].url, /v=lab-2/);
}));

test('PROPOSAL: an idle page also waits for an explicit update action', async () => withHarness('proposal', async h => {
  await h.publish();
  assert.equal(h.nodes.get('#update').hidden, false);
  assert.equal(h.calls.reload.length, 0);
}));

test('PROPOSAL: mutation beginning after notice is checked again at click time', async () => withHarness('proposal', async h => {
  await h.publish(); h.state.busy = true;
  await h.state.action(); assert.equal(h.calls.reload.length, 0);
}));

test('PROPOSAL: modal beginning after notice blocks the click', async () => withHarness('proposal', async h => {
  await h.publish(); h.model.modal = true;
  await h.state.action(); assert.equal(h.calls.reload.length, 0);
}));

test('PROPOSAL: service-worker controller notification does not reload automatically', async () => withHarness('proposal', async h => {
  await h.signalWorker();
  assert.equal(h.calls.reload.length, 0);
  assert.equal(h.nodes.get('#update').hidden, false);
}));

test('Source loader and server refuse unknown routes, foreign Origin and non-GET writes', async () => {
  const h = await harness();
  try {
    assert.equal((await fetch(h.lab.origin + '/__lab/deploy', { method: 'POST', headers: { Origin: 'https://foreign.invalid' } })).status, 403);
    assert.equal((await fetch(h.lab.origin + '/rest/v1/transactions')).status, 404);
    assert.equal((await fetch(h.lab.origin + '/version.json', { method: 'DELETE' })).status, 405);
    const res = await fetch(h.lab.origin);
    assert.match(res.headers.get('content-security-policy'), /connect-src 'self'/);
  } finally { await h.close(); }
});

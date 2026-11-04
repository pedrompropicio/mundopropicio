import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as trainingGuard from '../../supabase/functions/_shared/training-guard';

const ui = vi.hoisted(() => ({
  training: false, legacy: false, historyError: false,
  historyFilters: [] as boolean[], companyReads: [] as string[],
}));
vi.mock('@/hooks/useCompany', () => ({ useCompany: () => ({
  company: { id: 'real', slug: 'real', is_training: ui.training }, isPlatformAdmin: true,
}) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), Navigate: () => null }));
vi.mock('@/components/HelpTooltip', () => ({ default: () => null }));
vi.mock('@/components/SelectiveRestoreModal', () => ({ default: () => null }));
vi.mock('@/components/ui/overlay-layer', () => ({ OverlayLayer: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: async () => ({ data: [], error: null }),
  from: (table: string) => {
    let training: boolean | undefined;
    const q: any = {};
    q.select = (fields: string) => { if (table === 'companies') ui.companyReads.push(fields); return q; };
    q.eq = (field: string, value: boolean) => { if (field === 'scope_training') { training = value; ui.historyFilters.push(value); } return q; };
    for (const op of ['order', 'limit', 'range']) q[op] = () => q;
    q.then = (resolve: any, reject: any) => {
      if (table === 'companies') return Promise.resolve({ data: [
        { slug: 'real', ...(ui.legacy ? {} : { is_training: ui.training }) },
        { slug: 'training', ...(ui.legacy ? {} : { is_training: true }) },
      ], error: null }).then(resolve, reject);
      if (ui.historyError) return Promise.resolve({ data: null, error: { code: '42501', message: 'sem acesso' } }).then(resolve, reject);
      if (ui.legacy && training !== undefined) return Promise.resolve({ data: null, error: { code: '42703', message: 'column invariant_runs.scope_training does not exist' } }).then(resolve, reject);
      const rows = [
        { id: 'r', ran_at: '2026-11-01T10:00:00Z', drift_count: 0, results: [], scope_training: false },
        ...(!ui.legacy ? [{ id: 't', ran_at: '2026-11-02T10:00:00Z', drift_count: 7, results: [], scope_training: true }] : []),
      ];
      return Promise.resolve({ data: rows.filter(r => training === undefined || r.scope_training === training), error: null }).then(resolve, reject);
    };
    return q;
  },
  storage: { from: () => ({
    list: async (path: string) => ({ data: path === ''
      ? [...['real', 'training', 'global'].map(name => ({ name, id: null })),
        ...['backup-real-2026-11-01.json', 'backup-global-2026-11-01.json'].map(name => ({ name, id: 'file', created_at: '2026-11-01T10:00:00Z', metadata: { size: 512 } }))]
      : path.includes('/') ? [{ name: 'manifest.json', id: 'file', created_at: '2026-11-01T10:00:00Z', metadata: { size: 512 } }]
      : [{ name: '2026-11-01T10-00-00Z', id: null }], error: null }),
    download: async () => ({ data: { text: async () => JSON.stringify({ tables: { companies: {} }, rows_total: 1 }) }, error: null }),
  }) },
} }));
import InvariantMonitor from '@/pages/admin/InvariantMonitor';
import DatabaseBackups from '@/pages/DatabaseBackups';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const clients: QueryClient[] = [];
function mount(component: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(React.createElement(QueryClientProvider, { client }, React.createElement(component)));
}
beforeEach(() => { ui.training = false; ui.legacy = false; ui.historyError = false; ui.historyFilters = []; ui.companyReads = []; });
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.restoreAllMocks(); });

describe('562c UI', () => {
  it('history defaults to real runs and the Treino selector reads its separate server scope', async () => {
    mount(InvariantMonitor);
    await screen.findByText(/todas as verificações na referência/);
    expect(screen.queryAllByText(/7 fora da referência/)).toHaveLength(0);
    expect(ui.historyFilters).toEqual([false]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Âmbito do histórico' }), { target: { value: 'training' } });
    await screen.findAllByText(/7 fora da referência/);
    expect(screen.getByText('Última execução de treino registada')).toBeInTheDocument();
    expect(ui.historyFilters).toEqual([false, true]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'real' } });
    await screen.findByText(/todas as verificações na referência/);
    expect(screen.queryAllByText(/7 fora da referência/)).toHaveLength(0);
  });
  it('history before 0327 retains the legacy real DOM without offering training', async () => {
    ui.legacy = true;
    mount(InvariantMonitor);
    await screen.findByText(/todas as verificações na referência/);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryAllByText(/7 fora da referência/)).toHaveLength(0);
  });
  it('history permission errors are visible and never trigger a legacy unscoped read', async () => {
    ui.historyError = true;
    mount(InvariantMonitor);
    await screen.findByText('sem acesso');
    expect(ui.historyFilters).toEqual([false]);
  });
  it('backup badges belong only to training rows; global rows keep their DOM', async () => {
    mount(DatabaseBackups);
    await screen.findByText(/1 tabelas salvaguardadas/);
    await waitFor(() => expect(screen.getAllByText('TREINO')).toHaveLength(1));
    expect(screen.getByText('training · 2026-11-01T10-00-00Z').parentElement!.parentElement).toHaveTextContent('TREINO');
    expect(screen.getByText('global · 2026-11-01T10-00-00Z').parentElement!.parentElement).not.toHaveTextContent('TREINO');
    expect(ui.companyReads).toEqual(['*']);
  });
  it('both formats of the active training company get a badge; the global file stays unchanged', async () => {
    ui.training = true;
    mount(DatabaseBackups);
    await screen.findByText(/1 tabelas salvaguardadas/);
    await waitFor(() => expect(screen.getAllByText('TREINO')).toHaveLength(3));
    expect(screen.getByText('backup-real-2026-11-01.json').parentElement!.parentElement).toHaveTextContent('TREINO');
    expect(screen.getByText('backup-global-2026-11-01.json').parentElement!.parentElement).not.toHaveTextContent('TREINO');
  });
  it('backup metadata before 0327 leaves every legacy row without a badge', async () => {
    ui.legacy = true;
    mount(DatabaseBackups);
    await screen.findByText(/1 tabelas salvaguardadas/);
    expect(screen.queryByText('TREINO')).not.toBeInTheDocument();
  });
  it('backup real DOM has the SHA-256 captured on 517762fee before the page edits', async () => {
    const { container } = mount(DatabaseBackups);
    await screen.findByText(/1 tabelas salvaguardadas/);
    // Training rows are tested separately; hash the real row, without changing its DOM.
    const row = screen.getByText('real · 2026-11-01T10-00-00Z').parentElement!.parentElement!;
    expect(hash(row.outerHTML)).toBe('1dda1b0f10b9f26d971b6791841d47eaa3d5915bbe225803b3d2b6bc38f13ce3');
    expect(row).not.toHaveTextContent('TREINO');
    expect(container).toHaveTextContent('global ·');
  });
});

type EventFixture = {
  id: string; company_id: string | null; name: string; date: string;
  slug: string; portal_visible: boolean; portal_featured: boolean;
  parent_event_id: string | null; ticketing_url: string | null; ticketing_provider: string;
};
const event = (company = 'real', id = company): EventFixture => ({
  id, company_id: company, name: `Evento ${id}`, date: '2030-01-03', slug: id,
  portal_visible: true, portal_featured: true, parent_event_id: null,
  ticketing_url: `https://ticketline.pt/sessao/${id}`, ticketing_provider: 'ticketline',
});
function bilheteiraFixture(input: EventFixture[], guardError?: string) {
  const rows = input.map(e => ({ ...e }));
  const effects = { writes: [] as any[], order: [] as string[], queries: [] as string[],
    network: vi.fn(async (url: string) => { effects.order.push(`network:${url}`); return { ok: true, status: 200, html: '<p>synthetic</p>', url }; }),
    invoke: vi.fn(async (_name: string, _args: any) => ({ data: {}, error: null })),
  };
  const sb = {
    rpc: vi.fn(async (_name: string, args: any) => {
      effects.order.push(`guard:${args._company_id}`);
      return { data: args._company_id === 'training', error: guardError ? { code: guardError, message: 'is_training_company absent' } : null };
    }),
    functions: { invoke: effects.invoke },
    from: (table: string) => {
      effects.queries.push(table);
      const filters: Array<(e: any) => boolean> = [];
      let limit = Infinity, rangeStart = 0, rangeEnd = Infinity;
      let op = '', payload: any, fields = '*';
      const q: any = {};
      q.select = (value: string) => { fields = value; return q; };
      q.eq = (key: string, value: any) => { filters.push(e => e[key] === value); return q; };
      q.in = (key: string, values: any[]) => { filters.push(e => values.includes(e[key])); return q; };
      q.lt = (key: string, value: string) => { filters.push(e => e[key] < value); return q; };
      q.gte = (key: string, value: string) => { filters.push(e => e[key] >= value); return q; };
      q.is = (key: string, value: any) => { filters.push(e => e[key] === value); return q; };
      q.not = (key: string, _op: string, _value: any) => { filters.push(e => e[key] != null); return q; };
      q.order = () => q;
      q.limit = (value: number) => { limit = value; return q; };
      q.range = (from: number, to: number) => { rangeStart = from; rangeEnd = to; return q; };
      for (const mutation of ['update', 'insert', 'upsert']) q[mutation] = (value: any) => { op = mutation; payload = value; return q; };
      q.then = (resolve: any, reject: any) => {
        const matched = rows.filter(e => filters.every(f => f(e))).slice(0, limit).slice(rangeStart, rangeEnd + 1);
        if (op) {
          effects.writes.push({ table, op, payload, ...(table === 'events' ? { ids: matched.map(e => e.id) } : {}) });
          if (table === 'events' && op === 'update') matched.forEach(e => Object.assign(e, payload));
        }
        const data = op ? null : table === 'events' ? matched.map(row => fields === '*' ? row
          : Object.fromEntries(fields.split(',').map(field => [field.trim(), row[field.trim()]])))
          : table === 'user_roles' ? [{ user_id: 'synthetic' }]
          : table === 'profiles' ? [{ email: 'synthetic@invalid.test' }] : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return q;
    },
  };
  const lot = { label_pt: 'Plateia', label_en: 'Floor', price: 25, status: 'disponivel' };
  const modules: Record<string, any> = {
    'npm:@supabase/supabase-js@2': { createClient: () => sb },
    '../_shared/multiTenant.ts': { isServiceRoleRequest: async () => true },
    '../_shared/training-guard.ts': trainingGuard,
    '../_shared/paging.ts': { fetchAllPagedQuery: async (q: any) => await q },
    '../_shared/tolerant-fetch.ts': { tolerantFetch: effects.network },
    '../_shared/bilheteira-parsers.ts': {
      parseEventInfo: () => ({ ageRating: 'M/6', doorsTime: '20:00' }),
      parseTicketlineSession: (_html: string, url: string) => ({ url, zones: [{ name: 'Plateia', zone: 'Plateia', ignored: false, seatsAvailable: null }] }),
      looksSane: () => true,
      buildTicketLots: () => ({ ticketLots: [lot], offerPriceMin: 25, possibleSoldOut: false }),
    },
  };
  class FixedDate extends Date {
    constructor(value: string | number = '2030-01-02T12:00:00Z') { super(value); }
    static now() { return new Date('2030-01-02T12:00:00Z').getTime(); }
  }
  let handler: (r: Request) => Promise<Response>;
  const compiled = ts.transpileModule(readFileSync('supabase/functions/bilheteira-sync/index.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    require: (name: string) => { if (!(name in modules)) throw new Error(`unexpected import ${name}`); return modules[name]; },
    exports: {},
    Deno: { env: { get: (name: string) => name === 'BILHETEIRA_SYNC_NOTIFY_TO' ? 'synthetic@invalid.test' : undefined }, serve: (h: any) => { handler = h; } },
    console: { log() {}, error() {}, warn() {} }, Date: FixedDate, Error, Request, Response, URL, Map, Set,
    fetch: () => { throw new Error('unmocked external fetch'); },
  });
  const run = async (body: object) => handler(new Request('https://invalid.test', { method: 'POST', body: JSON.stringify(body) }));
  return { run, effects, sb };
}

describe('562c bilheteira-sync real entrypoint with simulated dependencies', () => {
  it.each([false, true])('explicit training event never scrapes, sends, or writes (dryRun=%s)', async dryRun => {
    const { run, effects, sb } = bilheteiraFixture([event('training')]);
    const response = await run({ eventId: 'training', dryRun });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scanned: 0, results: [], email_sent: false });
    expect(effects.network).not.toHaveBeenCalled();
    expect(effects.invoke).not.toHaveBeenCalled();
    expect(effects.writes).toEqual([]);
    expect(sb.rpc).toHaveBeenCalledWith('is_training_company', { _company_id: 'training' });
  });
  it('daily batch resolves each distinct company before scraping and keeps only real events', async () => {
    const { run, effects, sb } = bilheteiraFixture([event('training'), event('real'), event('real', 'real2')]);
    const response = await run({});
    const body = await response.json();
    expect(body).toMatchObject({ scanned: 2, email_sent: true });
    expect(JSON.stringify(body)).not.toContain('Evento training');
    expect(effects.network.mock.calls.map(([url]) => url)).toEqual(['https://ticketline.pt/sessao/real', 'https://ticketline.pt/sessao/real2']);
    expect(effects.order.slice(0, 2).sort()).toEqual(['guard:real', 'guard:training']);
    expect(sb.rpc).toHaveBeenCalledTimes(2); // same cache is used by the featured rotation
    expect(JSON.stringify(effects.writes)).not.toContain('Evento training');
    expect(JSON.stringify(effects.invoke.mock.calls)).not.toContain('Evento training');
  });
  it('training-only daily rotation generates neither mutations nor digest, including past features', async () => {
    const stale = { ...event('training', 'stale'), date: '2029-01-01' };
    const next = { ...event('training', 'next'), portal_featured: false, ticketing_url: null };
    const { run, effects } = bilheteiraFixture([stale, next]);
    const body = await (await run({})).json();
    expect(body).toMatchObject({ scanned: 0, featured_rotation: { unfeatured: [], promoted: null }, email_sent: false });
    expect(effects.network).not.toHaveBeenCalled();
    expect(effects.invoke).not.toHaveBeenCalled();
    expect(effects.writes).toEqual([]);
  });
  it('training features cannot hide or displace the real candidate during rotation', async () => {
    const stale = { ...event('training', 'stale'), date: '2029-01-01' };
    const training = { ...event('training'), ticketing_url: null };
    const real = { ...event(), portal_featured: false, ticketing_url: null };
    const { run, effects } = bilheteiraFixture([stale, training, real]);
    const body = await (await run({})).json();
    expect(body.featured_rotation).toMatchObject({ unfeatured: [], promoted: 'Evento real (2030-01-03)' });
    expect(effects.writes.filter(w => w.table === 'events')).toEqual([{ table: 'events', op: 'update', payload: { portal_featured: true }, ids: ['real'] }]);
    expect(JSON.stringify(body)).not.toContain('Evento training');
  });
  it('rotation refills the twenty candidate slots occupied by training events', async () => {
    const training = Array.from({ length: 21 }, (_, i) => ({ ...event('training', `training${i}`), ticketing_url: null, portal_featured: false }));
    const real = { ...event(), ticketing_url: null, portal_featured: false };
    const { run, effects } = bilheteiraFixture([...training, real]);
    const body = await (await run({})).json();
    expect(body.featured_rotation.promoted).toBe('Evento real (2030-01-03)');
    expect(effects.writes.filter(w => w.table === 'events').flatMap(w => w.ids)).toEqual(['real']);
  });
  it('real rotation response and writes retain their pre-edit hash', async () => {
    const stale = { ...event('real', 'stale'), date: '2029-01-01' };
    const next = { ...event(), ticketing_url: null, portal_featured: false };
    const { run, effects } = bilheteiraFixture([stale, next]);
    const body = await (await run({})).text();
    expect(hash(JSON.stringify({ body, writes: effects.writes, digest: effects.invoke.mock.calls }))).toBe('60614868159f8439c9163b7603596a95258c4d05faa927cfc884fabf80722bc0');
  });
  it.each(['42501', '57014'])('guard error %s fails closed before every external effect', async error => {
    const { run, effects } = bilheteiraFixture([event()], error);
    const response = await run({ eventId: 'real' });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: `training_guard_unavailable: ${error}` });
    expect(effects.network).not.toHaveBeenCalled();
    expect(effects.invoke).not.toHaveBeenCalled();
    expect(effects.writes).toEqual([]);
  });
  it('a global NULL origin remains unchanged and does not resolve a company', async () => {
    const { run, effects, sb } = bilheteiraFixture([{ ...event(), company_id: null }]);
    const body = await (await run({ eventId: 'real' })).json();
    expect(body).toMatchObject({ scanned: 1, email_sent: false, email_reason: 'no_single_company' });
    expect(effects.network).toHaveBeenCalledOnce();
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it('missing 0327 RPC preserves the old real behavior', async () => {
    const { run, effects } = bilheteiraFixture([event()], 'PGRST202');
    expect((await run({ eventId: 'real' })).status).toBe(200);
    expect(effects.network).toHaveBeenCalledOnce();
    expect(effects.invoke).toHaveBeenCalledOnce();
  });
  it('real response, database writes and digest payload retain the pre-edit hash', async () => {
    const { run, effects } = bilheteiraFixture([event()]);
    const response = await run({ eventId: 'real' });
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(effects.network).toHaveBeenCalledOnce();
    expect(effects.invoke).toHaveBeenCalledOnce();
    expect(hash(JSON.stringify({ body, writes: effects.writes, digest: effects.invoke.mock.calls }))).toBe('1e0f9a998967f8be3a57b1e93ffa4fe9b5bc27da66a2958646608563f2dfedf9');
  });
});

// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as trainingGuard from '../../supabase/functions/_shared/training-guard';

// Run the real entrypoints, replacing only imports/environment. No credentials,
// database, provider or network access; query filters actually select fixture rows.
const compile = (file: string) => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const edgeCode = compile('supabase/functions/send-push-notification/index.ts');
const clientCode = compile('src/lib/push-notifications.ts');
type Row = Record<string, any>;
type QueryRead = { table: string; filters: Array<[string, string, any]>; mutation?: string };

function database(tables: Record<string, Row[]>, failTable?: string) {
  const reads: QueryRead[] = [];
  const from = (table: string) => {
    const read: QueryRead = { table, filters: [] };
    let single = false;
    const query: any = {};
    query.select = () => query;
    query.eq = (key: string, value: unknown) => { read.filters.push(['eq', key, value]); return query; };
    query.in = (key: string, values: unknown[]) => { read.filters.push(['in', key, values]); return query; };
    query.maybeSingle = () => { single = true; return query; };
    query.delete = () => { read.mutation = 'delete'; return query; };
    query.then = (resolve: any, reject: any) => {
      reads.push(read);
      const matches = (row: Row) => read.filters.every(([op, key, value]) =>
        op === 'eq' ? row[key] === value : value.includes(row[key]));
      const rows = (tables[table] ?? []).filter(matches);
      const error = table === failTable ? { message: `unavailable: ${table}` } : null;
      if (read.mutation && !error) tables[table] = (tables[table] ?? []).filter(row => !matches(row));
      return Promise.resolve({
        data: error || read.mutation ? null : single ? rows[0] ?? null : rows,
        error,
      }).then(resolve, reject);
    };
    return query;
  };
  return { from, reads };
}

const notification = { title: 'Synthetic title', body: 'Synthetic body', url: '/operacao', badge_count: 2 };
const adminsX = { type: 'company_admins', company_id: 'X' };
const frenteX = { type: 'frente_team', frente_id: 'front-X' };
const users = { type: 'users', user_ids: ['A', 'B', 'A'] };
const roles = () => [
  { user_id: 'A', company_id: 'X', role: 'admin' },
  { user_id: 'A', company_id: 'X', role: 'manager' },
  { user_id: 'A', company_id: 'Y', role: 'admin' },
  { user_id: 'B', company_id: 'Y', role: 'viewer' },
  { user_id: 'C', company_id: 'Y', role: 'manager' },
  { user_id: 'D', company_id: 'X', role: 'viewer' },
];
function edgeFixture(options: {
  caller?: 'service' | 'user' | 'platform'; activeCompany?: string | null;
  baseCompany?: string | null; training?: string[]; trainingError?: string;
  failTable?: string; expired?: boolean; invalidAuth?: boolean;
} = {}) {
  const caller = options.caller ?? 'service';
  const tables: Record<string, Row[]> = {
    user_roles: roles(),
    operacao_frentes: [{ id: 'front-X', company_id: 'X', current_lead_id: 'A' }],
    operacao_frente_team: [
      { frente_id: 'front-X', profile_id: 'B', active: true },
      { frente_id: 'front-X', profile_id: 'D', active: false },
    ],
    push_subscriptions: ['A-X', 'A-Y', 'B-X', 'B-Y', 'C-Y', 'D-X'].map(id => ({
      user_id: id[0], company_id: id[2], endpoint: `https://push.invalid/${id}`, p256dh: 'synthetic', auth: 'synthetic',
    })),
    profiles: [
      { id: 'A', company_id: options.baseCompany === undefined ? 'Y' : options.baseCompany,
        active_company_id: options.activeCompany === undefined ? 'X' : options.activeCompany,
        phone: '+00000000001', full_name: 'Synthetic A' },
      { id: 'B', company_id: 'Y', phone: '+00000000002', full_name: 'Synthetic B' },
      { id: 'D', company_id: 'X', phone: '+00000000004', full_name: 'Synthetic D' },
    ],
    system_reminder_settings: [{ id: 1, default_twilio_from: '+00000000000' }],
  };
  const db = database(tables, options.failTable);
  const push = vi.fn(async () => {
    if (options.expired) throw Object.assign(new Error('expired'), { statusCode: 410 });
  });
  const whatsapp = vi.fn(async () => ({ sid: 'synthetic' }));
  const vapid = vi.fn();
  const rpc = vi.fn(async (name: string, args: Row) => {
    if (name === 'is_platform_admin') return { data: caller === 'platform', error: null };
    if (name !== 'is_training_company') throw new Error(`Unexpected RPC ${name}`);
    return { data: (options.training ?? []).includes(args._company_id),
      error: options.trainingError ? { code: options.trainingError } : null };
  });
  const sb = { from: db.from, rpc, auth: { getUser: async () => ({
    data: { user: options.invalidAuth ? null : { id: 'A' } }, error: null,
  }) } };
  const modules: Record<string, unknown> = {
    'npm:@supabase/supabase-js@2': { createClient: () => sb },
    '../_shared/multiTenant.ts': { isServiceRoleRequest: async () => caller === 'service' },
    '../_shared/training-guard.ts': trainingGuard,
    '../_shared/twilio.ts': { sendWhatsApp: whatsapp },
    'npm:web-push@3.6.7': { setVapidDetails: vapid, sendNotification: push },
  };
  let handler!: (req: Request) => Promise<Response>;
  vm.runInNewContext(edgeCode, {
    require: (name: string) => { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name]; },
    exports: {}, Request, Response, URL, Set, Error,
    Deno: {
      env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://supabase.invalid' : 'synthetic' },
      serve: (fn: typeof handler) => { handler = fn; },
    },
    console: { log() {}, warn() {}, error() {} },
    fetch: () => { throw new Error('External network forbidden'); },
  });
  const run = (body: Row) => handler(new Request('https://edge.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ ...notification, ...body }),
  }));
  return { run, push, whatsapp, vapid, rpc, reads: db.reads, tables };
}

function expectOnlyAX(fixture: ReturnType<typeof edgeFixture>) {
  expect(fixture.push.mock.calls.map(args => (args as any[])[0].endpoint)).toEqual(['https://push.invalid/A-X']);
  expect(fixture.reads.filter(r => r.table === 'push_subscriptions' && !r.mutation)).toEqual([
    { table: 'push_subscriptions', filters: [['in', 'user_id', ['A']], ['eq', 'company_id', 'X']] },
  ]);
}
function expectNoDelivery(fixture: ReturnType<typeof edgeFixture>) {
  expect(fixture.push).not.toHaveBeenCalled();
  expect(fixture.whatsapp).not.toHaveBeenCalled();
  expect(fixture.vapid).not.toHaveBeenCalled();
  expect(fixture.reads.some(r => r.mutation)).toBe(false);
}

describe('#656 criterion 1 — real edge with companies X/Y', () => {
  it('company_admins X sends to multi-company A only on subscription X', async () => {
    const fixture = edgeFixture();
    const response = await fixture.run({ target: adminsX });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, sent: 1, failed: 0, cleaned: 0, resolved_user_count: 1 });
    expectOnlyAX(fixture);
    expect(JSON.parse((fixture.push.mock.calls[0] as any[])[1])).toEqual(notification);
  });
  it('frente_team X excludes B (Y membership only), includes lead A, and scopes both channels', async () => {
    const fixture = edgeFixture();
    const response = await fixture.run({ target: frenteX, whatsapp: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 1, resolved_user_count: 1, whatsapp: { sent: 1, failed: 0 } });
    expectOnlyAX(fixture);
    expect(fixture.whatsapp.mock.calls).toEqual([
      ['+00000000001', `🚨 ${notification.title}\n${notification.body}\n/operacao`, '+00000000000'],
    ]);
  });
  it.each([undefined, 'system', 'run_operacao_sla_escalator'])('service_role users without origin refuses system_sender=%s', async system_sender => {
    const fixture = edgeFixture();
    const response = await fixture.run({ target: users, system_sender, whatsapp: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'origin_company_required' });
    expect(fixture.reads).toEqual([]);
    expectNoDelivery(fixture);
  });
  it.each([{ target: users }, { user_ids: ['A', 'B', 'A'] }])('service_role explicit origin scopes users and legacy user_ids: %j', async recipients => {
    const fixture = edgeFixture();
    const response = await fixture.run({ ...recipients, company_id: 'X' });
    expect(response.status).toBe(200);
    expectOnlyAX(fixture);
  });
  it('users can include a non-admin member of X, but not B despite a corrupt B-X subscription', async () => {
    const fixture = edgeFixture();
    const response = await fixture.run({ user_ids: ['B', 'D'], company_id: 'X' });
    expect(await response.json()).toMatchObject({ sent: 1, resolved_user_count: 1 });
    expect(fixture.push.mock.calls.map(args => (args as any[])[0].endpoint)).toEqual(['https://push.invalid/D-X']);
  });
  it.each([adminsX, frenteX])('target origin X conflicts with body origin Y: %j', async target => {
    const fixture = edgeFixture();
    const response = await fixture.run({ target, company_id: 'Y', whatsapp: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'origin_company_mismatch' });
    expect(fixture.reads.every(r => r.table === 'operacao_frentes')).toBe(true);
    expectNoDelivery(fixture);
  });
  it('user caller resolves active X ahead of profile base Y', async () => {
    const fixture = edgeFixture({ caller: 'user' });
    const response = await fixture.run({ target: users });
    expect(response.status).toBe(200);
    expectOnlyAX(fixture);
  });
  it('user caller retains profile company fallback when active company is absent', async () => {
    const fixture = edgeFixture({ caller: 'user', activeCompany: null, baseCompany: 'X' });
    expect((await fixture.run({ target: users })).status).toBe(200);
    expectOnlyAX(fixture);
  });
  it.each(['user', 'platform'] as const)('%s caller active X cannot request origin Y', async caller => {
    const fixture = edgeFixture({ caller });
    const response = await fixture.run({ target: users, company_id: 'Y' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'origin_company_mismatch' });
    expectNoDelivery(fixture);
  });
  it.each([['user', 403, 'Caller has no company'], ['platform', 400, 'origin_company_required']] as const)(
    '%s caller without any company refuses with %i', async (caller, status, error) => {
      const fixture = edgeFixture({ caller, activeCompany: null, baseCompany: null });
      const response = await fixture.run({ target: users });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
      expectNoDelivery(fixture);
    },
  );
  it('a missing front without another source never becomes a global origin', async () => {
    const fixture = edgeFixture();
    const response = await fixture.run({ target: { type: 'frente_team', frente_id: 'absent' } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'origin_company_required' });
    expectNoDelivery(fixture);
  });
  it('a target with no origin-company members preserves the empty success contract', async () => {
    const fixture = edgeFixture();
    const response = await fixture.run({ company_id: 'X', user_ids: ['B'], whatsapp: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, sent: 0, message: 'Sem destinatários' });
    expectNoDelivery(fixture);
  });
  it.each(['operacao_frentes', 'user_roles', 'push_subscriptions'])('%s read errors prevent both delivery channels', async failTable => {
    const fixture = edgeFixture({ failTable });
    const response = await fixture.run({ company_id: 'X', target: failTable === 'operacao_frentes' ? frenteX : users, whatsapp: true });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: `unavailable: ${failTable}` });
    expectNoDelivery(fixture);
  });
  it('expired endpoint cleanup remains within the origin company', async () => {
    const fixture = edgeFixture({ expired: true });
    // Same endpoint in another tenant must survive the cleanup.
    fixture.tables.push_subscriptions.push({ ...fixture.tables.push_subscriptions[0], company_id: 'Y' });
    const response = await fixture.run({ target: adminsX });
    expect(await response.json()).toEqual({ success: true, sent: 0, failed: 1, cleaned: 1, resolved_user_count: 1 });
    expectOnlyAX(fixture);
    expect(fixture.tables.push_subscriptions.some(s => s.endpoint === 'https://push.invalid/A-X' && s.company_id === 'Y')).toBe(true);
  });
  it('invalid user authentication never resolves recipients or delivers', async () => {
    const fixture = edgeFixture({ caller: 'user', invalidAuth: true });
    expect((await fixture.run({ target: users })).status).toBe(401);
    expect(fixture.reads).toEqual([]);
    expectNoDelivery(fixture);
  });
});

describe('#656 criterion 3 — #562 guard retained on the resolved origin', () => {
  it.each([
    { target: adminsX }, { target: frenteX }, { user_ids: ['A'], company_id: 'X' },
  ])('training X refuses before recipient resolution or either provider: %j', async body => {
    const fixture = edgeFixture({ training: ['X'] });
    const response = await fixture.run({ ...body, whatsapp: true });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'training_company' });
    expect(fixture.reads.every(r => r.table === 'operacao_frentes')).toBe(true);
    expect(fixture.rpc).toHaveBeenCalledWith('is_training_company', { _company_id: 'X' });
    expectNoDelivery(fixture);
  });
  it('training in unrelated Y does not block real X, and agreement checks the guard only once', async () => {
    const fixture = edgeFixture({ caller: 'user', training: ['Y'] });
    expect((await fixture.run({ target: adminsX, company_id: 'X' })).status).toBe(200);
    expect(fixture.rpc.mock.calls.filter(([name]) => name === 'is_training_company')).toEqual([
      ['is_training_company', { _company_id: 'X' }],
    ]);
    expectOnlyAX(fixture);
  });
  it('training guard lookup failure prevents delivery', async () => {
    const fixture = edgeFixture({ trainingError: '42501' });
    const response = await fixture.run({ target: adminsX, whatsapp: true });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'training_guard_unavailable: 42501' });
    expectNoDelivery(fixture);
  });
});

function clientFixture(initialCompany: string | null = 'X') {
  const db = database({ user_roles: roles() });
  let company = initialCompany;
  const resolveCompany = vi.fn(async () => company);
  const invoke = vi.fn(async () => ({ data: {}, error: null }));
  const getSession = vi.fn(async () => ({ data: { session: { user: { id: 'A' } } as object | null } }));
  const exports: any = {};
  const modules: Record<string, unknown> = {
    '@/integrations/supabase/client': { supabase: { from: db.from, auth: { getSession }, functions: { invoke } } },
    '@/hooks/useCompany': { getCurrentCompanyId: resolveCompany },
  };
  vm.runInNewContext(clientCode, {
    exports,
    require: (name: string) => { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name]; },
    console: { error() {} },
    fetch: () => { throw new Error('External network forbidden'); },
  });
  return { send: exports.sendPushToAdminsAndManagers as (title: string, body: string, url?: string, badgeCount?: number) => Promise<void>,
    invoke, resolveCompany, getSession, reads: db.reads, setCompany: (value: string) => { company = value; } };
}

describe('#656 criterion 2 — client helper active-company boundary', () => {
  it('queries admin/manager only in X and includes company_id in the invoke body', async () => {
    const fixture = clientFixture();
    await fixture.send('Title', 'Body', '/operacao', 3);
    expect(fixture.resolveCompany).toHaveBeenCalledOnce();
    expect(fixture.reads).toEqual([{ table: 'user_roles', filters: [
      ['eq', 'company_id', 'X'], ['in', 'role', ['admin', 'manager']],
    ] }]);
    expect(fixture.invoke).toHaveBeenCalledWith('send-push-notification', {
      body: { company_id: 'X', user_ids: ['A', 'A'], title: 'Title', body: 'Body', url: '/operacao', badge_count: 3 },
    });
  });
  it('resolves the company again after a switch, without reusing X recipients', async () => {
    const fixture = clientFixture();
    await fixture.send('First', 'Body');
    fixture.setCompany('Y');
    await fixture.send('Second', 'Body');
    expect(fixture.resolveCompany).toHaveBeenCalledTimes(2);
    expect(fixture.invoke.mock.calls[1]).toEqual(['send-push-notification', {
      body: { company_id: 'Y', user_ids: ['A', 'C'], title: 'Second', body: 'Body', url: undefined, badge_count: undefined },
    }]);
  });
  it('without an active company it never queries roles or invokes the edge', async () => {
    const fixture = clientFixture(null);
    await fixture.send('Title', 'Body');
    expect(fixture.reads).toEqual([]);
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('without a session it never resolves the company or sends', async () => {
    const fixture = clientFixture();
    fixture.getSession.mockResolvedValueOnce({ data: { session: null } });
    await fixture.send('Title', 'Body');
    expect(fixture.resolveCompany).not.toHaveBeenCalled();
    expect(fixture.reads).toEqual([]);
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('without admin/manager recipients it never invokes the edge', async () => {
    const fixture = clientFixture('Z');
    await fixture.send('Title', 'Body');
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
});

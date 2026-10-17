import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { collectAllLeads, sendUsers } from '../../supabase/functions/crm-meta-audience-sync/sync-users';

async function handlerFixture(collectError = false) {
  let handler: (request: Request) => Promise<Response> = async () => new Response('', { status: 500 });
  const mutation = vi.fn(() => { throw new Error('dry_run mutation'); });
  const external = vi.fn(() => { throw new Error('external egress'); });
  const rpc = vi.fn((name: string) => {
    if (name !== 'crm_meta_audience_collect_leads') throw new Error('token requested in dry_run');
    const query = {
      order: () => query,
      range: async () => ({ data: collectError ? null : [{ email: 'private@test.invalid', phone: '351999' }], error: collectError ? { message: 'denied' } : null }),
    };
    return query;
  });
  const client = {
    rpc,
    from: () => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', filters: { replace: true }, audience_id_meta: 'test', company_id: 'coala' }, error: null }),
        insert: mutation, update: mutation,
      };
      return query;
    },
  };
  const source = readFileSync('supabase/functions/crm-meta-audience-sync/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(script, {
    createClient: () => client, collectAllLeads, sendUsers,
    Deno: { env: { get: () => 'fixture' }, serve: (fn: typeof handler) => { handler = fn; } },
    Request, Response, Headers, URLSearchParams, fetch: external, crypto, TextEncoder,
  });
  return { handler, external, mutation, rpc };
}

describe('real audience handler dry run', () => {
  it('omitted dry_run preserves count only without Meta/token/log writes', async () => {
    const fixture = await handlerFixture();
    const response = await fixture.handler(new Request('https://test.invalid', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ audience_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, dry_run: true, total_records_local: 1, replace: true });
    expect(fixture.external).not.toHaveBeenCalled();
    expect(fixture.mutation).not.toHaveBeenCalled();
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
  });
  it('returns explicit failure on collection denial and never uploads', async () => {
    const fixture = await handlerFixture(true);
    const response = await fixture.handler(new Request('https://test.invalid', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ audience_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', dry_run: true }) }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'collect_leads_failed' });
    expect(fixture.external).not.toHaveBeenCalled();
    expect(fixture.mutation).not.toHaveBeenCalled();
  });
  it('rejects missing authorization before any read', async () => {
    const fixture = await handlerFixture();
    expect((await fixture.handler(new Request('https://test.invalid', { method: 'POST' }))).status).toBe(401);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});
import { describe, it, expect, vi } from 'vitest';
import { collectAllLeads, sendUsers, type HashPair } from '../../supabase/functions/crm-meta-audience-sync/sync-users';

describe('Meta audience delivery', () => {
  it('defaults to dry run and makes no external call', async () => {
    const fetcher = vi.fn(() => { throw new Error('egress forbidden'); });
    const result = await sendUsers({ data: [['email', 'phone']], replace: true, audienceId: 'test', accessToken: '', fetcher });
    expect(result.processed).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('replacement removes withdrawn members and finalizes only the complete session', async () => {
    let members = new Set(['old', 'withdrawn']);
    const staged: string[] = [];
    const sessions: any[] = [];
    const fetcher = vi.fn(async (url, request) => {
      expect(String(url)).toMatch(/\/usersreplace$/);
      const params = request?.body as URLSearchParams;
      const payload = JSON.parse(params.get('payload') ?? '{}');
      const session = JSON.parse(params.get('session') ?? '{}');
      sessions.push(session);
      staged.push(...payload.data.map((row: HashPair) => row[0]));
      if (session.last_batch_flag) members = new Set(staged);
      return new Response(JSON.stringify({ num_received: payload.data.length }));
    }) as typeof fetch;
    const result = await sendUsers({ data: [['new1',''],['new2',''],['new3','']], replace: true, dryRun: false, audienceId: 'test', accessToken: '', fetcher, batchSize: 2, sessionId: 123 });
    expect(result.errors).toEqual([]);
    expect([...members]).toEqual(['new1','new2','new3']);
    expect(sessions).toEqual([
      { session_id: 123, batch_seq: 1, last_batch_flag: false, estimated_num_total: 3 },
      { session_id: 123, batch_seq: 2, last_batch_flag: true, estimated_num_total: 3 },
    ]);
  });
  it('addition keeps old users and does not send a replacement session', async () => {
    const fetcher = vi.fn(async (url, request) => {
      expect(String(url)).toMatch(/\/users$/);
      expect((request?.body as URLSearchParams).has('session')).toBe(false);
      return new Response(JSON.stringify({ num_received: 1 }));
    }) as typeof fetch;
    expect((await sendUsers({ data: [['new','']], replace: false, dryRun: false, audienceId: 'test', accessToken: '', fetcher })).processed).toBe(1);
  });
  it('stops replacement on a failed batch without finalizing or retrying', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'rejected' } }), { status: 400 })) as typeof fetch;
    const result = await sendUsers({ data: [['one',''],['two','']], replace: true, dryRun: false, audienceId: 'test', accessToken: '', fetcher, batchSize: 1 });
    expect(result.errors).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('collects all RPC pages including over 1000 rows and fails closed on page errors', async () => {
    const data = Array.from({ length: 2301 }, (_, i) => ({ email: `${i}@test.invalid`, phone: null }));
    const query = vi.fn(async (from, to) => ({ data: data.slice(from, to + 1), error: null }));
    expect(await collectAllLeads(query)).toHaveLength(2301);
    expect(query).toHaveBeenCalledTimes(3);
    await expect(collectAllLeads(async () => ({ data: null, error: { message: 'denied' } }))).rejects.toThrow('denied');
  });
});
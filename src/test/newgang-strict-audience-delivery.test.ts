import { describe, it, expect, vi } from 'vitest';
import { sendUsers } from '../../supabase/functions/crm-meta-audience-sync/sync-users';

describe('Newgang strict audience delivery', () => {
  it('sends only email hash with no phone field', async () => {
    const hash = 'a'.repeat(64);
    const fetcher = vi.fn(async (_url, req) => {
      const payload = JSON.parse((req?.body as URLSearchParams).get('payload') ?? '{}');
      expect(payload).toEqual({ schema: ['EMAIL_SHA256'], data: [[hash]] });
      return new Response(JSON.stringify({ num_received: 1 }));
    }) as typeof fetch;
    const result = await sendUsers({ data: [[hash, 'phone-sentinel']], emailOnly: true, replace: true, dryRun: false, audienceId: 'fixture', accessToken: '', fetcher });
    expect(result.processed).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('never records external error messages or echoed private values', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'PRIVATE_EMAIL_OR_TOKEN' }, echoed: 'PRIVATE_EMAIL_OR_TOKEN', num_received: 0 }), { status: 400 })) as typeof fetch;
    const result = await sendUsers({ data: [['a'.repeat(64), '']], emailOnly: true, replace: true, dryRun: false, audienceId: 'fixture', accessToken: '', fetcher });
    expect(result.errors).toEqual(['batch 1: meta_delivery_failed']);
    expect(result.lastResp).toEqual({ num_received: 0 });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_EMAIL_OR_TOKEN');
  });
  it('default dry run never sends strict audience', async () => {
    const fetcher = vi.fn(() => { throw new Error('egress forbidden'); });
    await sendUsers({ data: [['a'.repeat(64), '']], emailOnly: true, replace: true, audienceId: 'fixture', accessToken: '', fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('empty replacement explicitly removes all withdrawn entries', async () => {
    const fetcher = vi.fn(async (_url, req) => {
      const p = req?.body as URLSearchParams;
      expect(JSON.parse(p.get('payload') ?? '{}')).toEqual({schema:['EMAIL_SHA256'],data:[]});
      expect(JSON.parse(p.get('session') ?? '{}').last_batch_flag).toBe(true);
      return new Response(JSON.stringify({num_received:0}));
    }) as typeof fetch;
    await sendUsers({data:[],emailOnly:true,replace:true,dryRun:false,audienceId:'fixture',accessToken:'',fetcher});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
import { readFileSync } from 'node:fs';
const source = readFileSync('docs/testes/smart-link-choice-ios/index.candidate.ts', 'utf8').replace(/^import .*;$/gm, '');
const eventId = '00000000-0000-4000-8000-000000000004';
const arrivalId = '00000000-0000-4000-8000-000000000002';
const claimedId = '00000000-0000-4000-8000-000000000005';
const deliveries: { url: string; body: any }[] = [];
const updates: any[] = [];
const claims: any[] = [];
let duplicate = false;
let handler: (req: Request) => Promise<Response>;
const assert = (ok: boolean, message: string) => { if (!ok) throw Error(message); };
const admin = {
  from(table: string) {
    if (table === 'song_links') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
      id: '00000000-0000-4000-8000-000000000001', active: true, meta_pixel_id: 'local-meta', tiktok_pixel_id: 'local-tiktok'
    }, error: null }) }) }) };
    if (table === 'song_link_events') return { update: (patch: any) => ({ eq: async (key: string, id: string) => {
      assert(key === 'id' && id === claimedId, 'update must target claimed choice'); updates.push(patch); return { error: null };
    } }) };
    throw Error('unexpected table/direct insert: ' + table);
  },
  async rpc(name: string, args: any) { claims.push({ name, args }); return { data: duplicate ? null : claimedId, error: null }; }
};
const fakeFetch = async (url: string, init: RequestInit) => {
  assert(url.startsWith('https://graph.facebook.com/') || url.startsWith('https://business-api.tiktok.com/'), 'unexpected transport');
  deliveries.push({ url, body: JSON.parse(String(init.body)) });
  return new Response(JSON.stringify(url.includes('graph.facebook.com') ? { events_received: 1 } : { code: 0 }), { status: 200 });
};
new Function('Deno', 'createClient', 'lookupIpGeo', 'validSsrKey', 'prefetchDetail', 'ssrClientIp', 'ssrClientGeo', 'fetch',
  new Bun.Transpiler({ loader: 'ts' }).transformSync(source))(
  { serve: (fn: any) => { handler = fn; }, env: { get: (key: string) => ({
    SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'local-only', SONG_LINK_IP_SALT: 'local-only',
    META_CAPI_TOKEN: 'local-only', TIKTOK_EVENTS_ACCESS_TOKEN: 'local-only'
  } as Record<string, string>)[key] } }, () => admin, () => { throw Error('egress forbidden'); }, () => false,
  () => null, () => null, () => null, fakeFetch
);
const body = { slug: 'rs-meta', event: 'choice', arrival_event_id: arrivalId, event_id: eventId,
  destination: 'spotify', opened: 'web', meta_test_event_code: 'LOCALMETA', tiktok_test_event_code: 'LOCALTT' };
async function post() {
  return handler(new Request('http://localhost/choice', { method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': 'iPhone Instagram' }, body: JSON.stringify(body) }));
}
const response = await post();
assert(response.status === 200 && (await response.json()).ok === true, 'choice accepted');
assert(claims.length === 1 && claims[0].name === 'song_link_choice_claim', 'linked claim used');
assert(claims[0].args.p_payload.arrival_event_id === arrivalId && claims[0].args.p_payload.event_id === eventId, 'both IDs preserved');
assert(deliveries.length === 2, 'one delivery per provider');
const meta = deliveries.find(d => d.url.includes('graph.facebook.com'))?.body;
const tt = deliveries.find(d => d.url.includes('business-api.tiktok.com'))?.body;
assert(meta?.data[0].event_name === 'ListenClick' && meta.data[0].event_id === eventId, 'Meta ListenClick + browser ID');
assert(tt?.data[0].event === 'ClickButton' && tt.data[0].event_id === eventId, 'TikTok ClickButton + browser ID');
assert(meta?.test_event_code === 'LOCALMETA' && tt?.test_event_code === 'LOCALTT', 'test codes forwarded');
assert(updates.some(p => p.capi_status === 'enviado' && p.tiktok_status === 'enviado'), 'both sent statuses persisted');
console.log('PASS local simulated choice: linked IDs, ListenClick/ClickButton, test codes, both enviado; zero real egress');
duplicate = true;
const repeated = await post();
assert(repeated.status === 200 && (await repeated.json()).duplicate === true, 'duplicate accepted without delivery');
assert(deliveries.length === 2 && updates.length === 1, 'no duplicate delivery or status write');
console.log('PASS local duplicate: zero further provider calls; not a real Meta/TikTok proof');
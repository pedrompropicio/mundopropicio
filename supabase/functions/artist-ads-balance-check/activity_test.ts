import { assertEquals } from 'jsr:@std/assert@1';
import { campaignActive, timestampDay } from '../_shared/campaign-activity.ts';
const now = new Date('2026-10-21T11:50:00Z');
for (const [name, end] of [['NE', '2026-10-11'], ['Sertanejo', '2026-10-15'], ['PT teste', '2026-10-19']]) {
  Deno.test(`Google ${name} ENABLED expired`, () => assertEquals(campaignActive('ENABLED', '2026-10-05', end, 'America/Recife', now), false));
}
for (const status of ['ACTIVE', 'ENABLE', 'ENABLED']) {
  Deno.test(`${status} inclusive boundaries`, () => assertEquals(campaignActive(status, '2026-10-21', '2026-10-21', 'America/Recife', now), true));
  Deno.test(`${status} future start`, () => assertEquals(campaignActive(status, '2026-10-22', null, 'America/Recife', now), false));
}
Deno.test('paused and unknown start fail closed', () => {
  assertEquals(campaignActive('PAUSED', '2026-10-05', null, 'America/Recife', now), false);
  assertEquals(campaignActive('ACTIVE', null, null, 'America/Recife', now), false);
});
Deno.test('account day not UTC day', () => {
  const midnight = new Date('2026-10-22T01:00:00Z');
  assertEquals(campaignActive('ACTIVE', '2026-10-05', '2026-10-21', 'America/Recife', midnight), true);
  assertEquals(campaignActive('ACTIVE', '2026-10-05', '2026-10-21', 'Europe/Lisbon', midnight), false);
});
Deno.test('Meta offset and TikTok UTC schedule converted locally', () => {
  assertEquals(timestampDay('2026-10-22T01:00:00+0000', 'America/Recife'), '2026-10-21');
  assertEquals(timestampDay('2026-10-22 01:00:00', 'America/Recife', true), '2026-10-21');
});
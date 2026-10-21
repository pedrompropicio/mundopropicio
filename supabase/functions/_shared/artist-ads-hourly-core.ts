export type Level = 'campaign' | 'adset';
export function counter(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid_counter');
  return n;
}
export function integer(value: unknown): number | null {
  const n = counter(value);
  return n === null ? null : Math.round(n);
}
export function cents(value: unknown): number | null {
  const n = counter(value);
  return n === null ? null : Math.round(n * 100);
}
export function accountDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+delta);
  return d.toISOString().slice(0,10);
}
export function daysForRun(now: Date, tz: string, mode: 'today'|'scheduled'|'backfill', count = 14): string[] {
  const today = accountDay(now,tz);
  const noon = mode === 'scheduled' && now.getUTCHours() === 15;
  const n = mode === 'backfill' ? count : noon ? 2 : 1;
  return Array.from({length:n},(_,i) => addDay(today,-i));
}
export function deviceOs(value: string): string {
  if (/android/i.test(value)) return 'Android';
  if (/iphone|ipad|ipod|ios/i.test(value)) return 'iOS';
  return 'other';
}
export async function paginate<T>(first: string, fetchPage: (cursor: string) => Promise<{rows:T[];next?:string}>) {
  const rows: T[] = []; const seen = new Set<string>(); let cursor: string | undefined = first;
  while (cursor) {
    if (seen.has(cursor)) throw new Error('pagination_cycle');
    seen.add(cursor);
    const page = await fetchPage(cursor); rows.push(...page.rows); cursor=page.next;
  }
  return rows;
}
/** Campaign scope: tiktok requires membership in the carreira set (fail-closed); every platform drops event-linked campaigns. */
export type CampaignScope = {platform:string;carreira?:Set<string>;eventLinked:Set<string>};
export function isArtistCampaign(scope: CampaignScope, campaignId: string): boolean {
  if (!campaignId || scope.eventLinked.has(campaignId)) return false;
  if (scope.platform === 'tiktok') return !!scope.carreira?.has(campaignId);
  return true;
}
export function scopeRows<T extends {external_campaign_id?: unknown}>(scope: CampaignScope, rows: T[]) {
  const kept: T[] = []; const skipped = new Set<string>();
  for (const r of rows) { const id = String(r.external_campaign_id ?? ''); if (isArtistCampaign(scope,id)) kept.push(r); else skipped.add(id); }
  return {kept, skipped:[...skipped]};
}

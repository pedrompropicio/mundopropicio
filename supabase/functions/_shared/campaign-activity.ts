/** Inclusive civil dates in the advertiser's timezone. Unknown starts fail closed. */
export function campaignActive(status: string, start: string | null, end: string | null, timezone: string, now = new Date()): boolean {
  const today = localDay(now, timezone);
  return ['ACTIVE', 'ENABLED', 'ENABLE'].includes(status.toUpperCase()) && start !== null && start <= today && (end === null || end >= today);
}
export function localDay(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function timestampDay(value: string | null, timezone: string, utc = false): string | null {
  if (!value) return null;
  const date = new Date(utc ? value.replace(' ', 'T') + 'Z' : value);
  return Number.isFinite(date.getTime()) ? localDay(date, timezone) : null;
}
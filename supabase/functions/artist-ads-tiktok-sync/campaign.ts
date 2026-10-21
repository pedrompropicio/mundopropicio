export const CAMPAIGN_REPORT = { report_type: "BASIC", data_level: "AUCTION_CAMPAIGN", dimensions: JSON.stringify(["campaign_id", "stat_time_day"]) };
const number = (v: unknown) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const integer = (v: unknown) => { const n = number(v); return n === null ? null : Math.round(n); };
export function campaignDay(r: any, company: string, connection: string, currency: string, now: string) {
  const m = r.metrics ?? {}; const id = String(r.dimensions?.campaign_id ?? "");
  const date = String(r.dimensions?.stat_time_day ?? "").slice(0, 10);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("relatório campanha: dimensão inválida");
  const spend = number(m.spend);
  return { company_id: company, connection_id: connection, level: "campaign", external_id: id, external_campaign_id: id,
    date_start: date, spend_cents: spend === null ? null : Math.round(spend * 100), impressions: integer(m.impressions),
    clicks: integer(m.clicks), video_views_6s: integer(m.video_watched_6s), video_views_2s: integer(m.video_watched_2s),
    likes: integer(m.likes), follows: integer(m.follows), reach: integer(m.reach), currency, source: "api", recorded_at: now,
    raw: { ...m, origem: "api", data_level: "AUCTION_CAMPAIGN" } };
}
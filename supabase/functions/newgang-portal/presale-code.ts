// #405 E2b — leitura isolada; dependências injectadas, sem cliente, logs ou escrita de membros.
export const PRESALE_CODE_UNTIL = "2026-11-10T23:59:59Z";

type Site = { id: string; company_id: string };
type Member = { site_id: string; company_id: string; erased_at: string | null; email: string | null };
export type PresaleRateArgs = { p_bucket: string; p_max: 20 | 120; p_window_seconds: 600 };
export type PresaleCodeDeps = {
  now: () => number;
  sha256: (value: string) => Promise<string>;
  rateHit: (args: PresaleRateArgs) => PromiseLike<{ data: unknown; error: unknown }>;
  getSite: () => Promise<Site | null>;
  memberFromToken: (siteId: string, token: string) => Promise<Member | null>;
  readCode: (email: string) => Promise<string | null>;
  readExclusion: (email: string) => Promise<boolean>;
};
type Result = {
  status: 200 | 400 | 401 | 404 | 429 | 500 | 503;
  body: { ok: true; status: "eligible"; code: string } | { ok: true; status: "not_eligible" }
    | { error: "invalid" | "no_session" | "action" | "rate_limited" | "internal" | "rate_unavailable" };
};

export async function presaleCodeAction(raw: unknown, ip: string, deps: PresaleCodeDeps): Promise<Result> {
  try {
    // Antes da validação, dos baldes e de qualquer leitura (incluindo o site/sessão).
    if (deps.now() >= Date.parse(PRESALE_CODE_UNTIL)) return { status: 404, body: { error: "action" } };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || Object.keys(raw).some((k) => k !== "action" && k !== "token")) {
      return { status: 400, body: { error: "invalid" } };
    }
    const body = raw as { action?: unknown; token?: unknown };
    if (body.action !== "presale_code") return { status: 400, body: { error: "invalid" } };
    const token = body.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 200) {
      return { status: 401, body: { error: "no_session" } };
    }

    const buckets: PresaleRateArgs[] = [
      { p_bucket: `ng:presale_code:${await deps.sha256(ip + ":ng")}`, p_max: 120, p_window_seconds: 600 },
      { p_bucket: `ng:presale_code:session:${await deps.sha256(token)}`, p_max: 20, p_window_seconds: 600 },
    ];
    for (const args of buckets) {
      try {
        const { data, error } = await deps.rateHit(args);
        if (error || typeof data !== "boolean") return { status: 503, body: { error: "rate_unavailable" } };
        if (!data) return { status: 429, body: { error: "rate_limited" } };
      } catch {
        return { status: 503, body: { error: "rate_unavailable" } };
      }
    }

    const site = await deps.getSite();
    if (!site) return { status: 500, body: { error: "internal" } };
    const member = await deps.memberFromToken(site.id, token);
    if (!member || member.erased_at != null || member.site_id !== site.id || member.company_id !== site.company_id) {
      return { status: 401, body: { error: "no_session" } };
    }
    // btrim(text) do PostgreSQL remove apenas espaços U+0020 por omissão.
    const email = member.email?.replace(/^ +| +$/g, "").toLowerCase();
    if (!email) return { status: 200, body: { ok: true, status: "not_eligible" } };
    const [code, excluded] = await Promise.all([deps.readCode(email), deps.readExclusion(email)]);
    if (code === null || excluded) return { status: 200, body: { ok: true, status: "not_eligible" } };
    return { status: 200, body: { ok: true, status: "eligible", code } };
  } catch {
    return { status: 500, body: { error: "internal" } };
  }
}

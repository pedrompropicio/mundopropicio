// AJ19/AJ14: validações e decisões puras do app_open, dos slots de entrega e da
// deduplicação do ViewContent. Sem credenciais nem acesso à rede — partilhado
// entre o handler (index.ts) e os testes herméticos (src/test/song-link-app-open.test.ts).

export const APP_OPEN_MAX_ELAPSED_MS = 6000;
export const APP_OPEN_ARRIVAL_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 h
export const VIEWCONTENT_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 min

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

// ID canónico partilhado: ListenClick Meta (choice ou app_open) e
// CompleteRegistration TikTok (app_open) usam sempre arrival_event_id + ':open'.
export function canonicalOpenId(arrivalEventId: string): string {
  return `${arrivalEventId}:open`;
}

// Missing or cross-link arrivals never contribute advertising click IDs.
export type ArrivalClickRow = {
  link_id: string;
  event: string;
  created_at: string;
  fbclid: string | null;
  ttclid: string | null;
};
export function arrivalClickSignals(arrival: ArrivalClickRow | null, linkId: string) {
  if (!arrival || arrival.link_id !== linkId || arrival.event !== "arrival") {
    return { fbclid: null, ttclid: null, fbc: null };
  }
  const fbclid = arrival.fbclid?.trim() || null;
  const ttclid = arrival.ttclid?.trim() || null;
  const timestamp = Date.parse(arrival.created_at);
  return { fbclid, ttclid,
    fbc: fbclid && Number.isFinite(timestamp) ? `fb.1.${timestamp}.${fbclid}` : null };
}

export type AppOpenParsed = {
  arrival_event_id: string;
  destination: string;
  elapsed_ms: number | null;
  event_id: string;
};

// Valida o corpo do app_open (secção 2.1 da proposta): arrival_event_id UUID
// obrigatório, destination obrigatório, opened='app', elapsed_ms 0–6000 e
// event_id, quando presente, igual ao ID canónico.
export function parseAppOpenBody(body: Record<string, unknown>):
  { ok: true; value: AppOpenParsed } | { ok: false; error: string } {
  const arrival = body.arrival_event_id;
  if (!isUuid(arrival)) return { ok: false, error: "arrival_invalido" };
  const dest = typeof body.destination === "string" && body.destination.trim()
    ? body.destination.trim().slice(0, 60)
    : null;
  if (!dest) return { ok: false, error: "destino_invalido" };
  if (body.opened !== "app") return { ok: false, error: "opened_invalido" };
  let elapsed: number | null = null;
  if (body.elapsed_ms !== undefined && body.elapsed_ms !== null) {
    const n = Number(body.elapsed_ms);
    if (!Number.isFinite(n) || n < 0 || n > APP_OPEN_MAX_ELAPSED_MS) {
      return { ok: false, error: "elapsed_invalido" };
    }
    elapsed = Math.round(n);
  }
  const canonical = canonicalOpenId(arrival.trim().toLowerCase());
  const eid = typeof body.event_id === "string" ? body.event_id.trim() : "";
  if (eid && eid !== canonical) return { ok: false, error: "event_id_invalido" };
  return {
    ok: true,
    value: {
      arrival_event_id: arrival.trim().toLowerCase(),
      destination: dest,
      elapsed_ms: elapsed,
      event_id: canonical,
    },
  };
}

// O destino tem de estar configurado no link (song_links.destinations é um
// objeto jsonb por destino, ex.: { "spotify": { "app": ..., "web": ... } }).
export function destinationConfigured(destinations: unknown, destination: string): boolean {
  if (!destinations || typeof destinations !== "object" || Array.isArray(destinations)) return false;
  const d = (destinations as Record<string, unknown>)[destination];
  return !!d && typeof d === "object" && d !== null;
}

export type ArrivalRow = { origin: string | null; created_at: string } | null;

// A chegada tem de ser SSR real, não futura e com menos de 2 h.
export function validateArrivalForAppOpen(arrival: ArrivalRow, now: number):
  { ok: true } | { ok: false; error: string } {
  if (!arrival) return { ok: false, error: "chegada_invalida" };
  if (arrival.origin !== "ssr") return { ok: false, error: "chegada_invalida" };
  const t = Date.parse(arrival.created_at);
  if (!Number.isFinite(t) || t > now) return { ok: false, error: "chegada_invalida" };
  if (now - t > APP_OPEN_ARRIVAL_MAX_AGE_MS) return { ok: false, error: "chegada_expirada" };
  return { ok: true };
}

// Deduplicação do ViewContent (secção 3): há duplicado se existir outra chegada
// do mesmo link com a mesma chave (fbclid/ttclid) nos últimos 30 min (lag).
export function isDuplicateArrival(previousCreatedAt: string | null, now: number): boolean {
  if (!previousCreatedAt) return false;
  const t = Date.parse(previousCreatedAt);
  return Number.isFinite(t) && t <= now && now - t <= VIEWCONTENT_DEDUP_WINDOW_MS;
}

export function testDeliveryPolicy(mode: string | null, arrivalMode: string | null, metaTest: string | null, ttTest: string | null) {
  const marked = mode === "teste_aj19" || arrivalMode === "teste_aj19";
  return { mode: marked ? "teste_aj19" : mode, suppressMeta: marked && !metaTest,
    suppressTikTok: (marked || !!metaTest) && !ttTest };
}

export function metaReceipt(raw: string) {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { events_received: null, fbtrace_id: null }; }
  const obj = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    events_received: typeof obj.events_received === "number" && Number.isInteger(obj.events_received) && obj.events_received >= 0 ? obj.events_received : null,
    fbtrace_id: typeof obj.fbtrace_id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(obj.fbtrace_id) ? obj.fbtrace_id : null,
  };
}

/** Allowlisted TikTok Events API receipt: code, message, request_id only; never codes/tokens. */
export function tiktokReceipt(value: unknown, testCode: string | null = null) {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const code = typeof obj.code === "number" && Number.isInteger(obj.code) ? obj.code : null;
  let message = typeof obj.message === "string" && /^[\p{L}\p{N} .,:;_()'\/-]{0,200}$/u.test(obj.message) ? obj.message : null;
  if (message && testCode && message.includes(testCode)) message = null;
  const request_id = typeof obj.request_id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(obj.request_id) ? obj.request_id : null;
  return { code, message, request_id };
}

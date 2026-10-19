// song-link-event — regista chegadas e escolhas das páginas públicas de smart
// link do Portal (www.mundopropicio.com/m/<slug> e /m/<slug>/escolher) e envia
// o evento à API de Conversões da Meta (D-ERP141).
//
// verify_jwt = false (config.toml): chamada pelo browser do visitante.
// CORS só https://www.mundopropicio.com e https://mundopropicio.com.
// Privacidade: o IP nunca é guardado em claro — só sha256(sal + IP), e só se
// existir o secret SONG_LINK_IP_SALT. O IP vai à Meta na CAPI (normal), não fica.
// A resposta é imediata; gravação + CAPI correm em segundo plano. A CAPI nunca
// faz falhar o pedido.
// Adenda D-ERP141 (24/09/2026): também TikTok Events API 2.0 (POST
// business-api.tiktok.com/open_api/v1.3/event/track/, header Access-Token,
// event_source 'web', event_source_id = pixel) com o mesmo event_id do browser.
// Códigos de teste meta_test_event_code / tiktok_test_event_code (só provas;
// passados às APIs, nunca gravados).

import { createClient } from "npm:@supabase/supabase-js@2";
import { lookupIpGeo, type Geo } from "../_shared/geo.ts";
import { validSsrKey, prefetchDetail, ssrClientIp, ssrClientGeo } from "./ssr.ts";
import {
  canonicalOpenId, destinationConfigured, isDuplicateArrival, isUuid,
  parseAppOpenBody, validateArrivalForAppOpen, VIEWCONTENT_DEDUP_WINDOW_MS,
  type AppOpenParsed,
} from "./app-open.ts";

const ALLOWED_ORIGINS = new Set<string>([
  "https://www.mundopropicio.com",
  "https://mundopropicio.com",
]);
const GRAPH_VERSION = "v18.0";
const TIKTOK_EVENTS_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
const TEST_CODE_RE = /^[A-Za-z0-9]{3,40}$/;
const RATE_LIMIT = 60; // eventos por ip_hash por minuto
const RATE_WINDOW_MS = 60_000;

function cors(origin: string | null): Record<string, string> {
  const ok = !!origin && ALLOWED_ORIGINS.has(origin);
  return {
    "Access-Control-Allow-Origin": ok && origin ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function extractIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-real-ip")?.trim() || null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Secrets: Deno.env primeiro; senão Vault via get_vault_secret (padrão capi-meta-events/geo-lookup).
const secretCache = new Map<string, string | null>();
async function getSecret(name: string): Promise<string | null> {
  if (secretCache.has(name)) return secretCache.get(name) ?? null;
  const env = Deno.env.get(name);
  if (env) { secretCache.set(name, env); return env; }
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  let val: string | null = null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/get_vault_secret`, {
      method: "POST",
      headers: { apikey: srk, Authorization: `Bearer ${srk}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _name: name }),
    });
    if (r.ok) {
      const raw = await r.text();
      let p: any = raw;
      try { p = JSON.parse(raw); } catch { /* texto */ }
      if (Array.isArray(p) && p.length > 0 && p[0]) val = String(p[0]);
      else if (typeof p === "string" && p) val = p;
      else if (p && typeof p === "object" && p.get_vault_secret) val = String(p.get_vault_secret);
    }
  } catch { /* sem secret */ }
  secretCache.set(name, val);
  return val;
}

// D-ERP234 adenda 4: geo das chegadas sem depender do ipinfo pedido a pedido.
// Ordem: cabeçalhos/client_geo → cache por ip_hash 24 h (public.ip_geo_cache, chave "h:<ip_hash>",
// nunca o IP) → ipinfo (com limite em _shared/geo.ts). Corre em background; nunca bloqueia a gravação.
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const geoCache = new Map<string, { at: number; geo: Geo }>();
const IPINFO_PER_MIN = 20;
let ipinfoCalls: number[] = [];
// deno-lint-ignore no-explicit-any
async function hashGeoGet(admin: any, ipHash: string): Promise<Geo | null> {
  const { data } = await admin.from("ip_geo_cache").select("country, region, city, resolved_at")
    .eq("ip", `h:${ipHash}`).maybeSingle();
  if (!data?.country || Date.now() - Date.parse(data.resolved_at) >= GEO_TTL_MS) return null;
  return { country: data.country, region: data.region, city: data.city };
}
// deno-lint-ignore no-explicit-any
async function hashGeoPut(admin: any, ipHash: string | null, g: Geo) {
  // Adenda 5: só grava na cache geo completa (com cidade) — país sozinho apagaria a cidade já guardada.
  if (!ipHash || !g.country || !g.city) return;
  geoCache.set(ipHash, { at: Date.now(), geo: g });
  await admin.from("ip_geo_cache").upsert({ ip: `h:${ipHash}`, country: g.country, region: g.region, city: g.city,
    resolved_at: new Date().toISOString() }, { onConflict: "ip" });
}
// Adenda 5: 5 dos 20 pedidos/min ficam reservados às chegadas blitz_.
const IPINFO_RESERVED_BLITZ = 5;
// deno-lint-ignore no-explicit-any
async function geoFor(admin: any, ipHash: string | null, ip: string, blitz = false): Promise<{ geo: Geo; src: string }> {
  const now = Date.now();
  const NUL: Geo = { country: null, region: null, city: null };
  if (ipHash) {
    const hit = geoCache.get(ipHash);
    if (hit && now - hit.at < GEO_TTL_MS) return { geo: hit.geo, src: "cache" };
    const db = await hashGeoGet(admin, ipHash).catch(() => null);
    if (db) { geoCache.set(ipHash, { at: now, geo: db }); return { geo: db, src: "cache" }; }
  }
  if (!ip) return { geo: NUL, src: "none" };
  // D-ERP263: base local DB-IP Lite City (só BR/PT) antes do ipinfo. O IP só vai como parâmetro; nunca se grava.
  try {
    const { data } = await admin.rpc("ip_city_lookup", { ip });
    const r = Array.isArray(data) ? data[0] : data;
    if (r?.country && r?.city) {
      const g: Geo = { country: r.country, region: r.region ?? null, city: r.city };
      await hashGeoPut(admin, ipHash, g).catch(() => {});
      return { geo: g, src: "dbip" };
    }
  } catch { /* segue para o ipinfo */ }
  ipinfoCalls = ipinfoCalls.filter((t) => now - t < 60_000);
  const cap = blitz ? IPINFO_PER_MIN : IPINFO_PER_MIN - IPINFO_RESERVED_BLITZ;
  if (ipinfoCalls.length >= cap) return { geo: NUL, src: "quota" };
  ipinfoCalls.push(now);
  const geo = await lookupIpGeo(ip, { timeoutMs: 3000, tag: "song-link-event" });
  if (geo.country) await hashGeoPut(admin, ipHash, geo).catch(() => {});
  if (geoCache.size > 20000) {
    for (const [k, v] of geoCache) if (now - v.at >= GEO_TTL_MS) geoCache.delete(k);
  }
  return { geo, src: geo.country ? "ipinfo" : "none" };
}

// Limite em memória da instância.
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return arr.length > RATE_LIMIT;
}

function parseUA(ua: string) {
  const u = ua || "";
  let in_app_browser: string | null = u ? null : "other";
  // Adenda D-ERP141 (09/10/2026): navegador interno da Meta = IABMV/FB4A/FBAN/FBAV/FB_IAB/FBIOS
  // ou "Instagram"; com "Instagram" fica 'instagram', senão 'facebook'.
  const isMeta = /IABMV|FB4A|FBAN|FBAV|FB_IAB|FBIOS|Instagram/i.test(u);
  if (isMeta) in_app_browser = /Instagram/i.test(u) ? "instagram" : "facebook";
  else if (/musical_ly|BytedanceWebview|TikTok|trill/i.test(u)) in_app_browser = "tiktok";
  let os: string | null = null;
  if (/iPhone|iPad|iPod/i.test(u)) os = "ios";
  else if (/Android/i.test(u)) os = "android";
  else if (/Windows/i.test(u)) os = "windows";
  else if (/Mac OS X|Macintosh/i.test(u)) os = "macos";
  else if (/Linux/i.test(u)) os = "linux";
  let device: string | null = null;
  if (/iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u))) device = "tablet";
  else if (/Mobi|iPhone|Android/i.test(u)) device = "mobile";
  else if (u) device = "desktop";
  return { device, os, in_app_browser };
}

const s = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// AJ19: reserva atómica do slot de entrega (INSERT ... ON CONFLICT DO NOTHING
// RETURNING via upsert ignoreDuplicates). Quem não ganha o slot não entrega.
// deno-lint-ignore no-explicit-any
async function reserveSlot(admin: any, arrivalId: string, provider: string, eventName: string, rowId: string): Promise<boolean> {
  const { data, error } = await admin.from("song_link_delivery_slots")
    .upsert({ arrival_event_id: arrivalId, provider, event_name: eventName, reserved_by: rowId },
      { onConflict: "arrival_event_id,provider,event_name", ignoreDuplicates: true })
    .select("arrival_event_id");
  if (error) {
    console.warn("[song-link-event] slot falhou", error.message);
    return false; // falha fechada: sem prova de slot, não entrega
  }
  return Array.isArray(data) && data.length > 0;
}
// Resultado da entrega no mesmo slot; nunca gera um ID novo.
// deno-lint-ignore no-explicit-any
async function finishSlot(admin: any, arrivalId: string, provider: string, eventName: string, status: "delivered" | "failed" | "unknown") {
  const { error } = await admin.from("song_link_delivery_slots")
    .update({ status, delivered_at: status === "delivered" ? new Date().toISOString() : null })
    .eq("arrival_event_id", arrivalId).eq("provider", provider).eq("event_name", eventName);
  if (error) console.warn("[song-link-event] slot update falhou", error.message);
}
// AJ19 dedup ViewContent: outra chegada do mesmo link com a mesma chave nos
// últimos 30 min (lag). Falha na consulta não bloqueia o envio.
// deno-lint-ignore no-explicit-any
async function recentDuplicate(admin: any, linkId: string, col: "fbclid" | "ttclid", val: string, excludeId: string): Promise<boolean> {
  const since = new Date(Date.now() - VIEWCONTENT_DEDUP_WINDOW_MS).toISOString();
  const { data, error } = await admin.from("song_link_events").select("created_at")
    .eq("link_id", linkId).eq("event", "arrival").eq(col, val)
    .gte("created_at", since).neq("id", excludeId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.warn("[song-link-event] dedup falhou", error.message);
    return false;
  }
  return isDuplicateArrival(data?.created_at ?? null, Date.now());
}

// D-ERP234 adenda 3: uma linha estruturada por pedido (slug, ssr/browser, resultado,
// família de UA) para contar perdas; sem IP nem tokens.
function uaFamily(ua: string): string {
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua)) return "facebook";
  if (/musical_ly|BytedanceWebview|TikTok|trill/i.test(ua)) return "tiktok";
  return ua ? "outro" : "vazio";
}

Deno.serve(async (req: Request): Promise<Response> => {
  const ctx = { slug: null as string | null, ua: req.headers.get("user-agent") ?? "" };
  const isSsrReq = req.headers.get("x-song-link-ssr-key") !== null;
  const res = await handle(req, ctx);
  if (req.method === "POST") {
    let outcome = String(res.status);
    try {
      const j = await res.clone().json();
      outcome = j?.error ? `${res.status}:${j.error}` : j?.prefetch ? "prefetch" : j?.enriched ? "enriched"
        : j?.recovered ? "recovered" : j?.duplicate ? "duplicate" : `${res.status}:novo`;
    } catch { /* sem corpo */ }
    console.log("[song-link-event] req " + JSON.stringify({ slug: ctx.slug, via: isSsrReq ? "ssr" : "browser",
      outcome, ua: uaFamily(ctx.ua), origin_hdr: req.headers.get("origin") ? "sim" : "nao" }));
  }
  return res;
});

async function handle(req: Request, ctx: { slug: string | null; ua: string }): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: "forbidden_origin" }, 403, origin);
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  const ssrHeader = req.headers.get("x-song-link-ssr-key");
  const isSsr = ssrHeader !== null;
  if (isSsr && !(await validSsrKey(ssrHeader, Deno.env.get("SONG_LINK_SSR_KEY")))) {
    return json({ ok: false, error: "unauthorized_ssr" }, 401, origin);
  }
  // Alguns navegadores internos enviam o beacon sem Origin; aceitar quando o Referer é do Portal.
  let refOrigin: string | null = null;
  try { refOrigin = new URL(req.headers.get("referer") ?? "").origin; } catch { /* sem referer */ }
  const browserOk = (!!origin && ALLOWED_ORIGINS.has(origin)) || (!origin && !!refOrigin && ALLOWED_ORIGINS.has(refOrigin));
  if (!isSsr && !browserOk) return json({ ok: false, error: "forbidden_origin" }, 403, origin);
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  let body: any;
  // sendBeacon envia text/plain com JSON (pedido simples, sem pré-verificação CORS):
  // ler sempre como texto e fazer JSON.parse, seja qual for o Content-Type.
  try { body = JSON.parse(await req.text()); } catch { return json({ ok: false, error: "invalid_json" }, 400, origin); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_body" }, 400, origin);
  if (body.ssr === true && !isSsr) return json({ ok: false, error: "unauthorized_ssr" }, 401, origin);
  if (isSsr && (body.ssr !== true || body.event !== "arrival" || !s(body.event_id, 120) ||
    typeof body.prefetch !== "boolean")) {
    return json({ ok: false, error: "invalid_ssr_body" }, 400, origin);
  }

  const slug = s(body?.slug, 120)?.toLowerCase() ?? null;
  const event = body?.event;
  ctx.slug = slug;
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return json({ ok: false, error: "slug_invalido" }, 400, origin);
  if (event !== "arrival" && event !== "choice" && event !== "app_open") return json({ ok: false, error: "event_invalido" }, 400, origin);
  const opened = body?.opened === "app" || body?.opened === "web" ? body.opened : null;

  const ssrIp = isSsr ? ssrClientIp(body.client_ip) : null;
  if (ssrIp?.reason) console.warn(`[song-link-event] SSR sem IP: ${ssrIp.reason}; chegada aceite sem hash nem geo`);
  const ip = isSsr ? ssrIp?.ip ?? null : extractIp(req);
  const ua = isSsr ? s(body.client_ua, 4000) ?? "" : req.headers.get("user-agent") ?? "";
  const salt = await getSecret("SONG_LINK_IP_SALT");
  const ipHash = ip && salt ? await sha256Hex(`${salt}:${ip}`) : null;
  // Chave do limite: ip_hash; sem sal, um hash local sem sal (só em memória, nunca gravado).
  const rlKey = ipHash ?? (ip ? await sha256Hex(`rl:${ip}`) : "sem-ip");
  // Authenticated SSR without visitor IP must not share a global "sem-ip" quota.
  if (!(isSsr && !ip) && rateLimited(rlKey)) return json({ ok: false, error: "rate_limited" }, 429, origin);

  const databaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!databaseUrl || !serviceKey) return json({ ok: false, error: "erro_interno" }, 500, origin);
  const admin = createClient(databaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: link, error: linkErr } = await admin
    .from("song_links")
    .select("id, company_id, artist_id, song_id, link_type, title, meta_pixel_id, tiktok_pixel_id, active, destinations")
    .eq("slug", slug)
    .maybeSingle();
  if (linkErr) return json({ ok: false, error: "erro_interno" }, 500, origin);
  if (!link || !link.active) return json({ ok: false, error: "link_inexistente" }, 404, origin);
  const contentId: string = link.song_id ?? link.id;

  const { device, os, in_app_browser } = parseUA(ua);
  const detail = prefetchDetail(body.prefetch === true, body.purpose, ua);
  if (detail !== null) {
    const { error } = await admin.from("song_link_diag").insert({ kind: "prefetch", slug: slug.slice(0, 80),
      arrival_event_id: s(body.event_id, 120), in_app: in_app_browser ?? "other", detail });
    if (error) return json({ ok: false, error: "erro_interno" }, 500, origin);
    return json({ ok: true, prefetch: true }, 200, origin);
  }
  const cg = isSsr ? ssrClientGeo(body.client_geo) : null;
  const hdrCountry = isSsr ? cg!.country : s(req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country") ?? req.headers.get("x-country"), 8);
  const hdrRegion = isSsr ? cg!.region : s(req.headers.get("cf-region") ?? req.headers.get("x-vercel-ip-country-region"), 80);
  const hdrCity = isSsr ? cg!.city : s(req.headers.get("cf-ipcity") ?? req.headers.get("x-vercel-ip-city"), 120);
  const eventId = s(body?.event_id, 120);
  const pageUrl = s(body?.page_url, 2000);
  const destination = s(body?.destination, 60);
  const metaTest = typeof body?.meta_test_event_code === "string" && TEST_CODE_RE.test(body.meta_test_event_code) ? body.meta_test_event_code : null;
  const ttTest = typeof body?.tiktok_test_event_code === "string" && TEST_CODE_RE.test(body.tiktok_test_event_code) ? body.tiktok_test_event_code : null;

  // AJ19/AJ14: app_open — validações da secção 2.1 da proposta (antes de gravar).
  let appOpen: AppOpenParsed | null = null;
  let arrivalEventId: string | null = null;
  if (event === "app_open") {
    const parsed = parseAppOpenBody(body);
    if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400, origin);
    if (!destinationConfigured(link.destinations, parsed.value.destination)) {
      return json({ ok: false, error: "destino_nao_configurado" }, 400, origin);
    }
    appOpen = parsed.value;
    arrivalEventId = parsed.value.arrival_event_id;
    const { data: arr, error: arrErr } = await admin.from("song_link_events")
      .select("id, origin, created_at")
      .eq("event_id", arrivalEventId).eq("event", "arrival").eq("link_id", link.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (arrErr) return json({ ok: false, error: "erro_interno" }, 500, origin);
    const va = validateArrivalForAppOpen(arr, Date.now());
    if (!va.ok) return json({ ok: false, error: va.error }, 403, origin);
  } else if (event === "choice" && isUuid(body?.arrival_event_id) && destination) {
    // Choice COM arrival_event_id (Portal novo): partilha o slot ListenClick Meta.
    // Choice SEM arrival_event_id (Portal atual): comportamento inalterado, sem slot.
    arrivalEventId = String(body.arrival_event_id).trim().toLowerCase();
  }

  // D-ERP234: atomic INSERT ON CONFLICT happens before any external delivery.
  // AJ19: app_open não usa a claim (a claim não mapeia arrival_event_id); o
  // índice único song_link_app_open_arrival_uidx garante no máximo 1 por chegada.
  let claimedId: string | null = null;
  if (appOpen) {
    const { data: ins, error: insErr } = await admin.from("song_link_events").insert({
      link_id: link.id, company_id: link.company_id, artist_id: link.artist_id, song_id: link.song_id,
      event: "app_open", mode: s(body.mode, 30), destination: appOpen.destination, opened: "app",
      event_id: appOpen.event_id, arrival_event_id: appOpen.arrival_event_id,
      utm_source: s(body.utm_source, 200), utm_medium: s(body.utm_medium, 200),
      utm_campaign: s(body.utm_campaign, 200), utm_content: s(body.utm_content, 200), utm_term: s(body.utm_term, 200),
      fbclid: s(body.fbclid, 500), ttclid: s(body.ttclid, 500),
      country: hdrCountry, region: hdrRegion, city: hdrCity, device, os, in_app_browser,
      ip_hash: ipHash, origin: "browser", capi_status: "pendente", tiktok_status: "pendente",
    }).select("id").maybeSingle();
    if (insErr) {
      if (insErr.code === "23505") {
        return json({ ok: true, duplicate: true, delivery: "app_open_ja_registado" }, 200, origin);
      }
      console.warn("[song-link-event] app_open insert falhou", insErr.message);
      return json({ ok: false, error: "erro_interno" }, 500, origin);
    }
    claimedId = ins?.id ?? null;
    if (!claimedId) return json({ ok: true, duplicate: true }, 200, origin);
  } else {
  const { data: claimed, error: claimError } = await admin.rpc("song_link_event_claim", { p_payload: {
    link_id: link.id, company_id: link.company_id, artist_id: link.artist_id, song_id: link.song_id,
    event, mode: s(body.mode, 30), destination, opened, event_id: eventId,
    utm_source: s(body.utm_source, 200), utm_medium: s(body.utm_medium, 200),
    utm_campaign: s(body.utm_campaign, 200), utm_content: s(body.utm_content, 200), utm_term: s(body.utm_term, 200),
    fbclid: s(body.fbclid, 500), ttclid: s(body.ttclid, 500),
    country: hdrCountry, region: hdrRegion, city: hdrCity, device, os, in_app_browser,
    ip_hash: ipHash, origin: isSsr ? "ssr" : "browser",
  }});
  if (claimError) {
    console.warn("[song-link-event] claim falhou", claimError.message);
    return json({ ok: false, error: "erro_interno" }, 500, origin);
  }
  claimedId = claimed ?? null;
  if (!claimedId) {
    // D-ERP234 adenda 2: browser após SSR enriquece a linha SSR (opened, destination,
    // in_app_browser, device, os, mode). Nunca mexe em event_id, origin, created_at,
    // ip_hash, geo nem utm. Sem nova entrega externa: a arrival (ViewContent) já foi
    // enviada pelo SSR e antes do SSR não havia conversão própria ligada a opened.
    let enriched = false;
    if (!isSsr && eventId) {
      const { data: row, error: rowErr } = await admin.from("song_link_events")
        .select("id, origin, opened, destination, in_app_browser, device, os, mode, capi_fbp, country")
        .eq("event_id", eventId).eq("event", event).eq("link_id", link.id)
        .gte("created_at", "2026-10-10T00:00:00Z").order("created_at").limit(1).maybeSingle();
      if (rowErr) return json({ ok: false, error: "erro_interno" }, 500, origin);
      const patch: Record<string, unknown> = {};
      if (row?.origin === "ssr") {
        if (opened && !row.opened) patch.opened = opened;
        if (destination && !row.destination) patch.destination = destination;
        const mode = s(body.mode, 30);
        if (mode && !row.mode) patch.mode = mode;
        // UA real do browser é mais fiável que o UA reencaminhado pelo SSR.
        if (in_app_browser && in_app_browser !== "other") patch.in_app_browser = in_app_browser;
        else if (in_app_browser && !row.in_app_browser) patch.in_app_browser = in_app_browser;
        if (device) patch.device = device;
        if (os) patch.os = os;
        // Adenda 4: país em falta na linha SSR → o do browser (com região/cidade).
        if (!row.country && hdrCountry) { patch.country = hdrCountry; patch.region = hdrRegion; patch.city = hdrCity; }
      }
      if (!row) {
        // Adenda 3: event_id já usado mas sem linha deste link → nunca perder a chegada.
        // Grava com event_id novo e sem entrega externa (o original pode já ter sido entregue).
        const { error } = await admin.from("song_link_events").insert({
          link_id: link.id, company_id: link.company_id, artist_id: link.artist_id, song_id: link.song_id,
          event, mode: s(body.mode, 30), destination, opened, event_id: crypto.randomUUID(),
          utm_source: s(body.utm_source, 200), utm_medium: s(body.utm_medium, 200),
          utm_campaign: s(body.utm_campaign, 200), utm_content: s(body.utm_content, 200), utm_term: s(body.utm_term, 200),
          fbclid: s(body.fbclid, 500), ttclid: s(body.ttclid, 500), country: hdrCountry, region: hdrRegion, city: hdrCity,
          device, os, in_app_browser, ip_hash: ipHash, origin: "browser",
          capi_status: "nao_reenviado", tiktok_status: "nao_reenviado" });
        if (error) return json({ ok: false, error: "erro_interno" }, 500, origin);
        return json({ ok: true, duplicate: true, recovered: true, delivery: "nao_reenviada" }, 200, origin);
      }
      if (row && s(body.fbp, 500) && row.capi_fbp !== true) patch.capi_fbp = true;
      if (row && Object.keys(patch).length) {
        const { error } = await admin.from("song_link_events").update(patch).eq("id", row.id);
        if (error) return json({ ok: false, error: "erro_interno" }, 500, origin);
        enriched = row.origin === "ssr";
        if (enriched) {
          await admin.from("song_link_diag").insert({ kind: "redirect", slug: slug.slice(0, 80),
            arrival_event_id: /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : null,
            in_app: in_app_browser && ["tiktok", "instagram", "facebook"].includes(in_app_browser) ? in_app_browser : "other",
            detail: "ssr_enrich" });
        }
      }
    }
    return json({ ok: true, duplicate: true, enriched, delivery: "ja_enviada_pelo_ssr" }, 200, origin);
  }
  }

  // AJ19: choice COM arrival_event_id — vincula a linha à chegada. Se outra
  // choice já ocupa (link, chegada, destino), o vínculo falha e o ListenClick
  // Meta não é entregue por esta linha (sem slot → sem envio duplicado).
  let choiceArrivalLinked = false;
  if (!appOpen && event === "choice" && arrivalEventId && claimedId) {
    const { error } = await admin.from("song_link_events")
      .update({ arrival_event_id: arrivalEventId }).eq("id", claimedId);
    choiceArrivalLinked = !error;
    if (error) console.warn("[song-link-event] choice arrival link falhou", error.message);
  }

  const work = (async () => {
    // Geo: CDN/cabeçalhos primeiro; depois cache ip_hash 24 h; depois ipinfo (limite). Nunca atrasa a resposta.
    // Adenda 5: país da CDN sem região/cidade → completa, sem NUNCA substituir o país.
    let country = hdrCountry, region = hdrRegion, city = hdrCity;
    let geoSrc = country ? (city ? "cdn" : "cdn_pais") : "none";
    const blitz = (s(body.utm_campaign, 200) ?? "").toLowerCase().startsWith("blitz_");
    if ((!country || !city) && (ip || ipHash)) {
      try {
        const { geo: g, src } = await geoFor(admin, ipHash, ip ?? "", blitz);
        if (!country && g.country) {
          country = s(g.country, 8); region = s(g.region, 80); city = s(g.city, 120); geoSrc = src;
        } else if (country && g.country && g.country.toUpperCase() === country.toUpperCase()) {
          region = region ?? s(g.region, 80); city = city ?? s(g.city, 120);
          if (g.city) geoSrc = `cdn+${src}`;
        } else if (src === "quota") geoSrc += "+quota";
      } catch { /* fica como está */ }
    }
    if (country && city) await hashGeoPut(admin, ipHash, { country, region, city }).catch(() => {});
    console.log("[song-link-event] geo " + JSON.stringify({ src: geoSrc, country, city: !!city, blitz }));
    // CAPI
    // D-ERP171 adenda: destino "instagram" (seguir o artista) não é escuta → sem CAPI nem TikTok.
    const naoAplicavel = event === "choice" && (destination ?? "").toLowerCase() === "instagram";
    // AJ19: plano de entrega por fornecedor.
    // Meta: arrival → ViewContent (ID próprio); choice sem chegada → ListenClick
    // (ID próprio, como hoje); choice com chegada ou app_open → ListenClick com
    // ID canónico arrival+':open' atrás do slot (meta, ListenClick).
    // TikTok: arrival → ViewContent; choice → ClickButton (ID próprio, inalterado);
    // app_open → CompleteRegistration com ID canónico atrás do slot (tiktok, CompleteRegistration).
    const openId = arrivalEventId ? canonicalOpenId(arrivalEventId) : null;
    const metaSlot = (appOpen || (event === "choice" && choiceArrivalLinked)) ? "ListenClick" : null;
    const metaEventName = event === "arrival" ? "ViewContent" : "ListenClick";
    const metaEventId = metaSlot ? openId! : (eventId ?? undefined);
    const ttSlot = appOpen ? "CompleteRegistration" : null;
    const ttEventName = event === "arrival" ? "ViewContent" : appOpen ? "CompleteRegistration" : "ClickButton";
    const ttEventId = ttSlot ? openId! : (eventId ?? undefined);
    // AJ19 dedup ViewContent (só chegadas): marca 'duplicate' por fornecedor.
    let metaDup = false, ttDup = false;
    if (event === "arrival") {
      const fbclidIn = s(body?.fbclid, 500);
      const ttclidIn = s(body?.ttclid, 500);
      if (fbclidIn) metaDup = await recentDuplicate(admin, link.id, "fbclid", fbclidIn, claimedId!);
      if (ttclidIn) ttDup = await recentDuplicate(admin, link.id, "ttclid", ttclidIn, claimedId!);
    }
    let capi_status = naoAplicavel ? "nao_aplicavel" : "sem_pixel";
    let capi_fbc: boolean | null = null, capi_fbp: boolean | null = null, capi_external_id: boolean | null = null;
    if (!naoAplicavel && link.meta_pixel_id && metaDup) capi_status = "duplicate";
    else if (!naoAplicavel && link.meta_pixel_id && metaSlot &&
      !(await reserveSlot(admin, arrivalEventId!, "meta", metaSlot, claimedId!))) capi_status = "slot_perdido";
    else if (!naoAplicavel && link.meta_pixel_id) {
      const token = await getSecret("META_CAPI_TOKEN");
      if (!token) capi_status = "sem_token";
      else {
        try {
          const user_data: Record<string, unknown> = {};
          if (ip) user_data.client_ip_address = ip;
          if (ua) user_data.client_user_agent = ua;
          let fbc = s(body?.fbc, 500); const fbp = s(body?.fbp, 500);
          // D-ERP171: fbc no servidor a partir do fbclid quando o Portal não o enviou.
          const fbclidIn = s(body?.fbclid, 500);
          if (!fbc && fbclidIn) fbc = `fb.1.${Date.now()}.${fbclidIn}`;
          if (fbc) user_data.fbc = fbc;
          if (fbp) user_data.fbp = fbp;
          // D-ERP171: external_id = sha256(sal:ip:ua). Nunca gravado; sem cookies.
          if (salt && ip) user_data.external_id = await sha256Hex(`${salt}:${ip}:${ua}`);
          // D-ERP171: geo em hash (normalização Meta).
          const norm = (v: string | null) => v ? v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "") : "";
          const nCountry = norm(country), nRegion = norm(region), nCity = norm(city);
          if (nCountry.length === 2) user_data.country = await sha256Hex(nCountry);
          if (nRegion) user_data.st = await sha256Hex(nRegion);
          if (nCity) user_data.ct = await sha256Hex(nCity);
          const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${link.meta_pixel_id}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: [{
                event_name: metaEventName,
                event_time: Math.floor(Date.now() / 1000),
                event_id: metaEventId,
                action_source: "website",
                event_source_url: pageUrl ?? undefined,
                user_data,
                custom_data: { content_name: link.title ?? slug, content_ids: [contentId], destination: destination ?? undefined },
              }],
              access_token: token,
              ...(metaTest ? { test_event_code: metaTest } : {}),
            }),
            signal: AbortSignal.timeout(8000),
          });
          const rt = await r.text();
          capi_status = r.ok ? "enviado" : `erro:${r.status}`;
          capi_fbc = !!user_data.fbc; capi_fbp = !!user_data.fbp; capi_external_id = !!user_data.external_id;
          let er: unknown = null;
          try { er = JSON.parse(rt)?.events_received ?? null; } catch { /* */ }
          console.log("[song-link-event] capi", JSON.stringify({ status: r.status, events_received: er, user_data_keys: Object.keys(user_data), test: !!metaTest }));
        } catch {
          capi_status = "erro:rede";
        }
      }
    }
    // TikTok Events API (nunca faz falhar o pedido; IP não fica guardado)
    let tiktok_status = naoAplicavel ? "nao_aplicavel" : "sem_pixel";
    if (!naoAplicavel && link.tiktok_pixel_id) {
      const ttToken = await getSecret("TIKTOK_EVENTS_ACCESS_TOKEN");
      if (!ttToken) tiktok_status = "sem_token";
      else {
        try {
          const user: Record<string, unknown> = {};
          const ttclid = s(body?.ttclid, 500); const ttp = s(body?.ttp, 500);
          if (ttclid) user.ttclid = ttclid;
          if (ttp) user.ttp = ttp;
          if (ip) user.ip = ip;
          if (ua) user.user_agent = ua;
          const r = await fetch(TIKTOK_EVENTS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Access-Token": ttToken },
            body: JSON.stringify({
              event_source: "web",
              event_source_id: link.tiktok_pixel_id,
              ...(ttTest ? { test_event_code: ttTest } : {}),
              data: [{
                event: event === "arrival" ? "ViewContent" : "ClickButton",
                event_time: Math.floor(Date.now() / 1000),
                event_id: eventId ?? undefined,
                user,
                page: { url: pageUrl ?? undefined },
                properties: {
                  content_id: contentId,
                  content_name: link.title ?? slug,
                  content_type: link.link_type === "playlist" ? "product_group" : "product",
                  contents: [{ content_id: contentId, content_name: link.title ?? slug }],
                  destination: destination ?? undefined,
                },
              }],
            }),
            signal: AbortSignal.timeout(8000),
          });
          const tj: any = await r.json().catch(() => null);
          tiktok_status = r.ok && tj?.code === 0 ? "enviado" : `erro:${tj?.code ?? r.status}`;
        } catch {
          tiktok_status = "erro:rede";
        }
      }
    }
    const { error: insErr } = await admin.from("song_link_events").update({
      country, region, city,
      capi_status,
      capi_fbc, capi_external_id,
      tiktok_status,
    }).eq("id", claimedId);
    // Do not overwrite enrichment by a concurrent browser request with false/null.
    if (capi_fbp === true) await admin.from("song_link_events").update({ capi_fbp: true }).eq("id", claimedId);
    if (insErr) console.warn("[song-link-event] update falhou", insErr.message);
  })();

  // @ts-ignore EdgeRuntime
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;

  return json({ ok: true }, 200, origin);
}

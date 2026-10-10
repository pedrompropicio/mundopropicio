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
import { validSsrKey, prefetchDetail } from "./ssr.ts";

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

// D-ERP159: geo por IP (ipinfo) quando os cabeçalhos não trazem país.
// Cache em memória da instância por chave de hash (nunca o IP) durante 24 h.
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const geoCache = new Map<string, { at: number; geo: Geo }>();
async function geoFor(key: string, ip: string): Promise<Geo> {
  const now = Date.now();
  const hit = geoCache.get(key);
  if (hit && now - hit.at < GEO_TTL_MS) return hit.geo;
  const geo = await lookupIpGeo(ip, { timeoutMs: 3000, tag: "song-link-event" });
  geoCache.set(key, { at: now, geo });
  if (geoCache.size > 20000) {
    for (const [k, v] of geoCache) if (now - v.at >= GEO_TTL_MS) geoCache.delete(k);
  }
  return geo;
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
  let in_app_browser: string | null = null;
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

Deno.serve(async (req: Request): Promise<Response> => {
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
  if (!isSsr && (!origin || !ALLOWED_ORIGINS.has(origin))) return json({ ok: false, error: "forbidden_origin" }, 403, origin);
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  let body: any;
  // sendBeacon envia text/plain com JSON (pedido simples, sem pré-verificação CORS):
  // ler sempre como texto e fazer JSON.parse, seja qual for o Content-Type.
  try { body = JSON.parse(await req.text()); } catch { return json({ ok: false, error: "invalid_json" }, 400, origin); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_body" }, 400, origin);
  if (body.ssr === true && !isSsr) return json({ ok: false, error: "unauthorized_ssr" }, 401, origin);
  if (isSsr && (body.ssr !== true || body.event !== "arrival" || !s(body.event_id, 120) ||
    typeof body.client_ua !== "string" || body.client_ua.length > 4000 ||
    typeof body.client_ip !== "string" || !/^[0-9a-fA-F:.]{3,45}$/.test(body.client_ip) ||
    typeof body.prefetch !== "boolean" || (body.purpose != null && typeof body.purpose !== "string"))) {
    return json({ ok: false, error: "invalid_ssr_body" }, 400, origin);
  }

  const slug = s(body?.slug, 120)?.toLowerCase() ?? null;
  const event = body?.event;
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return json({ ok: false, error: "slug_invalido" }, 400, origin);
  if (event !== "arrival" && event !== "choice") return json({ ok: false, error: "event_invalido" }, 400, origin);
  const opened = body?.opened === "app" || body?.opened === "web" ? body.opened : null;

  const ip = isSsr ? s(body.client_ip, 45) : extractIp(req);
  const ua = isSsr ? s(body.client_ua, 4000) ?? "" : req.headers.get("user-agent") ?? "";
  const salt = await getSecret("SONG_LINK_IP_SALT");
  const ipHash = ip && salt ? await sha256Hex(`${salt}:${ip}`) : null;
  // Chave do limite: ip_hash; sem sal, um hash local sem sal (só em memória, nunca gravado).
  const rlKey = ipHash ?? (ip ? await sha256Hex(`rl:${ip}`) : "sem-ip");
  if (rateLimited(rlKey)) return json({ ok: false, error: "rate_limited" }, 429, origin);

  const databaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!databaseUrl || !serviceKey) return json({ ok: false, error: "erro_interno" }, 500, origin);
  const admin = createClient(databaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: link, error: linkErr } = await admin
    .from("song_links")
    .select("id, company_id, artist_id, song_id, link_type, title, meta_pixel_id, tiktok_pixel_id, active")
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
  const hdrCountry = isSsr ? null : s(req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country") ?? req.headers.get("x-country"), 8);
  const hdrRegion = isSsr ? null : s(req.headers.get("cf-region") ?? req.headers.get("x-vercel-ip-country-region"), 80);
  const hdrCity = isSsr ? null : s(req.headers.get("cf-ipcity") ?? req.headers.get("x-vercel-ip-city"), 120);
  const eventId = s(body?.event_id, 120);
  const pageUrl = s(body?.page_url, 2000);
  const destination = s(body?.destination, 60);
  const metaTest = typeof body?.meta_test_event_code === "string" && TEST_CODE_RE.test(body.meta_test_event_code) ? body.meta_test_event_code : null;
  const ttTest = typeof body?.tiktok_test_event_code === "string" && TEST_CODE_RE.test(body.tiktok_test_event_code) ? body.tiktok_test_event_code : null;

  // D-ERP234: atomic INSERT ON CONFLICT happens before any external delivery.
  const { data: claimedId, error: claimError } = await admin.rpc("song_link_event_claim", { p_payload: {
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
  if (!claimedId) {
    // Fill missing browser-cookie evidence only; never deliver twice or change origin.
    if (!isSsr && eventId && s(body.fbp, 500)) {
      const { error } = await admin.from("song_link_events").update({ capi_fbp: true })
        .eq("event_id", eventId).eq("event", event).eq("link_id", link.id)
        .gte("created_at", "2026-10-10T00:00:00Z").or("capi_fbp.is.null,capi_fbp.eq.false");
      if (error) return json({ ok: false, error: "erro_interno" }, 500, origin);
    }
    return json({ ok: true, duplicate: true }, 200, origin);
  }

  const work = (async () => {
    // Geo: cabeçalhos primeiro; senão ipinfo (3 s, falha → null). Nunca atrasa a resposta.
    let country = hdrCountry, region = hdrRegion, city = hdrCity;
    if (!country && ip) {
      try {
        const g = await geoFor(rlKey, ip);
        country = s(g.country, 8); region = s(g.region, 80); city = s(g.city, 120);
      } catch { /* fica null */ }
    }
    // CAPI
    // D-ERP171 adenda: destino "instagram" (seguir o artista) não é escuta → sem CAPI nem TikTok.
    const naoAplicavel = event === "choice" && (destination ?? "").toLowerCase() === "instagram";
    let capi_status = naoAplicavel ? "nao_aplicavel" : "sem_pixel";
    let capi_fbc: boolean | null = null, capi_fbp: boolean | null = null, capi_external_id: boolean | null = null;
    if (!naoAplicavel && link.meta_pixel_id) {
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
                event_name: event === "arrival" ? "ViewContent" : "ListenClick",
                event_time: Math.floor(Date.now() / 1000),
                event_id: eventId ?? undefined,
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
});

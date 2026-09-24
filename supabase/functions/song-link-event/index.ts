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

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set<string>([
  "https://www.mundopropicio.com",
  "https://mundopropicio.com",
]);
const GRAPH_VERSION = "v18.0";
const RATE_LIMIT = 60; // eventos por ip_hash por minuto
const RATE_WINDOW_MS = 60_000;

function cors(origin: string | null): Record<string, string> {
  const ok = !!origin && ALLOWED_ORIGINS.has(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "null",
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
  if (secretCache.has(name)) return secretCache.get(name)!;
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
  if (/Instagram/i.test(u)) in_app_browser = "instagram";
  else if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(u)) in_app_browser = "facebook";
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
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: "forbidden_origin" }, 403, origin);
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400, origin); }

  const slug = s(body?.slug, 120)?.toLowerCase() ?? null;
  const event = body?.event;
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return json({ ok: false, error: "slug_invalido" }, 400, origin);
  if (event !== "arrival" && event !== "choice") return json({ ok: false, error: "event_invalido" }, 400, origin);
  const opened = body?.opened === "app" || body?.opened === "web" ? body.opened : null;

  const ip = extractIp(req);
  const salt = await getSecret("SONG_LINK_IP_SALT");
  const ipHash = ip && salt ? await sha256Hex(`${salt}:${ip}`) : null;
  // Chave do limite: ip_hash; sem sal, um hash local sem sal (só em memória, nunca gravado).
  const rlKey = ipHash ?? (ip ? await sha256Hex(`rl:${ip}`) : "sem-ip");
  if (rateLimited(rlKey)) return json({ ok: false, error: "rate_limited" }, 429, origin);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: link, error: linkErr } = await admin
    .from("song_links")
    .select("id, company_id, artist_id, song_id, title, meta_pixel_id, active")
    .eq("slug", slug)
    .maybeSingle();
  if (linkErr) return json({ ok: false, error: "erro_interno" }, 500, origin);
  if (!link || !link.active) return json({ ok: false, error: "link_inexistente" }, 404, origin);

  const ua = req.headers.get("user-agent") ?? "";
  const { device, os, in_app_browser } = parseUA(ua);
  const country = s(req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country") ?? req.headers.get("x-country"), 8);
  const region = s(req.headers.get("cf-region") ?? req.headers.get("x-vercel-ip-country-region"), 80);
  const city = s(req.headers.get("cf-ipcity") ?? req.headers.get("x-vercel-ip-city"), 120);
  const eventId = s(body?.event_id, 120);
  const pageUrl = s(body?.page_url, 2000);
  const destination = s(body?.destination, 60);

  const work = (async () => {
    // CAPI
    let capi_status = "sem_pixel";
    if (link.meta_pixel_id) {
      const token = await getSecret("META_CAPI_TOKEN");
      if (!token) capi_status = "sem_token";
      else {
        try {
          const user_data: Record<string, unknown> = {};
          if (ip) user_data.client_ip_address = ip;
          if (ua) user_data.client_user_agent = ua;
          const fbc = s(body?.fbc, 500); const fbp = s(body?.fbp, 500);
          if (fbc) user_data.fbc = fbc;
          if (fbp) user_data.fbp = fbp;
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
                custom_data: { content_name: link.title ?? slug, content_ids: [link.song_id], destination: destination ?? undefined },
              }],
              access_token: token,
            }),
            signal: AbortSignal.timeout(8000),
          });
          await r.text();
          capi_status = r.ok ? "enviado" : `erro:${r.status}`;
        } catch {
          capi_status = "erro:rede";
        }
      }
    }
    const { error: insErr } = await admin.from("song_link_events").insert({
      link_id: link.id,
      company_id: link.company_id,
      artist_id: link.artist_id,
      song_id: link.song_id,
      event,
      mode: s(body?.mode, 30),
      destination,
      opened,
      event_id: eventId,
      utm_source: s(body?.utm_source, 200),
      utm_medium: s(body?.utm_medium, 200),
      utm_campaign: s(body?.utm_campaign, 200),
      utm_content: s(body?.utm_content, 200),
      utm_term: s(body?.utm_term, 200),
      fbclid: s(body?.fbclid, 500),
      ttclid: s(body?.ttclid, 500),
      country, region, city, device, os, in_app_browser,
      ip_hash: ipHash,
      capi_status,
    });
    if (insErr) console.warn("[song-link-event] insert falhou", insErr.message);
  })();

  // @ts-ignore EdgeRuntime
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;

  return json({ ok: true }, 200, origin);
});

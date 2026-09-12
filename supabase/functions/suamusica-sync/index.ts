// suamusica-sync — recolhe métricas públicas do Sua Música para
// public.artist_metrics_daily, public.artist_releases e
// public.artist_release_metrics_daily.
//
// Só backend. Não cria cron. Não altera tabelas.
//
// Fonte: páginas públicas de https://suamusica.com.br. O site é Next.js e traz
// os números EXACTOS em dados estruturados embutidos (<script id="__NEXT_DATA__">):
//   props.pageProps.user      → followers, plays, download, uploads (inteiros)
//   props.pageProps.userAlbums→ { id, title, slug, plays, downloads, sendDate, username }
// Só se esse JSON faltar é que se leem os números visíveis ("368.7K Seguidores"),
// e nesse caso o resumo marca o artista como `rounded`.
//
// Recolha mínima e educada: pedidos sequenciais, 1 s de intervalo, timeout 15 s,
// User-Agent próprio. 403/429 param o artista e seguem para o próximo.
// Data de referência: hoje em America/Fortaleza.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  deduceTriggerSource,
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";

const FUNCTION_NAME = "suamusica-sync";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://suamusica.com.br";
const UA = "MundoPropicio-Carreira/1.0";
const TIMEOUT_MS = 15_000;
const POLITE_DELAY_MS = 1_000;
const PLATFORM = "sua_musica";
const SOURCE = "public_page";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Contador vindo do site: null/""/negativo/não-número → null (nunca 0 inventado). */
function toCount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hoje em America/Fortaleza (UTC-3, sem horário de verão). */
function todayFortaleza(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ---------------------------------------------------------------- autorização
type Caller = { allowed: boolean; reason?: string };

async function authorize(req: Request, admin: SupabaseClient): Promise<Caller> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return { allowed: false, reason: "missing token" };

  // JWT já verificado pelo gateway (verify_jwt = true): basta ler o claim role
  try {
    const payload = JSON.parse(atob(bearer.split(".")[1] ?? ""));
    if (payload?.role === "service_role") return { allowed: true };
  } catch (_e) {
    // token não-JWT: segue para validação de utilizador
  }

  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data?.user) return { allowed: false, reason: "invalid token" };

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const ok = (roles ?? []).some(
    (r: { role: string }) => r.role === "admin" || r.role === "platform_admin",
  );
  return ok ? { allowed: true } : { allowed: false, reason: "insufficient role" };
}

// ------------------------------------------------------------------ recolha
class HardStop extends Error {}

type Fetcher = { get: (url: string) => Promise<string>; count: () => number };

function makeFetcher(): Fetcher {
  let requests = 0;
  let first = true;
  return {
    count: () => requests,
    async get(url: string): Promise<string> {
      if (!first) await sleep(POLITE_DELAY_MS);
      first = false;
      requests++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "text/html" },
          signal: ctrl.signal,
        });
        if (res.status === 403 || res.status === 429) {
          throw new HardStop(`blocked HTTP ${res.status}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function nextData(html: string): any | null {
  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (_e) {
    return null;
  }
}

/** "368.7K" → 368700 ; "51M" → 51000000 ; "1.234" → 1234 */
function parseCompact(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  const m = t.match(/^([\d.,]+)\s*([KkMm])?$/);
  if (!m) return null;
  let num: number;
  const suffix = m[2]?.toUpperCase();
  if (suffix) {
    num = Number(m[1].replace(",", "."));
    if (!Number.isFinite(num)) return null;
    num = num * (suffix === "K" ? 1_000 : 1_000_000);
  } else {
    num = Number(m[1].replace(/[.,]/g, ""));
    if (!Number.isFinite(num)) return null;
  }
  return Math.round(num);
}

/** Fallback: números visíveis no HTML ("368.7K Seguidores"). Arredondados. */
function scrapeVisible(html: string, label: string): number | null {
  const re = new RegExp(`([\\d.,]+\\s*[KkMm]?)\\s*(?:<[^>]+>\\s*)*${label}`, "i");
  const m = html.match(re);
  return m ? parseCompact(m[1]) : null;
}

/** "2026-05-22 12:26:29" (America/Fortaleza, UTC-3) → ISO com offset. */
function fortalezaToIso(raw: string): string | null {
  const m = String(raw).match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}-03:00`;
}

/** "Publicado: 22/05/26 às 12:26" → ISO com offset de Fortaleza. */
function publishedPtToIso(raw: string): string | null {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{2,4})\D+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, d, mo, yr, h, mi] = m;
  const year = yr.length === 2 ? `20${yr}` : yr;
  return `${year}-${mo}-${d}T${h}:${mi}:00-03:00`;
}

interface ReleaseSeed {
  external_id: string;
  title: string;
  url: string;
  published_at: string | null;
  plays: number | null;
  downloads: number | null;
  exact: boolean;
}

// ------------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const auth = await authorize(req, admin);
    if (!auth.allowed) return json({ error: "Forbidden" }, 403);

    let payload: { artist_id?: string; dry_run?: boolean; max_releases?: number } = {};
    try {
      payload = await req.json();
    } catch (_e) {
      payload = {};
    }
    const dryRun = payload.dry_run === true;
    const maxReleases = Math.max(
      1,
      Math.min(50, Number(payload.max_releases ?? 10) || 10),
    );
    const metricDate = todayFortaleza();

    // Canais sua_musica (com o artista, para o company_id explícito)
    let q = admin
      .from("artist_channels")
      .select("id, artist_id, handle, url, artists!inner(id, name, company_id)")
      .eq("platform", PLATFORM);
    if (payload.artist_id) q = q.eq("artist_id", payload.artist_id);
    const { data: channels, error: chErr } = await q;
    if (chErr) throw chErr;

    const results: any[] = [];

    for (const ch of (channels ?? []) as any[]) {
      const artist = ch.artists;
      const handle = (ch.handle ?? "").trim();
      const r: any = {
        artist_id: ch.artist_id,
        artist_name: artist?.name ?? null,
        handle: handle || null,
        requests: 0,
        profile: { exact: null as boolean | null, metrics: {} as Record<string, number> },
        profile_rows_written: 0,
        releases_found: 0,
        releases_written: 0,
        release_metric_rows_written: 0,
        errors: [] as string[],
      };
      results.push(r);

      if (!handle) {
        r.errors.push("canal sem handle");
        continue;
      }
      if (!artist?.company_id) {
        r.errors.push("artista sem company_id");
        continue;
      }

      const fetcher = makeFetcher();
      const profileUrl = `${BASE}/${handle}`;

      try {
        // ---------------------------------------------------------- 1. perfil
        const html = await fetcher.get(profileUrl);
        const nd = nextData(html);
        const pp = nd?.props?.pageProps ?? null;
        const user = pp?.user ?? null;

        let exact = false;
        const metrics: Record<string, number | null> = {};

        // Há perfis (ex.: LittoLins) em que a página NÃO mostra o contador de
        // seguidores e o __NEXT_DATA__ traz followers = 0 — não é valor real.
        // Só se grava 'followers' quando o contador está visível no HTML.
        const followersVisible = scrapeVisible(html, "Seguidores") !== null;

        if (user) {
          exact = true;
          metrics.followers = followersVisible ? toCount(user.followers) : null;
          metrics.plays_total = toCount(user.plays);
          metrics.downloads_total = toCount(user.download);
          metrics.uploads = toCount(user.uploads);
        } else {
          metrics.followers = followersVisible ? scrapeVisible(html, "Seguidores") : null;
          metrics.plays_total = scrapeVisible(html, "Plays");
          metrics.downloads_total = scrapeVisible(html, "Downloads");
          metrics.uploads = scrapeVisible(html, "Uploads");
        }
        r.profile.exact = exact;

        const capturedAt = new Date().toISOString();
        const metricRows: any[] = [];
        for (const [metric, value] of Object.entries(metrics)) {
          if (value === null || value === undefined) {
            r.errors.push(
              metric === "followers" && !followersVisible
                ? "perfil: seguidores não expostos"
                : `perfil: métrica '${metric}' não encontrada — não gravada`,
            );
            continue;
          }
          r.profile.metrics[metric] = value;
          metricRows.push({
            company_id: artist.company_id,
            artist_id: ch.artist_id,
            channel_id: ch.id,
            platform: PLATFORM,
            metric,
            metric_date: metricDate,
            value,
            source: SOURCE,
            source_ref: profileUrl,
            captured_at: capturedAt,
          });
        }

        if (metricRows.length && !dryRun) {
          const { error } = await admin
            .from("artist_metrics_daily")
            .upsert(metricRows, {
              onConflict: "artist_id,platform,metric,metric_date,source",
            });
          if (error) r.errors.push(`perfil: upsert falhou — ${error.message}`);
          else r.profile_rows_written = metricRows.length;
        } else if (metricRows.length) {
          r.profile_rows_written = metricRows.length; // dry_run: contagem prevista
        }

        // ------------------------------------------------- 2. lançamentos
        const albums: any[] = Array.isArray(pp?.userAlbums) ? pp.userAlbums : [];
        const seeds: ReleaseSeed[] = [];

        if (albums.length) {
          // Mais recentes primeiro (a lista traz o fixado à cabeça).
          const sorted = [...albums].sort(
            (a, b) => String(b.sendDate ?? "").localeCompare(String(a.sendDate ?? "")),
          );
          for (const a of sorted.slice(0, maxReleases)) {
            const slug = String(a.slug ?? "").trim();
            const uname = String(a.username ?? handle).trim();
            if (!slug) continue;
            const path = `${uname}/${slug}`;
            seeds.push({
              external_id: path,
              title: String(a.title ?? slug),
              url: `${BASE}/${path}`,
              published_at: a.sendDate ? fortalezaToIso(String(a.sendDate)) : null,
              plays: toCount(a.plays),
              downloads: toCount(a.downloads),
              exact: true,
            });
          }
        } else {
          // Fallback sem dados estruturados: ler a lista no HTML visível.
          const seen = new Set<string>();
          const re = new RegExp(`href="/(${handle}/[a-z0-9\\-]+)"`, "gi");
          let m: RegExpExecArray | null;
          while ((m = re.exec(html)) && seeds.length < maxReleases) {
            const path = m[1];
            if (seen.has(path)) continue;
            seen.add(path);
            seeds.push({
              external_id: path,
              title: path.split("/")[1].replace(/-/g, " "),
              url: `${BASE}/${path}`,
              published_at: null,
              plays: null,
              downloads: null,
              exact: false,
            });
          }
        }
        r.releases_found = seeds.length;

        for (const seed of seeds) {
          // Contadores exactos: se não vieram nos dados estruturados, vai-se à
          // página do lançamento (meta description: "já está com X downloads e Y plays").
          if (seed.plays === null || seed.downloads === null) {
            try {
              const rHtml = await fetcher.get(seed.url);
              const rnd = nextData(rHtml);
              const alb = rnd?.props?.pageProps?.album ?? rnd?.props?.pageProps?.cd ?? null;
              if (alb) {
                const p = toCount(alb.plays);
                if (p !== null) seed.plays = p;
                const dl = toCount(alb.downloads);
                if (dl !== null) seed.downloads = dl;
                if (!seed.published_at && alb.sendDate) {
                  seed.published_at = fortalezaToIso(String(alb.sendDate));
                }
                if (alb.title) seed.title = String(alb.title);
              }
              if (seed.plays === null || seed.downloads === null) {
                const meta = rHtml.match(
                  /já está com\s+([\d.,]+)\s+downloads?\s+e\s+([\d.,]+)\s+plays/i,
                );
                if (meta) {
                  seed.downloads ??= parseCompact(meta[1]);
                  seed.plays ??= parseCompact(meta[2]);
                }
              }
              if (!seed.published_at) {
                const pub = rHtml.match(/Publicado:?\s*([^<]{8,40})/i);
                if (pub) seed.published_at = publishedPtToIso(pub[1]);
              }
            } catch (e) {
              if (e instanceof HardStop) throw e;
              r.errors.push(`lançamento ${seed.external_id}: ${String((e as Error).message)}`);
            }
          }

          if (dryRun) {
            r.releases_written++;
            for (const metric of ["plays", "downloads"] as const) {
              if (seed[metric] === null) {
                r.errors.push(`lançamento ${seed.external_id}: '${metric}' não encontrado — não gravado`);
              } else {
                r.release_metric_rows_written++;
              }
            }
            continue;
          }

          const { data: rel, error: relErr } = await admin
            .from("artist_releases")
            .upsert(
              {
                company_id: artist.company_id,
                artist_id: ch.artist_id,
                platform: PLATFORM,
                external_id: seed.external_id,
                title: seed.title,
                url: seed.url,
                published_at: seed.published_at,
                uploader_handle: handle,
                is_official: true,
              },
              { onConflict: "artist_id,platform,external_id" },
            )
            .select("id")
            .single();

          if (relErr || !rel) {
            r.errors.push(`lançamento ${seed.external_id}: upsert falhou — ${relErr?.message ?? "sem id"}`);
            continue;
          }
          r.releases_written++;

          const relRows: any[] = [];
          const now = new Date().toISOString();
          for (const metric of ["plays", "downloads"] as const) {
            const value = seed[metric];
            if (value === null || value === undefined) {
              r.errors.push(`lançamento ${seed.external_id}: '${metric}' não encontrado — não gravado`);
              continue;
            }
            relRows.push({
              company_id: artist.company_id,
              release_id: rel.id,
              artist_id: ch.artist_id,
              platform: PLATFORM,
              metric,
              metric_date: metricDate,
              value,
              source: SOURCE,
              source_ref: seed.url,
              captured_at: now,
            });
          }
          if (relRows.length) {
            const { error } = await admin
              .from("artist_release_metrics_daily")
              .upsert(relRows, { onConflict: "release_id,metric,metric_date,source" });
            if (error) r.errors.push(`lançamento ${seed.external_id}: métricas — ${error.message}`);
            else r.release_metric_rows_written += relRows.length;
          }
        }
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        r.errors.push(e instanceof HardStop ? `artista interrompido: ${msg}` : msg);
      } finally {
        r.requests = fetcher.count();
      }
    }

    return json({
      ok: true,
      dry_run: dryRun,
      metric_date: metricDate,
      max_releases: maxReleases,
      artists: results.length,
      results,
    });
  } catch (e) {
    console.error("[suamusica-sync]", String((e as Error).message ?? e));
    return json({ error: "sync_failed" }, 500);
  }
});

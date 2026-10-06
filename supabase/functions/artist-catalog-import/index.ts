// artist-catalog-import (D-ERP179) — importa o catálogo Spotify do artista
// para artist_songs com tracking_status='catalogo' (nenhum sync por música
// filtra esse valor: s4a-daily-sync, s4a-audience-sync e song-soundcharts-sync
// só leem 'ativo').
// Fonte: o mesmo token S4A do ERP (catalog-view). Metadados (ISRC, artistas)
// via api.spotify.com/v1/tracks com o mesmo token, se aceitar; senão ficam null.
// Body { artist_id, dry_run? = true }. service_role ou ADS_ROLES na empresa.
// Nunca toca em músicas existentes; nunca devolve tokens.

import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { ADS_ROLES } from "../_shared/artist-ads.ts";
import { getS4aAccessToken, S4aError } from "../_shared/s4a.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s: string) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const body = await req.json().catch(() => null);
  const artistId = body?.artist_id;
  const dryRun = body?.dry_run !== false;
  if (typeof artistId !== "string" || !UUID_RE.test(artistId)) return json({ ok: false, error: "artist_id inválido" }, 400);

  const admin = adminClient();
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "sem sessão" }, 401);
  const { data: artist } = await admin.from("artists").select("id, company_id, name").eq("id", artistId).maybeSingle();
  if (!artist) return json({ ok: false, error: "artista não encontrado" }, 404);
  let isSr = false;
  try { isSr = JSON.parse(atob(bearer.split(".")[1] ?? ""))?.role === "service_role"; } catch (_e) { /* */ }
  if (!isSr) {
    const { data: u, error } = await admin.auth.getUser(bearer);
    if (error || !u?.user) return json({ ok: false, error: "sessão inválida" }, 401);
    const { data: rr } = await admin.from("user_roles").select("role, company_id").eq("user_id", u.user.id);
    const ok = (rr ?? []).some((r: any) => r.role === "platform_admin" || (ADS_ROLES.includes(r.role) && r.company_id === artist.company_id));
    if (!ok) return json({ ok: false, error: "papel insuficiente" }, 403);
  }

  const { data: ch } = await admin.from("artist_channels").select("external_id")
    .eq("artist_id", artistId).eq("platform", "spotify").limit(1).maybeSingle();
  const ext = ch?.external_id;
  if (!ext) return json({ ok: false, error: "artista sem canal spotify" }, 409);

  let tok;
  try { tok = await getS4aAccessToken(admin, artistId); } catch (e) {
    return json({ ok: false, error: e instanceof S4aError ? e.code : "erro token" }, 409);
  }
  const H = { Authorization: `Bearer ${tok.accessToken}`, Accept: "application/json" };

  const cr = await fetch(`https://generic.wg.spotify.com/catalog-view/v1/artist/${ext}/songs?time-filter=all`, { headers: H, signal: AbortSignal.timeout(20_000) });
  if (cr.status !== 200) return json({ ok: false, error: `catalog-view HTTP ${cr.status}` }, 502);
  const songs: any[] = ((await cr.json())?.songs ?? []).filter((s: any) => s?.id && s?.trackName);

  // Metadados opcionais (ISRC + artistas)
  const meta = new Map<string, any>();
  let metaStatus = 0;
  for (let i = 0; i < songs.length; i += 50) {
    const ids = songs.slice(i, i + 50).map((s) => s.id).join(",");
    try {
      const r = await fetch(`https://api.spotify.com/v1/tracks?ids=${ids}`, { headers: H, signal: AbortSignal.timeout(20_000) });
      metaStatus = r.status;
      if (r.status !== 200) break;
      for (const t of (await r.json())?.tracks ?? []) if (t?.id) meta.set(t.id, t);
    } catch (_e) { break; }
  }

  const notes: string[] = [];
  if (meta.size === 0) notes.push(`api.spotify.com/v1/tracks indisponível (HTTP ${metaStatus}): sem ISRC/featuring; dedup por título`);

  // Excluir participações onde não é artista principal (só se houver metadados)
  const candidates = songs.filter((s) => {
    const m = meta.get(s.id);
    if (!m) return true;
    const main = m.artists?.[0]?.id === ext;
    if (!main) notes.push(`excluída (não é artista principal): ${s.trackName}`);
    return main;
  });

  // Dedup: ISRC se houver, senão título normalizado; fica a de mais streams.
  const groups = new Map<string, any[]>();
  for (const s of candidates) {
    const isrc = meta.get(s.id)?.external_ids?.isrc ?? null;
    const k = isrc ? `isrc:${isrc}` : `t:${norm(s.trackName)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  // Juntar também grupos ISRC com o mesmo título? Não: versões diferentes têm ISRC diferente.

  const { data: existing } = await admin.from("artist_songs").select("id, title").eq("artist_id", artistId);
  const exTitles = new Set((existing ?? []).map((e: any) => norm(e.title)));
  const exIds = (existing ?? []).map((e: any) => e.id);
  const { data: idents } = exIds.length
    ? await admin.from("artist_song_identifiers").select("external_id, platform").in("song_id", exIds)
    : { data: [] as any[] };
  const exExt = new Set((idents ?? []).map((i: any) => `${i.platform}:${i.external_id}`));

  const toInsert: any[] = [];
  let skipped = 0;
  for (const arr of groups.values()) {
    arr.sort((a, b) => Number(b.numStreams ?? 0) - Number(a.numStreams ?? 0));
    const top = arr[0];
    const m = meta.get(top.id);
    const isrc = m?.external_ids?.isrc ?? null;
    if (arr.some((s) => exExt.has(`spotify:${s.id}`)) || (isrc && exExt.has(`isrc:${isrc}`)) || exTitles.has(norm(top.trackName))) {
      skipped++; continue;
    }
    toInsert.push({
      row: {
        company_id: artist.company_id, artist_id: artistId, title: top.trackName, isrc,
        release_date: /^\d{4}-\d{2}-\d{2}$/.test(top.releaseDate ?? "") ? top.releaseDate : null,
        featuring: m ? (m.artists ?? []).slice(1).map((a: any) => a.name).filter(Boolean) : null,
        cover_url: top.imageUrl ?? null, is_launch: false, tracking_status: "catalogo",
        notes: "D-ERP179 catálogo Spotify (S4A)",
      },
      spotifyIds: arr.map((s) => s.id),
      streams: Number(top.numStreams ?? 0),
    });
  }

  let inserted = 0;
  if (!dryRun) {
    for (const t of toInsert) {
      const { data: s, error } = await admin.from("artist_songs").insert(t.row).select("id").single();
      if (error) { notes.push(`erro "${t.row.title}": ${error.message}`); continue; }
      inserted++;
      const idRows = t.spotifyIds.map((x: string) => ({ song_id: s.id, platform: "spotify", external_id: x, url: `https://open.spotify.com/track/${x}` }));
      if (t.row.isrc) idRows.push({ song_id: s.id, platform: "isrc", external_id: t.row.isrc, url: null });
      const { error: e2 } = await admin.from("artist_song_identifiers").insert(idRows);
      if (e2) notes.push(`identificadores "${t.row.title}": ${e2.message}`);
    }
  }

  return json({
    ok: true, dry_run: dryRun, catalogo_spotify: songs.length, grupos: groups.size,
    ja_existiam: skipped, a_importar: toInsert.length, importadas: inserted,
    metadados_spotify: meta.size,
    amostra: toInsert.slice(0, 10).map((t) => ({ title: t.row.title, release_date: t.row.release_date, isrc: t.row.isrc, featuring: t.row.featuring, versoes_spotify: t.spotifyIds.length })),
    notes,
  });
});

// artist-comparable-manage — gere os comparáveis de um artista (até 5).
//
// POST {
//   action: 'add' | 'remove' | 'reorder',
//   artist_id: uuid,
//   soundcharts_uuid?: string,      // add
//   comparable_artist_id?: uuid,    // add (já existente na plataforma) | remove | reorder
//   position?: 1..5,                // reorder (posição destino) | add (posição pedida)
//   reason?: string
// }
//
// 'add'     → cria o artista de referência se preciso (roster_type='referencia',
//             managed=false) + canal 'aggregator' com o UUID Soundcharts, insere
//             na primeira posição livre e invoca soundcharts-sync (service role)
//             com start_date = hoje − 365 dias, dry_run=false.
// 'remove'  → apaga só a linha de artist_comparables; o artista fica.
// 'reorder' → troca as posições (swap) entre dois comparáveis do mesmo artista.
//
// Auditoria em system_audit_log, sem dados sensíveis.

import {
  adminClient,
  auditLog,
  authorize,
  callerCompanyIds,
  corsHeaders,
  json,
  mapScArtist,
  ScClient,
} from "../_shared/soundcharts.ts";

const FUNCTION_NAME = "artist-comparable-manage";
const ROLES = ["admin", "platform_admin", "manager", "editor"];
const PLATFORMS = ["tiktok", "instagram", "youtube", "spotify"];
const BLOCKS_PER_PLATFORM = 5; // 365 dias em blocos de 90 → 5 pedidos

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();

  try {
    const caller = await authorize(req, admin, ROLES);
    if (!caller.allowed) return json({ error: "Forbidden" }, 403);
    const changedBy = caller.isServiceRole ? "service_role" : (caller.userId ?? "desconhecido");

    let p: {
      action?: string;
      artist_id?: string;
      soundcharts_uuid?: string;
      comparable_artist_id?: string;
      position?: number;
      reason?: string;
    } = {};
    try {
      p = await req.json();
    } catch {
      p = {};
    }

    const action = String(p.action ?? "");
    if (!["add", "remove", "reorder"].includes(action)) {
      return json({ error: "action inválida ('add' | 'remove' | 'reorder')" }, 400);
    }
    const artistId = typeof p.artist_id === "string" ? p.artist_id : "";
    if (!artistId) return json({ error: "artist_id obrigatório" }, 400);

    const { data: artist, error: aErr } = await admin
      .from("artists")
      .select("id, name, company_id")
      .eq("id", artistId)
      .maybeSingle();
    if (aErr) throw new Error(`artists: ${aErr.message}`);
    if (!artist) return json({ error: "artista não encontrado" }, 404);

    if (!caller.isServiceRole) {
      const companyIds = await callerCompanyIds(admin, caller.userId!);
      if (companyIds !== "all" && !companyIds.includes(artist.company_id)) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const { data: existing, error: exErr } = await admin
      .from("artist_comparables")
      .select("id, comparable_artist_id, position")
      .eq("artist_id", artistId)
      .order("position", { ascending: true });
    if (exErr) throw new Error(`artist_comparables: ${exErr.message}`);
    const rows = existing ?? [];

    // ---------------------------------------------------------------- remove
    if (action === "remove") {
      const compId = typeof p.comparable_artist_id === "string" ? p.comparable_artist_id : "";
      if (!compId) return json({ error: "comparable_artist_id obrigatório" }, 400);
      const row = rows.find((r) => r.comparable_artist_id === compId);
      if (!row) return json({ error: "comparável não encontrado neste artista" }, 404);

      const { error: dErr } = await admin
        .from("artist_comparables")
        .delete()
        .eq("id", row.id);
      if (dErr) throw new Error(`delete: ${dErr.message}`);

      await auditLog(admin, {
        entity_type: "artist_comparables",
        entity_id: row.id as string,
        action: "remove",
        changed_by: changedBy,
        company_id: artist.company_id,
        metadata: { artist_id: artistId, comparable_artist_id: compId, position: row.position },
      });
      return json({ action, artist_id: artistId, removed: compId, remaining: rows.length - 1 });
    }

    // --------------------------------------------------------------- reorder
    if (action === "reorder") {
      const compId = typeof p.comparable_artist_id === "string" ? p.comparable_artist_id : "";
      const target = Number(p.position);
      if (!compId) return json({ error: "comparable_artist_id obrigatório" }, 400);
      if (!Number.isInteger(target) || target < 1 || target > 5) {
        return json({ error: "position tem de estar entre 1 e 5" }, 400);
      }
      const row = rows.find((r) => r.comparable_artist_id === compId);
      if (!row) return json({ error: "comparável não encontrado neste artista" }, 404);
      if (row.position === target) {
        return json({ action, artist_id: artistId, note: "já está nessa posição" });
      }
      const other = rows.find((r) => r.position === target);

      // posição é única por artista: passa pelo −1 para evitar colisão
      const { error: e1 } = await admin
        .from("artist_comparables")
        .update({ position: -1 })
        .eq("id", row.id);
      if (e1) throw new Error(`reorder(1): ${e1.message}`);
      if (other) {
        const { error: e2 } = await admin
          .from("artist_comparables")
          .update({ position: row.position })
          .eq("id", other.id);
        if (e2) throw new Error(`reorder(2): ${e2.message}`);
      }
      const { error: e3 } = await admin
        .from("artist_comparables")
        .update({ position: target })
        .eq("id", row.id);
      if (e3) throw new Error(`reorder(3): ${e3.message}`);

      await auditLog(admin, {
        entity_type: "artist_comparables",
        entity_id: row.id as string,
        action: "reorder",
        changed_by: changedBy,
        company_id: artist.company_id,
        metadata: {
          artist_id: artistId,
          comparable_artist_id: compId,
          from: row.position,
          to: target,
          swapped_with: other?.comparable_artist_id ?? null,
        },
      });
      return json({ action, artist_id: artistId, from: row.position, to: target });
    }

    // ------------------------------------------------------------------- add
    if (rows.length >= 5) {
      return json({ error: "máximo de 5 comparáveis por artista" }, 400);
    }

    const scUuid = typeof p.soundcharts_uuid === "string" ? p.soundcharts_uuid.trim() : "";
    let comparableId = typeof p.comparable_artist_id === "string" ? p.comparable_artist_id : "";
    if (!scUuid && !comparableId) {
      return json({ error: "soundcharts_uuid ou comparable_artist_id obrigatório" }, 400);
    }

    let created = false;
    let scCalls = 0;

    if (!comparableId) {
      // já existe um artista com este UUID nesta empresa?
      const { data: chRow } = await admin
        .from("artist_channels")
        .select("artist_id")
        .eq("platform", "aggregator")
        .eq("external_id", scUuid)
        .eq("company_id", artist.company_id)
        .maybeSingle();

      if (chRow?.artist_id) {
        comparableId = chRow.artist_id as string;
      } else {
        // cria o artista de referência com o que a Soundcharts devolver
        const sc = await ScClient.create();
        const raw = await sc.get(`/api/v2/artist/${scUuid}`);
        scCalls = sc.calls;
        const meta = mapScArtist(raw?.object ?? raw);
        if (!meta.name) return json({ error: "Soundcharts não devolveu o nome do artista" }, 502);

        const { data: newArtist, error: nErr } = await admin
          .from("artists")
          .insert({
            company_id: artist.company_id,
            name: meta.name,
            slug: `${slugify(meta.name)}-${scUuid.slice(0, 8)}`,
            photo_url: meta.image_url,
            country: meta.country,
            genres: meta.genres.length ? meta.genres : null,
            roster_type: "referencia",
            managed: false,
          })
          .select("id, name")
          .single();
        if (nErr) throw new Error(`criar artista de referência: ${nErr.message}`);
        comparableId = newArtist.id as string;
        created = true;

        const { error: cErr } = await admin.from("artist_channels").insert({
          company_id: artist.company_id,
          artist_id: comparableId,
          platform: "aggregator",
          external_id: scUuid,
          is_primary: true,
        });
        if (cErr) throw new Error(`criar canal aggregator: ${cErr.message}`);

        await auditLog(admin, {
          entity_type: "artists",
          entity_id: comparableId,
          action: "create_reference_artist",
          changed_by: changedBy,
          company_id: artist.company_id,
          metadata: { name: newArtist.name, soundcharts_uuid: scUuid },
        });
      }
    }

    if (comparableId === artistId) {
      return json({ error: "um artista não pode ser comparável de si próprio" }, 400);
    }
    if (rows.some((r) => r.comparable_artist_id === comparableId)) {
      return json({ error: "este comparável já está associado ao artista" }, 400);
    }

    // primeira posição livre (respeita a posição pedida se estiver livre)
    const taken = new Set(rows.map((r) => r.position as number));
    let position = 0;
    const wanted = Number(p.position);
    if (Number.isInteger(wanted) && wanted >= 1 && wanted <= 5 && !taken.has(wanted)) {
      position = wanted;
    } else {
      for (let i = 1; i <= 5; i++) {
        if (!taken.has(i)) {
          position = i;
          break;
        }
      }
    }
    if (!position) return json({ error: "sem posição livre (máximo 5)" }, 400);

    const { data: inserted, error: iErr } = await admin
      .from("artist_comparables")
      .insert({
        company_id: artist.company_id,
        artist_id: artistId,
        comparable_artist_id: comparableId,
        position,
        reason: typeof p.reason === "string" && p.reason.trim() ? p.reason.trim() : null,
        chosen_by: caller.userId ?? null,
      })
      .select("id")
      .single();
    if (iErr) throw new Error(`inserir comparável: ${iErr.message}`);

    await auditLog(admin, {
      entity_type: "artist_comparables",
      entity_id: inserted.id as string,
      action: "add",
      changed_by: changedBy,
      company_id: artist.company_id,
      metadata: {
        artist_id: artistId,
        comparable_artist_id: comparableId,
        position,
        created_reference_artist: created,
      },
    });

    // histórico de 12 meses do comparável (chamada interna, service role)
    const startDate = daysAgo(365);
    const estimatedCalls = BLOCKS_PER_PLATFORM * PLATFORMS.length; // ≈20
    let sync: { ok: boolean; status: number; body: unknown } = {
      ok: false,
      status: 0,
      body: null,
    };
    try {
      const res = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/soundcharts-sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            artist_id: comparableId,
            start_date: startDate,
            dry_run: false,
          }),
        },
      );
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      sync = { ok: res.ok, status: res.status, body };
    } catch (e) {
      sync = { ok: false, status: 0, body: { error: (e as Error).message } };
    }

    return json({
      action,
      artist_id: artistId,
      comparable_artist_id: comparableId,
      position,
      created_reference_artist: created,
      quota: {
        soundcharts_calls_now: scCalls,
        estimated_sync_calls: estimatedCalls,
        note:
          "Estimativa: 5 blocos de 90 dias × 4 plataformas. O valor real fica em sync_runs.api_calls.",
      },
      history_sync: {
        start_date: startDate,
        ok: sync.ok,
        status: sync.status,
        result: sync.body,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    return json({ error: msg }, 500);
  }
});

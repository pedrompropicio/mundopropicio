console.log("[diag-video-source] BUILD_VERSION=diag-video-v3");

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH = "https://graph.facebook.com/v18.0";

function pickVideoId(creative: any): { video_id: string | null; origem: string | null } {
  if (creative?.video_id) return { video_id: String(creative.video_id), origem: "creative.video_id" };
  const oss = creative?.object_story_spec?.video_data?.video_id;
  if (oss) return { video_id: String(oss), origem: "object_story_spec.video_data.video_id" };
  const afs = creative?.asset_feed_spec?.videos?.[0]?.video_id;
  if (afs) return { video_id: String(afs), origem: "asset_feed_spec.videos[0].video_id" };
  return { video_id: null, origem: null };
}

async function gget(url: string) {
  try {
    const r = await fetch(url);
    const txt = await r.text();
    let json: any = null;
    try { json = JSON.parse(txt); } catch { /* */ }
    return { ok: r.ok, status: r.status, json, raw: json ? null : txt.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, status: 0, json: null, raw: String(e?.message ?? e) };
  }
}

function extractThumbMaior(thumbnails: any): { uri: string | null; width: number | null; height: number | null } | null {
  const arr = Array.isArray(thumbnails?.data)
    ? thumbnails.data
    : Array.isArray(thumbnails)
      ? thumbnails
      : [];
  if (arr.length === 0) return null;
  // pick largest width
  const sorted = [...arr].sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0));
  const best = sorted[0];
  return {
    uri: best.uri ?? best.source ?? null,
    width: best.width ?? null,
    height: best.height ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const body = await req.json().catch(() => ({}));
    const connection_id = body?.connection_id;
    const ad_account_id = body?.ad_account_id;
    const ids: string[] = Array.isArray(body?.meta_creative_ids) ? body.meta_creative_ids.slice(0, 5) : [];

    if (!connection_id || !ad_account_id || ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "connection_id, ad_account_id e meta_creative_ids[] obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
    if (!masterKey) {
      return new Response(JSON.stringify({ error: "ENCRYPTION_MASTER_KEY ausente" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokenRow, error: tokErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
      p_connection_id: connection_id,
      p_master_key: masterKey,
    });
    if (tokErr || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "falhou decifrar token", details: String(tokErr?.message ?? tokErr ?? "sem token") }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = (Array.isArray(tokenRow) ? tokenRow[0] : tokenRow)?.access_token
      ?? (Array.isArray(tokenRow) ? tokenRow[0] : tokenRow)?.token
      ?? tokenRow;
    if (typeof token !== "string" || !token) {
      return new Response(JSON.stringify({ error: "token decifrado inválido", shape: typeof tokenRow }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SONDAGEM 2 — permissões do token
    const meResp = await gget(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const permsResp = await gget(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(token)}`);
    const token_info: any = {
      me: meResp.ok ? meResp.json : { erro: meResp.json?.error ?? meResp.raw ?? `HTTP ${meResp.status}` },
      permissions: permsResp.ok ? (permsResp.json?.data ?? permsResp.json) : { erro: permsResp.json?.error ?? permsResp.raw ?? `HTTP ${permsResp.status}` },
    };
    // SONDAGEM 3 — tipo de token (simplificado via /me)
    const token_tipo = meResp.ok && meResp.json?.id && meResp.json?.name ? "user" : "desconhecido";

    const results: any[] = [];

    for (const mcid of ids) {
      const out: any = { meta_creative_id: mcid };

      const cr = await gget(
        `${GRAPH}/${encodeURIComponent(mcid)}?fields=id,object_story_spec,video_id,asset_feed_spec&access_token=${encodeURIComponent(token)}`,
      );
      if (!cr.ok) {
        out.erro_creative = cr.json?.error ?? cr.raw ?? `HTTP ${cr.status}`;
        results.push(out);
        continue;
      }
      const picked = pickVideoId(cr.json);
      out.video_id = picked.video_id;
      out.video_id_origem = picked.origem;

      if (!picked.video_id) {
        out.erro = "sem video_id no creative";
        results.push(out);
        continue;
      }

      // tenta com source
      let v = await gget(
        `${GRAPH}/${encodeURIComponent(picked.video_id)}?fields=source,picture,thumbnails,length,status,created_time&access_token=${encodeURIComponent(token)}`,
      );
      let usedFallback = false;
      // se falhou POR CAUSA do campo source (permission), retry sem source
      const sourceError = v.json?.error?.code === 100 || v.json?.error?.message?.toLowerCase().includes("source");
      if (!v.ok || (v.json?.error && sourceError)) {
        out.erro_source = v.json?.error ?? v.raw ?? `HTTP ${v.status}`;
        usedFallback = true;
        v = await gget(
          `${GRAPH}/${encodeURIComponent(picked.video_id)}?fields=picture,thumbnails,length,status,created_time&access_token=${encodeURIComponent(token)}`,
        );
      }
      out.fallback_sem_source = usedFallback;

      const vd = v.json ?? {};
      out.tem_source = !!vd.source;
      out.source = vd.source ?? null;
      out.picture = vd.picture ?? null;
      const thumbs = extractThumbMaior(vd.thumbnails);
      out.thumb_maior = thumbs;
      out.thumbnails_count = Array.isArray(vd.thumbnails?.data)
        ? vd.thumbnails.data.length
        : (Array.isArray(vd.thumbnails) ? vd.thumbnails.length : 0);
      out.length_seg = vd.length ?? null;
      out.status = vd.status ?? null;
      out.created_time = vd.created_time ?? null;

      if (vd.source) {
        try {
          const h = await fetch(vd.source, { method: "HEAD" });
          out.source_byte_size = h.headers.get("content-length");
          out.source_content_type = h.headers.get("content-type");
          out.source_head_status = h.status;
        } catch (e: any) {
          out.source_head_erro = String(e?.message ?? e);
        }
      }

      results.push(out);
    }

    return new Response(
      JSON.stringify({ ad_account_id, count: results.length, results }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

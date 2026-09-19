// artist-ads-creative-import — importa criativos do gestor externo (D-ERP106).
//
// POST { artist_id, connection_id, creative_ids: text[] }
// 200 → { ok, importados: [{ creative_id, meta_creatives_id, ja_existia }], avisos }
//
// Os creative_ids são meta_creative_id da Meta — exactamente os que a RPC
// public.artist_ads_creatives devolve com importado=false (criativos que vivem
// só no espelho crm.meta_ad_snapshot, criados pelo gestor externo).
//
// Para cada um, lê crm.meta_ad_snapshot.raw->'creative' e cria (se não existir)
// uma linha em crm.meta_creatives com meta_creative_id preenchido e SEM
// meta_image_hash / meta_video_id — é esse o caso em que
// crm-meta-publish-execute reutiliza o criativo inteiro, sem o recriar
// (aviso copy_e_link_nao_aplicados).
//
// Sem DDL. Idempotente: a chave UNIQUE (company_id, meta_creative_id) garante
// que reimportar não duplica.
//
// Autorização: sessão de utilizador com papel de tráfego. A decisão é da RPC
// public.artist_ads_assert_write(company_id), chamada na sessão do chamador —
// service_role é recusado (não tem auth.uid()).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_NAME = "artist-ads-creative-import";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type Any = any;

/** object_type da Meta → type aceite pelo CHECK de crm.meta_creatives. */
function tipoDoCriativo(objectType: string | null, raw: Any): string {
  const t = String(objectType ?? "").toUpperCase();
  if (t === "VIDEO") return "video";
  if (t === "PHOTO" || t === "SHARE" || t === "STATUS") return "image";
  if (t === "CAROUSEL") return "carousel";
  const spec = raw?.object_story_spec ?? null;
  if (spec?.video_data) return "video";
  if (spec?.link_data?.child_attachments) return "carousel";
  if (spec?.link_data || spec?.photo_data) return "image";
  return "unknown";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed", mensagem: "Usa POST." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sessao_invalida", mensagem: "É preciso sessão de utilizador." }, 401);

  let body: Any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json", mensagem: "Corpo do pedido inválido." }, 400);
  }
  const artistId = typeof body.artist_id === "string" ? body.artist_id : "";
  const connectionId = typeof body.connection_id === "string" ? body.connection_id : "";
  const creativeIds: string[] = Array.isArray(body.creative_ids)
    ? [...new Set((body.creative_ids as Any[]).filter((x: Any) => typeof x === "string" && x.trim()).map((x: Any) => String(x).trim()))] as string[]
    : [];
  if (!artistId || !connectionId || creativeIds.length === 0) {
    return json({
      error: "missing_params",
      mensagem: "artist_id, connection_id e creative_ids (lista não vazia) são obrigatórios.",
    }, 400);
  }
  if (creativeIds.length > 400) {
    return json({ error: "demasiados_criativos", mensagem: "No máximo 400 criativos por pedido." }, 400);
  }

  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await user.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "sessao_invalida", mensagem: "Sessão inválida ou expirada." }, 401);
  }
  const userId = userData.user.id;

  // Artista (a RLS faz o isolamento por empresa) → company_id
  const { data: artist, error: aErr } = await user
    .from("artists")
    .select("id, name, company_id")
    .eq("id", artistId)
    .maybeSingle();
  if (aErr) return json({ error: "sem_permissao", mensagem: aErr.message }, 403);
  if (!artist) return json({ error: "artista_nao_encontrado", mensagem: "Artista não encontrado." }, 404);

  // Papel de tráfego — a decisão é da RPC, na sessão do chamador.
  const { error: roleErr } = await user.rpc("artist_ads_assert_write", { p_company_id: artist.company_id });
  if (roleErr) {
    return json({ error: "sem_permissao", mensagem: roleErr.message }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ligação: tem de ser deste artista e desta empresa.
  const { data: conn, error: cErr } = await (admin as Any)
    .schema("crm").from("ad_platform_connections")
    .select("id, company_id, artist_id, platform, selected_page_id, selected_instagram_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (cErr) return json({ error: "ligacao_falhou", mensagem: cErr.message }, 500);
  if (!conn) return json({ error: "ligacao_nao_encontrada", mensagem: "Ligação não encontrada." }, 404);
  if (conn.artist_id !== artistId || conn.company_id !== artist.company_id) {
    return json({ error: "ligacao_de_outro_artista", mensagem: "A ligação não é deste artista." }, 422);
  }

  // Espelho dos anúncios do gestor externo.
  const { data: snapRows, error: sErr } = await (admin as Any)
    .schema("crm").from("meta_ad_snapshot")
    .select("external_ad_id, meta_creative_id, name, raw, company_id, connection_id, updated_time")
    .eq("connection_id", connectionId)
    .in("meta_creative_id", creativeIds);
  if (sErr) return json({ error: "snapshot_falhou", mensagem: sErr.message }, 500);

  // Um criativo pode aparecer em vários anúncios: fica o mais recente.
  const porCriativo = new Map<string, Any>();
  for (const r of (snapRows ?? []) as Any[]) {
    const cid = String(r.meta_creative_id ?? "");
    if (!cid) continue;
    const cur = porCriativo.get(cid);
    if (!cur || String(r.updated_time ?? "") > String(cur.updated_time ?? "")) porCriativo.set(cid, r);
  }

  // Já existentes (idempotência).
  const { data: existentes, error: eErr } = await (admin as Any)
    .schema("crm").from("meta_creatives")
    .select("id, meta_creative_id")
    .eq("company_id", artist.company_id)
    .in("meta_creative_id", creativeIds);
  if (eErr) return json({ error: "criativos_falhou", mensagem: eErr.message }, 500);
  const jaExiste = new Map<string, string>();
  for (const r of (existentes ?? []) as Any[]) jaExiste.set(String(r.meta_creative_id), String(r.id));

  const importados: Array<{ creative_id: string; meta_creatives_id: string | null; ja_existia: boolean }> = [];
  const avisos: string[] = [];
  const agora = new Date().toISOString();

  for (const cid of creativeIds) {
    const existente = jaExiste.get(cid);
    if (existente) {
      importados.push({ creative_id: cid, meta_creatives_id: existente, ja_existia: true });
      continue;
    }
    const snap = porCriativo.get(cid);
    if (!snap) {
      avisos.push(`criativo ${cid} não consta do espelho de anúncios desta ligação — não importado`);
      importados.push({ creative_id: cid, meta_creatives_id: null, ja_existia: false });
      continue;
    }
    const creative = snap.raw?.creative ?? {};
    const tipo = tipoDoCriativo(creative.object_type ?? null, creative);
    const nome = String(creative.name ?? snap.name ?? `Criativo Meta ${cid}`).slice(0, 300);
    const linha = {
      company_id: artist.company_id,
      name: nome,
      type: tipo,
      file_url: creative.thumbnail_url ?? null,
      link_url: creative.instagram_permalink_url ?? null,
      meta_creative_id: cid,
      // SEM meta_image_hash / meta_video_id: é assim que a publicação reutiliza
      // o criativo inteiro em vez de o recriar.
      created_by: userId,
      tags: ["gestor-externo"],
      analysis_jsonb: {
        origin: "meta_ad_snapshot",
        connection_id: connectionId,
        external_ad_id: snap.external_ad_id ?? null,
        external_ref: cid,
        imported_at: agora,
        imported_by: userId,
        object_type: creative.object_type ?? null,
        effective_object_story_id: creative.effective_object_story_id ?? null,
        instagram_permalink_url: creative.instagram_permalink_url ?? null,
        thumbnail_url: creative.thumbnail_url ?? null,
        artist_id: artistId,
      },
    };
    const { data: ins, error: iErr } = await (admin as Any)
      .schema("crm").from("meta_creatives")
      .insert(linha)
      .select("id")
      .maybeSingle();
    if (iErr) {
      // Corrida com outro pedido: a UNIQUE decide, e o resultado é o que já existe.
      const { data: again } = await (admin as Any)
        .schema("crm").from("meta_creatives")
        .select("id")
        .eq("company_id", artist.company_id)
        .eq("meta_creative_id", cid)
        .maybeSingle();
      if (again?.id) {
        importados.push({ creative_id: cid, meta_creatives_id: String(again.id), ja_existia: true });
        continue;
      }
      avisos.push(`criativo ${cid} não importado: ${iErr.message}`);
      importados.push({ creative_id: cid, meta_creatives_id: null, ja_existia: false });
      continue;
    }
    importados.push({ creative_id: cid, meta_creatives_id: ins?.id ? String(ins.id) : null, ja_existia: false });
  }

  const novos = importados.filter((i) => !i.ja_existia && i.meta_creatives_id).length;
  console.log(`[${FUNCTION_NAME}] artista ${artistId}: ${novos} novos de ${creativeIds.length} pedidos`);

  return json({
    ok: true,
    artist_id: artistId,
    connection_id: connectionId,
    pedidos: creativeIds.length,
    novos,
    ja_existiam: importados.filter((i) => i.ja_existia).length,
    importados,
    avisos,
  });
});

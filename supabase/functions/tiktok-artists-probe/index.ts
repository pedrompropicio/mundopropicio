// Sonda de leitura para o TikTok Artists (artists.tiktok.com).
// NÃO escreve em nenhuma tabela, não cria sync_runs nem crons.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const API_URL = "https://artists.tiktok.com/tiktok/artist_api/ttfa/song_data/list/v1";
const DEFAULT_ARTIST_USER_ID = "6812764850029970437";
const ALLOWED_ROLES = ["admin", "platform_admin", "manager", "editor"];
const REQUEST_TIMEOUT_MS = 20_000;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authorize(req: Request): Promise<{ ok: true; userId: string } | { ok: false }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false };
  }
  const token = authHeader.replace("Bearer ", "").trim();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) {
    return { ok: false };
  }
  const userId = claims.claims.sub;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (rolesError || !roles) {
    return { ok: false };
  }
  const hasRole = roles.some((r: any) => ALLOWED_ROLES.includes(r.role));
  if (!hasRole) {
    return { ok: false };
  }
  return { ok: true, userId };
}

function isLoginRedirect(status: number, headers: Headers, bodyText: string): boolean {
  if (status >= 300 && status < 400) {
    const location = headers.get("Location") || "";
    if (location.toLowerCase().includes("login") || location.toLowerCase().includes("signin")) {
      return true;
    }
  }
  const lower = bodyText.toLowerCase();
  return lower.includes("login") || lower.includes("sign in") || lower.includes("session expired");
}

function pickSample(songs: any[]) {
  return songs.slice(0, 3).map((s: any) => ({
    group_id: s?.group_id ?? null,
    song_name: s?.song_name ?? null,
    music_cv_cnt: s?.music_cv_cnt ?? null,
    music_creator_cnt: s?.music_creator_cnt ?? null,
    music_vv_cnt: s?.music_vv_cnt ?? null,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const auth = await authorize(req);
  if (!auth.ok) {
    return jsonResponse(401, { ok: false, error: "Unauthorized" });
  }

  const cookie = Deno.env.get("TIKTOK_ARTISTS_COOKIE");
  if (!cookie || cookie.trim() === "") {
    return jsonResponse(428, { ok: false, motivo: "TIKTOK_ARTISTS_COOKIE em falta" });
  }

  const body = await req.json().catch(() => ({}));
  const artistUserId = body.artist_user_id ?? DEFAULT_ARTIST_USER_ID;

  const payload = {
    from: 0,
    size: 60,
    filter: { artist_user_id: String(artistUserId) },
    sort_type: 0,
    sort_order: 1,
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await res.text();
    const bytes = new TextEncoder().encode(text).length;
    const excerto = text.slice(0, 300);

    if (res.status === 401 || res.status === 403 || isLoginRedirect(res.status, res.headers, text)) {
      return jsonResponse(200, {
        ok: false,
        http_status: res.status,
        motivo: "sessao_invalida",
        excerto,
      });
    }

    if (!res.ok) {
      return jsonResponse(200, {
        ok: false,
        http_status: res.status,
        excerto,
      });
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (_e) {
      return jsonResponse(200, {
        ok: false,
        http_status: res.status,
        motivo: "sessao_invalida",
        excerto,
      });
    }

    const songs = data?.song_data_list ?? [];
    return jsonResponse(200, {
      ok: true,
      http_status: res.status,
      n_musicas: songs.length,
      amostra: pickSample(songs),
      tem_cookie: true,
      bytes_resposta: bytes,
    });
  } catch (e: any) {
    const detalhe = e?.name === "TimeoutError" ? "timeout" : (e?.message || String(e));
    return jsonResponse(200, {
      ok: false,
      motivo: "rede",
      detalhe,
    });
  }
});

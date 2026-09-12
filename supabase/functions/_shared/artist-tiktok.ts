// Utilitários da ligação OFICIAL do TikTok (Display API + Login Kit) no módulo
// Carreira Artística. App própria "Social Music Carreira":
// TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET.
//
// NUNCA usa credenciais de anúncios (TikTok Ads) nem ad_platform_connections:
// contas dos artistas ≠ contas de anúncios (D-ERP39).

export const TT_AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
export const TT_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
export const TT_REVOKE = "https://open.tiktokapis.com/v2/oauth/revoke/";
export const TT_USER_INFO = "https://open.tiktokapis.com/v2/user/info/";
export const TT_VIDEO_LIST = "https://open.tiktokapis.com/v2/video/list/";

/** Scopes SÓ DE LEITURA. Nunca publicar, nunca mensagens, nunca anúncios. */
export const TT_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
];

export const TT_USER_FIELDS = [
  "open_id",
  "union_id",
  "avatar_url",
  "display_name",
  "username",
  "profile_web_link",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
  "is_verified",
];

export const TT_VIDEO_FIELDS = [
  "id",
  "create_time",
  "cover_image_url",
  "share_url",
  "video_description",
  "duration",
  "title",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
];

/** Máximo de vídeos lidos por corrida (paginação de 20 em 20). */
export const TT_VIDEO_LIMIT = 200;
export const TT_PAGE_SIZE = 20;

export function tiktokRedirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/artist-tiktok-oauth-callback`;
}

export type TikTokCreds = { clientKey: string; clientSecret: string };

/** Credenciais da app; erro claro e explícito quando faltam. */
export function tiktokCreds(): { creds?: TikTokCreds; error?: string } {
  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
  if (!clientKey) return { error: "TIKTOK_CLIENT_KEY não configurado" };
  if (!clientSecret) return { error: "TIKTOK_CLIENT_SECRET não configurado" };
  return { creds: { clientKey, clientSecret } };
}

/** Mensagem de erro real do TikTok (body.error.code / body.error.message). */
export function ttErrorText(body: any, status: number): string {
  const code = body?.error?.code ?? body?.error;
  const msg = body?.error?.message ?? body?.error_description ?? body?.message;
  if (code || msg) return `${code ?? "erro"}: ${msg ?? `HTTP ${status}`}`;
  return `HTTP ${status}`;
}

/** Token inválido/expirado (o TikTok devolve estes códigos). */
export function ttTokenInvalid(body: any, status: number): boolean {
  const code = String(body?.error?.code ?? body?.error ?? "");
  return status === 401 ||
    ["access_token_invalid", "access_token_expired", "invalid_grant", "unauthorized"]
      .includes(code);
}

export type TokenBundle = {
  access_token: string;
  refresh_token: string | null;
  open_id: string | null;
  scope: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
};

function bundle(body: any): TokenBundle {
  const now = Date.now();
  const exp = Number(body?.expires_in);
  const rexp = Number(body?.refresh_expires_in);
  return {
    access_token: String(body.access_token),
    refresh_token: body?.refresh_token ? String(body.refresh_token) : null,
    open_id: body?.open_id ? String(body.open_id) : null,
    scope: body?.scope ? String(body.scope) : null,
    expires_at: Number.isFinite(exp) && exp > 0
      ? new Date(now + exp * 1000).toISOString()
      : null,
    refresh_expires_at: Number.isFinite(rexp) && rexp > 0
      ? new Date(now + rexp * 1000).toISOString()
      : null,
  };
}

async function postForm(url: string, form: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/** code → tokens. */
export async function ttExchangeCode(
  creds: TikTokCreds,
  code: string,
): Promise<{ ok: true; tokens: TokenBundle } | { ok: false; error: string }> {
  const r = await postForm(TT_TOKEN, {
    client_key: creds.clientKey,
    client_secret: creds.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: tiktokRedirectUri(),
  });
  if (!r.ok || !r.body?.access_token) {
    return { ok: false, error: ttErrorText(r.body, r.status) };
  }
  return { ok: true, tokens: bundle(r.body) };
}

/** refresh_token → novos tokens. */
export async function ttRefresh(
  creds: TikTokCreds,
  refreshToken: string,
): Promise<
  { ok: true; tokens: TokenBundle } | { ok: false; error: string; invalid: boolean }
> {
  const r = await postForm(TT_TOKEN, {
    client_key: creds.clientKey,
    client_secret: creds.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!r.ok || !r.body?.access_token) {
    return {
      ok: false,
      error: ttErrorText(r.body, r.status),
      invalid: ttTokenInvalid(r.body, r.status),
    };
  }
  return { ok: true, tokens: bundle(r.body) };
}

export async function ttRevoke(
  creds: TikTokCreds,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await postForm(TT_REVOKE, {
    client_key: creds.clientKey,
    client_secret: creds.clientSecret,
    token,
  });
  return r.ok ? { ok: true } : { ok: false, error: ttErrorText(r.body, r.status) };
}

/** GET /v2/user/info/ */
export async function ttUserInfo(token: string) {
  const url = `${TT_USER_INFO}?${new URLSearchParams({ fields: TT_USER_FIELDS.join(",") })}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  const errCode = String(body?.error?.code ?? "");
  const failed = !res.ok || (errCode !== "" && errCode !== "ok");
  return { ok: !failed, status: res.status, body, user: body?.data?.user ?? null };
}

/** POST /v2/video/list/ (uma página) */
export async function ttVideoPage(token: string, cursor?: number | null) {
  const url = `${TT_VIDEO_LIST}?${new URLSearchParams({ fields: TT_VIDEO_FIELDS.join(",") })}`;
  const payload: Record<string, unknown> = { max_count: TT_PAGE_SIZE };
  if (cursor) payload.cursor = cursor;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => null);
  const errCode = String(body?.error?.code ?? "");
  const failed = !res.ok || (errCode !== "" && errCode !== "ok");
  return {
    ok: !failed,
    status: res.status,
    body,
    videos: (body?.data?.videos ?? []) as any[],
    cursor: body?.data?.cursor ?? null,
    hasMore: body?.data?.has_more === true,
  };
}

/** handle normalizado: sem @, sem espaços, minúsculas. */
export function normalizeHandle(v: unknown): string {
  return String(v ?? "").replace(/^@/, "").trim().toLowerCase();
}

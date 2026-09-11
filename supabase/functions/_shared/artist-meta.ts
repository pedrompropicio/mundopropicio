// Utilitários partilhados pelas edge functions de ligação/recolha de canais de
// artista (módulo Carreira Artística). NÃO toca em nada do CRM.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Versão actual (latest) da Graph API à data desta implementação. */
export const GRAPH_VERSION = "v25.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Instagram API with Instagram Login (ligação directa pela conta do artista).
 * Base própria: graph.instagram.com, mesma versão.
 */
export const IG_GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`;
export const IG_OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
export const IG_OAUTH_TOKEN = "https://api.instagram.com/oauth/access_token";
/** graph.instagram.com sem versão — usado pelos endpoints de token. */
export const IG_GRAPH_ROOT = "https://graph.instagram.com";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Contador vindo de uma API: nunca inventa 0. */
export function toCount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type Caller = {
  allowed: boolean;
  reason?: string;
  userId?: string;
  isServiceRole?: boolean;
  roles?: string[];
};

/**
 * Autoriza o caller. `allowedRoles` = papéis de utilizador aceites.
 * service_role é sempre aceite (chamadas internas/cron).
 */
export async function authorize(
  req: Request,
  admin: SupabaseClient,
  allowedRoles: string[],
): Promise<Caller> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return { allowed: false, reason: "missing token" };

  try {
    const payload = JSON.parse(atob(bearer.split(".")[1] ?? ""));
    if (payload?.role === "service_role") {
      return { allowed: true, isServiceRole: true };
    }
  } catch (_e) {
    // não-JWT: segue para validação de utilizador
  }

  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data?.user) return { allowed: false, reason: "invalid token" };

  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((r) => allowedRoles.includes(r));
  return ok
    ? { allowed: true, userId: data.user.id, roles }
    : { allowed: false, reason: "insufficient role", userId: data.user.id, roles };
}

/** Empresas a que o utilizador tem acesso (platform_admin: todas). */
export async function callerCompanyIds(
  admin: SupabaseClient,
  userId: string,
): Promise<string[] | "all"> {
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role, company_id")
    .eq("user_id", userId);

  if ((roleRows ?? []).some((r: { role: string }) => r.role === "platform_admin")) {
    return "all";
  }
  const ids = new Set<string>();
  for (const r of roleRows ?? []) {
    if ((r as { company_id?: string }).company_id) {
      ids.add((r as { company_id: string }).company_id);
    }
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("company_id, active_company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.company_id) ids.add(profile.company_id);
  if (profile?.active_company_id) ids.add(profile.active_company_id);
  return [...ids];
}

/** Allowlist de origens para onde o callback pode redirecionar. */
export function allowedReturnOrigins(): string[] {
  const fixed = [
    "https://gestao-artistica.lovable.app",
    "http://localhost:8080",
    "http://localhost:5173",
  ];
  for (const key of ["APP_BASE_URL", "APP_URL", "SITE_URL"]) {
    const v = Deno.env.get(key);
    if (!v) continue;
    try {
      fixed.push(new URL(v).origin);
    } catch (_e) { /* valor inválido: ignora */ }
  }
  return [...new Set(fixed)];
}

export function isAllowedReturnUrl(url: string): boolean {
  try {
    return allowedReturnOrigins().includes(new URL(url).origin);
  } catch (_e) {
    return false;
  }
}

export function redirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/artist-meta-oauth-callback`;
}

/** Redirect URI da ligação directa pelo Instagram (Instagram Login). */
export function igRedirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/artist-instagram-oauth-callback`;
}

/** Escreve no system_audit_log (nunca com tokens). */
export async function auditLog(
  admin: SupabaseClient,
  entry: {
    entity_type: string;
    entity_id: string;
    action: string;
    changed_by: string;
    company_id?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const { error } = await admin.from("system_audit_log").insert(entry);
  if (error) console.error("audit log falhou:", error.message);
}

/** GET à Graph API com token. Devolve { ok, status, body }. */
export async function graphGet(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<{ ok: boolean; status: number; body: any }> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch (_e) {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/** Código de erro Meta (190 = token inválido/expirado). */
export function metaErrorCode(body: any): number | null {
  const c = body?.error?.code;
  return typeof c === "number" ? c : null;
}

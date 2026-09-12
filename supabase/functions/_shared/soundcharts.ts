// Utilitários partilhados pelas edge functions Soundcharts (Carreira Artística).
// NUNCA ecoar credenciais nem tokens.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SC_BASE = "https://customer.api.soundcharts.com";
const SC_TOKEN_URL = "https://account.soundcharts.com/oauth/token";

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

export async function getSoundchartsToken(): Promise<string> {
  const id = Deno.env.get("SOUNDCHARTS_CLIENT_ID");
  const secret = Deno.env.get("SOUNDCHARTS_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Soundcharts credentials not configured");

  const res = await fetch(SC_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Soundcharts auth failed (HTTP ${res.status})`);
  const body = await res.json();
  const token = body?.access_token ?? body?.token;
  if (!token) throw new Error("Soundcharts auth failed (no access_token)");
  return token as string;
}

/** Contador de chamadas à API, para a quota (sync_runs.api_calls). */
export class ScClient {
  calls = 0;
  constructor(private token: string) {}

  static async create(): Promise<ScClient> {
    return new ScClient(await getSoundchartsToken());
  }

  async get(path: string): Promise<any> {
    this.calls++;
    const res = await fetch(`${SC_BASE}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      // O corpo do erro traz a razão real (ex.: plataforma inválida) — sem ele
      // ficávamos só com "HTTP 400" e a investigar às cegas.
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 400);
      } catch (_e) {
        detail = "";
      }
      const err = new Error(
        `HTTP ${res.status}${detail ? ` — ${detail}` : ""}`,
      ) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return await res.json();
  }
}

export type Caller = {
  allowed: boolean;
  reason?: string;
  userId?: string;
  isServiceRole?: boolean;
};

/** service_role sempre aceite; utilizador só com um dos papéis pedidos. */
export async function authorize(
  req: Request,
  admin: SupabaseClient,
  allowedRoles: string[],
): Promise<Caller> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return { allowed: false, reason: "missing token" };

  try {
    const payload = JSON.parse(atob(bearer.split(".")[1] ?? ""));
    if (payload?.role === "service_role") return { allowed: true, isServiceRole: true };
  } catch (_e) {
    // não-JWT: segue para validação de utilizador
  }

  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data?.user) return { allowed: false, reason: "invalid token" };

  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const ok = (roleRows ?? []).some((r: { role: string }) => allowedRoles.includes(r.role));
  return ok
    ? { allowed: true, userId: data.user.id }
    : { allowed: false, reason: "insufficient role", userId: data.user.id };
}

/** Empresas do utilizador (platform_admin: todas). */
export async function callerCompanyIds(
  admin: SupabaseClient,
  userId: string,
): Promise<string[] | "all"> {
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role, company_id")
    .eq("user_id", userId);
  if ((roleRows ?? []).some((r: { role: string }) => r.role === "platform_admin")) return "all";

  const ids = new Set<string>();
  for (const r of roleRows ?? []) {
    const cid = (r as { company_id?: string }).company_id;
    if (cid) ids.add(cid);
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

/** Forma canónica de um artista devolvido pela Soundcharts. */
export interface ScArtist {
  soundcharts_uuid: string;
  name: string | null;
  image_url: string | null;
  country: string | null;
  genres: string[];
  ja_existe_na_plataforma: string | null;
}

export function mapScArtist(raw: any): Omit<ScArtist, "ja_existe_na_plataforma"> {
  const genres = Array.isArray(raw?.genres)
    ? raw.genres.map((g: any) => (typeof g === "string" ? g : g?.name)).filter(Boolean)
    : [];
  return {
    soundcharts_uuid: String(raw?.uuid ?? ""),
    name: raw?.name ?? null,
    image_url: raw?.imageUrl ?? raw?.image_url ?? null,
    country: raw?.countryCode ?? raw?.country?.code ?? null,
    genres,
  };
}

/** Marca quais UUIDs já existem como artistas nas empresas visíveis ao caller. */
export async function markExisting(
  admin: SupabaseClient,
  items: Array<Omit<ScArtist, "ja_existe_na_plataforma">>,
  companyIds: string[] | "all",
): Promise<ScArtist[]> {
  const uuids = items.map((i) => i.soundcharts_uuid).filter(Boolean);
  if (!uuids.length) return items.map((i) => ({ ...i, ja_existe_na_plataforma: null }));

  let q = admin
    .from("artist_channels")
    .select("artist_id, external_id, company_id")
    .eq("platform", "aggregator")
    .in("external_id", uuids);
  if (companyIds !== "all") {
    if (!companyIds.length) return items.map((i) => ({ ...i, ja_existe_na_plataforma: null }));
    q = q.in("company_id", companyIds);
  }
  const { data } = await q;
  const byUuid = new Map<string, string>();
  for (const r of data ?? []) byUuid.set(r.external_id as string, r.artist_id as string);

  return items.map((i) => ({
    ...i,
    ja_existe_na_plataforma: byUuid.get(i.soundcharts_uuid) ?? null,
  }));
}

/** Escreve no system_audit_log (nunca com tokens ou credenciais). */
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

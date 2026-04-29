// Multi-tenant security helpers for edge functions using service-role.
// Service-role bypasses RLS, so EVERY edge function that mutates or reads
// tenant-scoped data MUST validate company ownership explicitly.
//
// Usage:
//   const { caller, callerCompanyId, isPlatformAdmin, adminClient } =
//     await authenticateAndResolveCompany(req);
//   await assertResourceCompany(adminClient, "transactions", transaction_id, callerCompanyId, isPlatformAdmin);

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
export class TenantError extends Error {
  status = 403;
  constructor(message = "Cross-tenant access denied") { super(message); }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) return jsonResponse({ error: err.message }, err.status);
  if (err instanceof TenantError) return jsonResponse({ error: err.message }, err.status);
  const msg = err instanceof Error ? err.message : "Internal error";
  console.error("[edge fn error]", err);
  return jsonResponse({ error: msg }, 500);
}

export interface TenantContext {
  caller: { id: string; email?: string };
  callerCompanyId: string | null;       // active company resolved server-side
  callerRole: string;                    // 'admin' | 'manager' | ...
  isPlatformAdmin: boolean;              // true bypasses tenant checks
  adminClient: SupabaseClient;           // service-role client
  callerClient: SupabaseClient;          // anon client with caller JWT
}

/**
 * Validates JWT, resolves the caller's *active* company server-side
 * (uses profiles.active_company_id when caller is platform_admin, else profiles.company_id),
 * and returns clients ready for tenant-aware queries.
 *
 * Throws AuthError (401) when not authenticated.
 */
export async function authenticateAndResolveCompany(req: Request): Promise<TenantContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new AuthError("Não autorizado");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: authError } = await callerClient.auth.getUser();
  if (authError || !userData?.user) throw new AuthError("Não autorizado");
  const caller = userData.user;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Resolve role (single, deterministic)
  const { data: roleRow } = await adminClient
    .from("user_roles").select("role").eq("user_id", caller.id).maybeSingle();
  const callerRole = roleRow?.role ?? "user";

  // Platform admin? (separate table)
  const { data: isPaRow } = await adminClient.rpc("is_platform_admin", { _user_id: caller.id });
  const isPlatformAdmin = Boolean(isPaRow);

  // Resolve active company (platform_admin can switch via active_company_id)
  const { data: profile } = await adminClient
    .from("profiles")
    .select("company_id, active_company_id")
    .eq("id", caller.id)
    .maybeSingle();

  const callerCompanyId = isPlatformAdmin
    ? (profile?.active_company_id ?? profile?.company_id ?? null)
    : (profile?.company_id ?? null);

  return {
    caller: { id: caller.id, email: caller.email ?? undefined },
    callerCompanyId,
    callerRole,
    isPlatformAdmin,
    adminClient,
    callerClient,
  };
}

/**
 * Verifies a single resource belongs to the caller's company.
 * Platform admins bypass when they have an active_company_id set (still scoped to that company).
 *
 * @throws TenantError (403) on mismatch / missing.
 */
export async function assertResourceCompany(
  adminClient: SupabaseClient,
  table: string,
  id: string,
  callerCompanyId: string | null,
  isPlatformAdmin: boolean,
  idColumn = "id",
): Promise<void> {
  if (!id) throw new TenantError(`Missing ${idColumn} for ${table}`);
  const { data, error } = await adminClient
    .from(table).select("company_id").eq(idColumn, id).maybeSingle();
  if (error) throw new TenantError(`Failed to load ${table}.${id}: ${error.message}`);
  if (!data) throw new TenantError(`${table}.${id} not found`);

  // Platform admin without active company can access anything (rare, e.g. backups)
  if (isPlatformAdmin && callerCompanyId == null) return;

  if (data.company_id !== callerCompanyId) {
    throw new TenantError(
      `Cross-tenant access denied: ${table}.${id} belongs to ${data.company_id}, caller=${callerCompanyId}`
    );
  }
}

/**
 * Same as assertResourceCompany but for many ids in one round-trip.
 */
export async function assertResourcesCompany(
  adminClient: SupabaseClient,
  table: string,
  ids: string[],
  callerCompanyId: string | null,
  isPlatformAdmin: boolean,
  idColumn = "id",
): Promise<void> {
  if (!ids.length) return;
  if (isPlatformAdmin && callerCompanyId == null) return;
  const { data, error } = await adminClient
    .from(table).select(`${idColumn}, company_id`).in(idColumn, ids);
  if (error) throw new TenantError(`Failed to load ${table}: ${error.message}`);
  const found = new Set((data ?? []).map((r: any) => r[idColumn]));
  for (const id of ids) {
    if (!found.has(id)) throw new TenantError(`${table}.${id} not found`);
  }
  for (const r of data ?? []) {
    if ((r as any).company_id !== callerCompanyId) {
      throw new TenantError(`Cross-tenant access denied on ${table}.${(r as any)[idColumn]}`);
    }
  }
}

/**
 * Forces company_id into an insert/update payload to prevent privilege escalation
 * via client-supplied company_id.
 */
export function withCompanyId<T extends Record<string, any>>(
  payload: T,
  callerCompanyId: string | null,
): T & { company_id: string | null } {
  return { ...payload, company_id: callerCompanyId };
}

/**
 * Strips company_id from a client-supplied payload (defense-in-depth — caller
 * should never set company_id directly; use withCompanyId after).
 */
export function stripCompanyId<T extends Record<string, any>>(payload: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { company_id, ...rest } = payload;
  return rest as T;
}

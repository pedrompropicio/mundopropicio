/**
 * Permissões efectivas da UI — réplica fiel de `public.has_permission_in`.
 *
 * Servidor (migration 20260514131452):
 *   COALESCE(
 *     (SELECT granted FROM user_permissions WHERE user_id, permission, company_id),
 *     EXISTS (SELECT 1 FROM user_roles JOIN role_permissions ...)
 *   )
 * Ou seja: o override por utilizador DECIDE (mesmo quando é `false`); só na
 * ausência de override é que vale a permissão do papel.
 *
 * #105: admin e platform_admin partem de TODAS as permissões conhecidas como
 * base (é isso que o produto promete a um administrador), mas os overrides de
 * `user_permissions` aplicam-se por cima — negar `manage_bp` a um admin passa a
 * ter efeito na UI, como já tinha no servidor.
 */

export type PermissionOverride = { permission: string; granted: boolean };

export interface ResolvePermissionsInput {
  /** Papéis do utilizador na empresa activa. */
  roles: string[];
  /** Permissões vindas de `role_permissions` para esses papéis. */
  rolePermissions: string[];
  /** Overrides de `user_permissions` (granted true/false). */
  overrides: PermissionOverride[];
  /** Universo de permissões conhecidas (ALL_PERMISSIONS). */
  allPermissions: string[];
}

export const FULL_ACCESS_ROLES = ["admin", "platform_admin"] as const;

export function hasFullAccessRole(roles: string[]): boolean {
  return roles.some((r) => (FULL_ACCESS_ROLES as readonly string[]).includes(r));
}

export function resolveEffectivePermissions({
  roles,
  rolePermissions,
  overrides,
  allPermissions,
}: ResolvePermissionsInput): string[] {
  const base = new Set<string>(hasFullAccessRole(roles) ? allPermissions : []);
  for (const p of rolePermissions) base.add(p);

  // O override decide, em último lugar — exactamente como o COALESCE do servidor.
  for (const o of overrides) {
    if (o.granted) base.add(o.permission);
    else base.delete(o.permission);
  }

  return Array.from(base);
}

// ---------------------------------------------------------------------------
// #311 F2a — papel e permissões pela EMPRESA ACTIVA.
// Fonte única: RPC public.my_effective_permissions(p_universe) →
// public._effective_permissions_for(uid, current_company_id(), universe).
// A função abaixo é a réplica fiel em TS (para testes e documentação).
// ---------------------------------------------------------------------------

export const ROLE_PRIORITY: Record<string, number> = {
  platform_admin: 0, admin: 1, manager: 2, accountant: 3,
  marketing_manager: 4, content_manager: 4, editor: 4, producer: 4, field_producer: 4,
  partner: 5, viewer: 6, user: 7,
};

export interface Membership { role: string; company_id: string | null }
export interface CompanyOverride extends PermissionOverride { company_id: string }

export function pickTopRole(roles: string[]): string {
  return [...roles].sort((a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99) || a.localeCompare(b))[0] ?? "user";
}

/** Réplica de `_effective_permissions_for`. */
export function resolveForCompany(input: {
  companyId: string;
  memberships: Membership[];
  overrides: CompanyOverride[];
  rolePermissions: Record<string, string[]>;
  universe: string[];
}): { role: string; permissions: string[] } {
  const { companyId, memberships, overrides, rolePermissions, universe } = input;
  const roles = Array.from(new Set(
    memberships.filter((m) => m.company_id === companyId || m.role === "platform_admin").map((m) => m.role),
  ));
  const isPa = memberships.some((m) => m.role === "platform_admin");
  const full = isPa || roles.includes("admin");
  const base = new Set<string>(full ? universe : []);
  if (isPa) Object.values(rolePermissions).flat().forEach((p) => base.add(p));
  for (const r of roles) (rolePermissions[r] ?? []).forEach((p) => base.add(p));
  for (const o of overrides.filter((x) => x.company_id === companyId)) {
    if (o.granted) base.add(o.permission); else base.delete(o.permission);
  }
  return { role: roles.length ? pickTopRole(roles) : "user", permissions: Array.from(base).sort() };
}

/** Evento de troca de empresa activa — o AuthContext recarrega papel e permissões. */
export const ACTIVE_COMPANY_CHANGED_EVENT = "mp:active-company-changed";

export function notifyActiveCompanyChanged(companyId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_COMPANY_CHANGED_EVENT, { detail: { companyId } }));
}

export function onActiveCompanyChanged(cb: (companyId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = (e: Event) => cb((e as CustomEvent).detail?.companyId);
  window.addEventListener(ACTIVE_COMPANY_CHANGED_EVENT, h);
  return () => window.removeEventListener(ACTIVE_COMPANY_CHANGED_EVENT, h);
}

/** Lê o resultado da RPC my_effective_permissions. */
export function parseEffectivePermissions(data: unknown): { role: string; permissions: string[] } {
  const d = (data ?? {}) as { role?: string | null; permissions?: unknown };
  return {
    role: d.role ?? "user",
    permissions: Array.isArray(d.permissions) ? d.permissions.map(String) : [],
  };
}

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

/**
 * TRANSITÓRIO (#338, Lote A #435 a2): permissões cujos defaults ainda não
 * existem em `role_permissions` em Live (migração por aplicar). Remover esta
 * lista, `applyMissingPermissionFallback` e a sua chamada quando a migração dos
 * defaults de `delete_transaction_documents` estiver em Live.
 */
export const MISSING_PERMISSION_FALLBACKS: Record<string, readonly string[]> = {
  delete_transaction_documents: ["admin", "manager"],
};

/**
 * Função pura. Para cada chave com fallback: se NENHUM papel a tem no conjunto
 * carregado de `role_permissions`, concede-a a quem tenha um dos papéis do
 * fallback. Se existir para pelo menos um papel, não acrescenta nada.
 * Aplicar ANTES dos overrides de `user_permissions` (o override prevalece).
 * Transitório — ver #338.
 */
export function applyMissingPermissionFallback(
  base: Set<string>,
  roles: string[],
  rolePermissions: Record<string, string[]>,
  fallbacks: Record<string, readonly string[]> = MISSING_PERMISSION_FALLBACKS,
): Set<string> {
  const all = Object.values(rolePermissions).flat();
  for (const [perm, fbRoles] of Object.entries(fallbacks)) {
    if (all.includes(perm)) continue;
    if (roles.some((r) => fbRoles.includes(r))) base.add(perm);
  }
  return base;
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
  applyMissingPermissionFallback(base, roles, rolePermissions);
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

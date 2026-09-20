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

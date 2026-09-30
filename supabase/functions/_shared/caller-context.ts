// Contexto do chamador e regra de acesso por empresa — fonte única, extraída de
// resolve-attachment-url (Issue #241: empresa activa = active_company_id ?? company_id;
// autorização por PERTENÇA a todas as empresas onde tem papel).

// deno-lint-ignore no-explicit-any
export async function getCallerContext(adminClient: any, callerId: string) {
  const [{ data: profile }, { data: isPlatformAdmin }, { data: roles }] = await Promise.all([
    adminClient.from("profiles").select("company_id, active_company_id").eq("id", callerId).maybeSingle(),
    adminClient.rpc("is_platform_admin", { _user_id: callerId }),
    adminClient.from("user_roles").select("role, company_id").eq("user_id", callerId),
  ]);

  const roleRows = (roles ?? []).map((row: any) => ({
    role: row.role as string,
    company_id: (row.company_id as string | null) ?? null,
  }));
  const roleList = roleRows.map((r) => r.role);
  const activeCompanyId = profile?.active_company_id ?? profile?.company_id ?? null;
  const memberCompanyIds = roleRows
    .map((r) => r.company_id)
    .filter((id): id is string => Boolean(id));

  return {
    activeCompanyId,
    memberCompanyIds,
    isPlatformAdmin: Boolean(isPlatformAdmin),
    roles: roleList,
    roleRows,
  };
}

export type CallerContext = Awaited<ReturnType<typeof getCallerContext>>;

export function canAccessCompany(
  ctx: { activeCompanyId: string | null; memberCompanyIds?: string[]; isPlatformAdmin: boolean },
  companyId?: string | null,
) {
  if (!companyId) return false;
  if (ctx.isPlatformAdmin) return true;
  if ((ctx.memberCompanyIds ?? []).includes(companyId)) return true;
  return ctx.activeCompanyId === companyId;
}

/**
 * #311 F2b — mapa de acesso a módulos e configurações.
 * `accessByRole` replica as guardas ANTIGAS (por papel); `accessByPermission`
 * as NOVAS (por permissão). A prova (permissions-guards-proof.test.ts) exige
 * igualdade para cada utilizador real × empresa.
 */
export const ACCESS_AREAS = [
  "erp", "operacao", "crm", "audience", "accounting", "partner_portal",
  "settings.admin", "settings.users", "settings.permissions", "settings.backups",
  "settings.security", "settings.audit_log", "settings.trash", "settings.diagnostics",
  "settings.notifications", "settings.integrations.ticketing", "settings.integrations.meta",
  "settings.integrations.google", "settings.integrations.tiktok", "settings.portal",
  "settings.bp_tools", "settings.audit_accounts", "settings.accounts",
  "settings.chart_of_accounts", "settings.ticket_offices",
] as const;
export type AccessArea = (typeof ACCESS_AREAS)[number];

const MANAGEMENT_PERMS = [
  "camarim_manage", "manage_events", "view_events", "manage_transactions", "manage_suppliers",
  "manage_quotations", "manage_accounts", "view_balances", "manage_tickets", "manage_ticket_offices",
  "manage_payment_lists", "manage_iva", "manage_categories", "manage_calendar", "manage_recurring",
  "view_reports", "edit_approved_bp",
];

function isCamarimOnly(role: string, has: (p: string) => boolean) {
  const full = role === "admin" || role === "platform_admin";
  return !full && role !== "manager" && has("camarim_team") && !MANAGEMENT_PERMS.some(has);
}

export function accessByRole(role: string, perms: string[]): Set<AccessArea> {
  const has = (p: string) => perms.includes(p);
  const isAdmin = role === "admin" || role === "platform_admin";
  const mkt = role === "marketing_manager";
  const content = role === "content_manager";
  const erp = role !== "partner" && !isCamarimOnly(role, has) && !content && role !== "accountant";
  const crm = isAdmin || mkt || content;
  const audience = isAdmin || mkt;
  const out: Record<AccessArea, boolean> = {
    erp,
    operacao: erp && (isAdmin || has("view_operacao")),
    crm,
    audience,
    accounting: role === "accountant" || isAdmin,
    partner_portal: true, // PartnerLayout não tinha guarda de papel
    "settings.admin": isAdmin,
    "settings.users": isAdmin,
    "settings.permissions": isAdmin,
    "settings.backups": isAdmin,
    "settings.security": isAdmin,
    "settings.audit_log": isAdmin,
    "settings.trash": isAdmin,
    "settings.diagnostics": isAdmin,
    "settings.notifications": isAdmin,
    "settings.integrations.ticketing": isAdmin,
    "settings.integrations.meta": audience || crm,
    "settings.integrations.google": audience || crm,
    "settings.integrations.tiktok": audience,
    "settings.portal": crm,
    "settings.bp_tools": erp && (isAdmin || role === "manager"),
    "settings.audit_accounts": erp && (isAdmin || role === "manager"),
    "settings.accounts": erp && (isAdmin || role === "manager"),
    "settings.chart_of_accounts": erp && isAdmin,
    "settings.ticket_offices": erp && (isAdmin || has("manage_accounts")),
  };
  return new Set(ACCESS_AREAS.filter((a) => out[a]));
}

export function accessByPermission(role: string, perms: string[]): Set<AccessArea> {
  const has = (p: string) => perms.includes(p);
  const erp = (has("module.erp") || has("module.operacao")) && !isCamarimOnly(role, has);
  const crm = has("module.crm");
  const audience = has("module.audience");
  const out: Record<AccessArea, boolean> = {
    erp,
    operacao: erp && has("module.operacao"),
    crm,
    audience,
    accounting: has("module.accounting"),
    partner_portal: has("module.partner_portal"),
    "settings.admin": has("settings.admin"),
    "settings.users": has("settings.users"),
    "settings.permissions": has("settings.permissions"),
    "settings.backups": has("settings.backups"),
    "settings.security": has("settings.security"),
    "settings.audit_log": has("settings.audit_log"),
    "settings.trash": has("settings.trash"),
    "settings.diagnostics": has("settings.diagnostics"),
    "settings.notifications": has("settings.notifications"),
    "settings.integrations.ticketing": has("settings.integrations.ticketing"),
    "settings.integrations.meta": (audience || crm) && has("settings.integrations.meta"),
    "settings.integrations.google": (audience || crm) && has("settings.integrations.google"),
    "settings.integrations.tiktok": audience && has("settings.integrations.tiktok"),
    "settings.portal": crm && has("settings.portal"),
    "settings.bp_tools": erp && has("settings.bp_tools"),
    "settings.audit_accounts": erp && has("settings.audit_accounts"),
    "settings.accounts": erp && has("settings.accounts"),
    "settings.chart_of_accounts": erp && has("settings.chart_of_accounts"),
    "settings.ticket_offices": erp && has("settings.ticket_offices"),
  };
  return new Set(ACCESS_AREAS.filter((a) => out[a]));
}

/** Destino pós-login decidido só pelas chaves module.* (F2b). */
export function moduleLanding(role: string, perms: string[]): string | null {
  const a = accessByPermission(role, perms);
  const has = (p: string) => perms.includes(p);
  const mods: string[] = [];
  if (a.has("erp")) mods.push(has("module.erp") ? "/erp" : "/operacao/campo");
  if (a.has("crm")) mods.push("/crm");
  if (a.has("audience")) mods.push("/audience/dashboard");
  if (a.has("accounting")) mods.push("/contabilidade");
  if (a.has("partner_portal")) mods.push("/parceiro");
  if (mods.length === 0) return null;
  if (mods.length === 1) return mods[0];
  return "/modulos";
}

export function countModules(role: string, perms: string[]): number {
  const a = accessByPermission(role, perms);
  return (["erp", "crm", "audience", "accounting", "partner_portal"] as const).filter((m) => a.has(m)).length;
}

export function isCamarimOnlyUser(role: string, perms: string[]): boolean {
  return isCamarimOnly(role, (p) => perms.includes(p));
}

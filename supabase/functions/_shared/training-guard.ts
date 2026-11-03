/** #562: no network/provider dependencies; unknown company state fails closed. */
export interface TrainingClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: string): any;
}

export class TrainingCompanyError extends Error {
  readonly status = 403;
  readonly body = { error: "training_company" } as const;
  constructor() { super("training_company"); this.name = "TrainingCompanyError"; }
}

export async function isTrainingCompany(sb: TrainingClient, companyId: string | null | undefined): Promise<boolean> {
  // Existing global reminders/auth messages keep their global semantics.
  if (companyId == null) return false;
  if (!companyId.trim()) throw new Error("training_company_lookup_failed");
  try {
    const { data, error } = await sb.rpc("is_training_company", { _company_id: companyId });
    if (!error && typeof data === "boolean") return data;
  } catch { /* Older PostgREST schema cache: use the canonical row below. */ }
  const { data, error } = await sb.from("companies").select("is_training").eq("id", companyId).maybeSingle();
  if (error || typeof data?.is_training !== "boolean") throw new Error("training_company_lookup_failed");
  return data.is_training;
}

export async function assertNotTraining(sb: TrainingClient, companyId: string | null | undefined): Promise<void> {
  if (await isTrainingCompany(sb, companyId)) throw new TrainingCompanyError();
}

/** CAPI uses one atomic server decision for company scope AND consent. Migration
 * 0308 adds the training predicate to this existing server-side proof function.
 * Keeping the decision together also covers the member→selected lead path. */
export async function trainingSafeConsentBinding(
  sb: TrainingClient,
  binding: { p_subject: string; p_event: number; p_company: string; p_portal: string; p_captured_at: string },
): Promise<boolean> {
  const { data, error } = await sb.rpc("marketing_consent_binding_valid", binding);
  if (error) return false;
  return (Array.isArray(data) ? data[0] : data) === true;
}

// rg evidence: historical notify_sync_action_needed was dropped in 20260918163626;
// run_operacao_sla_escalator has tenant targets and must resolve their company.
// No current tenant-free caller was found: the allowlist is deliberately empty.
export const GLOBAL_PUSH_SYSTEM_SENDERS: readonly string[] = [];

export async function assertPushOrigin(
  sb: TrainingClient,
  companyId: string | null | undefined,
  isServiceRole: boolean,
  systemSender?: string,
): Promise<void> {
  if (companyId) return assertNotTraining(sb, companyId);
  if (isServiceRole && systemSender && GLOBAL_PUSH_SYSTEM_SENDERS.includes(systemSender)) return;
  throw new TrainingCompanyError();
}

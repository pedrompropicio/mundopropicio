/** #562: shared boundary; no environment, credentials or network at import time. */
export interface TrainingClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
}

export class TrainingCompanyError extends Error {
  readonly status = 403;
  readonly body = { error: 'training_company' } as const;
  constructor() {
    super('training_company');
    this.name = 'TrainingCompanyError';
  }
}

/** Only the absent RPC is compatible with an edge promoted before 0327.
 * Permissions, outages and malformed responses fail closed. NULL origins are global.
 */
export async function isTrainingCompany(
  sb: TrainingClient,
  companyId: string | null | undefined,
  warn: (message: string) => void = console.warn,
): Promise<boolean> {
  if (companyId == null) return false;
  const { data, error } = await sb.rpc('is_training_company', { _company_id: companyId });
  if (error) {
    if (error.code === 'PGRST202' || (error.code === '42883' && /is_training_company/.test(error.message ?? ''))) {
      warn('[training-guard] is_training_company absent; 0327 pending');
      return false;
    }
    throw new Error(`training_guard_unavailable: ${error.code ?? 'unknown'}`);
  }
  if (data == null) return false; // Legacy empty RPC result before schema publication.
  if (typeof data !== 'boolean') throw new Error('training_guard_invalid_response');
  return data;
}

export async function assertNotTraining(sb: TrainingClient, companyId: string | null | undefined): Promise<void> {
  if (await isTrainingCompany(sb, companyId)) throw new TrainingCompanyError();
}

/**
 * #338 / Lote A (#435) — quem vê o botão de apagar anexo/comprovativo.
 *
 * Decisão só de UI: a autoridade é da edge `delete-transaction-document`.
 * As permissões do cliente (`useAuth().permissions`) resolvem-se pela empresa
 * ACTIVA; por isso, se o documento é de outra empresa que não a activa, o botão
 * esconde-se (a permissão na empresa activa não diz nada sobre a dona).
 * Platform admin vê sempre.
 */
export const DELETE_TRANSACTION_DOCUMENTS = "delete_transaction_documents";

export interface CanShowDeleteDocumentInput {
  /** Permissões efectivas do utilizador na empresa activa. */
  permissions: readonly string[];
  isPlatformAdmin: boolean;
  /** Empresa dona do documento (transactions.company_id), se conhecida. */
  ownerCompanyId?: string | null;
  /** Empresa activa do utilizador, se conhecida. */
  activeCompanyId?: string | null;
}

export function canShowDeleteDocumentButton({
  permissions,
  isPlatformAdmin,
  ownerCompanyId,
  activeCompanyId,
}: CanShowDeleteDocumentInput): boolean {
  if (isPlatformAdmin) return true;
  if (ownerCompanyId && activeCompanyId && ownerCompanyId !== activeCompanyId) return false;
  return permissions.includes(DELETE_TRANSACTION_DOCUMENTS);
}

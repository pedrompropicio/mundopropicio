/**
 * Documentos do APURAMENTO de bilheteira (tabela ticket_office_statement_documents).
 * Os documentos da Ticketline (apuramento, fatura, mapa de vendas) pertencem ao
 * apuramento, não a cada fecho; o document_url do fecho é outra coisa e não se toca.
 *
 * Caminho obrigatório de upload: <company_id>/statements/<statement_id>/<timestamp>_<nome>.
 * O 1.º segmento TEM de ser o company_id — é o que a política RESTRICTIVE
 * company_isolation_ticket_office_settlements_* exige (storage_path_belongs_to_current_company).
 * Nunca usar o id da conta da bilheteira como 1.º segmento.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentCompanyId } from "@/hooks/useCompany";
import { deleteStorageObject } from "@/lib/storage-delete";

export const STATEMENT_DOCS_BUCKET = "ticket-office-settlements";

export type StatementDocumentSource = "apuramento" | "fatura" | "mapa_vendas" | "outro";

export const STATEMENT_DOCUMENT_SOURCE_LABEL: Record<StatementDocumentSource, string> = {
  apuramento: "Apuramento",
  fatura: "Fatura",
  mapa_vendas: "Mapa de vendas",
  outro: "Outro",
};

export const STATEMENT_DOCUMENT_SOURCES = Object.keys(STATEMENT_DOCUMENT_SOURCE_LABEL) as StatementDocumentSource[];

export interface StatementDocument {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  document_source: StatementDocumentSource;
  created_at: string;
}

export const STATEMENT_DOCUMENTS_EMBED =
  "ticket_office_statement_documents!ticket_office_statement_documents_statement_id_fkey(id, file_path, file_name, mime_type, file_size, document_source, created_at)";

export const sourceLabel = (s: string) => STATEMENT_DOCUMENT_SOURCE_LABEL[s as StatementDocumentSource] ?? s;

const safeName = (name: string) =>
  (name || "ficheiro")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "ficheiro";

export function buildStatementDocumentPath(companyId: string, statementId: string, fileName: string, ts = Date.now()): string {
  if (!companyId) throw new Error("Sem empresa ativa — não é possível guardar o documento.");
  return `${companyId}/statements/${statementId}/${ts}_${safeName(fileName)}`;
}

/** Caminho fora da pasta da empresa ativa (ex.: <account_id>/…, caminho antigo). */
export const isLegacyStatementPath = (path: string, companyId: string | null) =>
  !companyId || path.split("/")[0] !== companyId;

export async function uploadStatementDocument(params: {
  statementId: string;
  file: File;
  source: StatementDocumentSource;
  userId?: string | null;
}): Promise<StatementDocument> {
  if (!STATEMENT_DOCUMENT_SOURCES.includes(params.source)) throw new Error("Natureza do documento inválida.");
  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("Sem empresa ativa — não é possível guardar o documento.");
  const path = buildStatementDocumentPath(companyId, params.statementId, params.file.name);
  const { error: upErr } = await supabase.storage
    .from(STATEMENT_DOCS_BUCKET)
    .upload(path, params.file, { contentType: params.file.type || undefined, upsert: false });
  if (upErr) throw new Error(`Falha ao carregar o ficheiro: ${upErr.message}`);
  const { data, error } = await (supabase as any)
    .from("ticket_office_statement_documents")
    .insert({
      statement_id: params.statementId,
      company_id: companyId,
      file_path: path,
      file_name: params.file.name,
      mime_type: params.file.type || "application/octet-stream",
      file_size: params.file.size,
      document_source: params.source,
      created_by: params.userId ?? null,
    })
    .select("id, file_path, file_name, mime_type, file_size, document_source, created_at")
    .single();
  if (error) {
    // Linha não gravada: arquiva o ficheiro acabado de carregar (nunca DELETE directo, #265).
    await deleteStorageObject(STATEMENT_DOCS_BUCKET, path, {
      reason: "rollback upload documento de apuramento",
      related_table: "ticket_office_statement_documents",
    }).catch(() => undefined);
    throw new Error(`Falha ao registar o documento: ${error.message}`);
  }
  return data as StatementDocument;
}

/**
 * Remove a linha; só arquiva o ficheiro se nenhuma outra referência o usar
 * (outras linhas, document_url de apuramentos ou de fechos). Ordem #265.
 */
export async function removeStatementDocument(doc: Pick<StatementDocument, "id" | "file_path">): Promise<void> {
  const { data, error } = await (supabase as any)
    .from("ticket_office_statement_documents")
    .delete()
    .eq("id", doc.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Sem permissão para remover este documento.");
  const [a, b, c] = await Promise.all([
    (supabase as any).from("ticket_office_statement_documents").select("id").eq("file_path", doc.file_path).limit(1),
    (supabase as any).from("ticket_office_statements").select("id").eq("document_url", doc.file_path).limit(1),
    (supabase as any).from("ticket_office_settlements").select("id").eq("document_url", doc.file_path).limit(1),
  ]);
  const referenced = [a, b, c].some((r: any) => r.error || (r.data?.length ?? 0) > 0);
  if (referenced) return;
  await deleteStorageObject(STATEMENT_DOCS_BUCKET, doc.file_path, {
    reason: "remover documento de apuramento",
    related_table: "ticket_office_statement_documents",
    related_id: doc.id,
  });
}

export const LEGACY_PATH_MESSAGE =
  "Não foi possível abrir: o ficheiro está num caminho antigo que as regras de acesso não permitem. Só um administrador da plataforma o consegue abrir até o ficheiro ser movido.";

/** Abre por URL assinado. Devolve a mensagem de erro (para mostrar), ou null se abriu. */
export async function openStatementDocument(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(STATEMENT_DOCS_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    const companyId = await getCurrentCompanyId().catch(() => null);
    if (isLegacyStatementPath(path, companyId)) return LEGACY_PATH_MESSAGE;
    return `Não foi possível abrir o documento: ${error?.message ?? "sem permissão"}.`;
  }
  window.open(data.signedUrl, "_blank");
  return null;
}

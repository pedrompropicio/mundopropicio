import { AnalysisError, ANALYSIS_LIMITS, validateAnalysisInput, validateAnalysisReport, type AnalysisTurn, type AnalysisReport } from "../_shared/data-entry-analysis.ts";
import { allowedRole, stagingPath, validateDocument, sha256, type DocumentType } from "./core.ts";

export type AnalysisState = { session: { id: string; owner_id: string; company_id: string }; company: { id: string; tax_id: string | null }; documents: { id: string; sha256: string; size_bytes: number; mime: DocumentType; path: string; name: string }[] };
export type AnalysisScope = { user: string; company: string; role: string; preparation: boolean };
export interface AnalysisDependencies {
  enabled: boolean;
  /** Must be backed by a durable server record before enabling real provider calls. */
  providerReady: boolean;
  scope(): Promise<AnalysisScope>;
  load(session: string): Promise<AnalysisState>;
  download(path: string): Promise<Uint8Array | null>;
  generate(input: { bytes: Uint8Array; mime: DocumentType; message: string; history: AnalysisTurn[]; signal: AbortSignal }): Promise<unknown>;
}

export async function analyzeDocument(d: AnalysisDependencies, request: { session: string; document: string; message: string; history: AnalysisTurn[]; signal: AbortSignal }): Promise<AnalysisReport> {
  if (!d.enabled) throw new AnalysisError("A análise documental ainda não está ativada.", 503);
  if (!d.providerReady) throw new AnalysisError("Análise documental indisponível: configuração e validação do serviço pendentes.", 503);
  validateAnalysisInput(request.message, request.history);
  const before = await d.scope();
  if (!allowedRole(before.role) || !before.preparation) throw new AnalysisError("Sem acesso à análise neste contexto.", 403);
  const state = await d.load(request.session);
  if (state.session.id !== request.session || state.session.owner_id !== before.user || state.session.company_id !== before.company || state.company.id !== before.company) throw new AnalysisError("Lote indisponível nesta sessão e empresa.", 403);
  const doc = state.documents.find((x) => x.id === request.document);
  if (!doc || doc.path !== stagingPath(before.company, request.session, doc.sha256)) throw new AnalysisError("Documento indisponível neste lote.", 403);
  if (!Number.isInteger(doc.size_bytes) || doc.size_bytes < 1 || doc.size_bytes > ANALYSIS_LIMITS.documentBytes) throw new AnalysisError("Análise limitada a documentos até 5 MiB. Revê este documento manualmente.", 413);
  // Copy scalar binding before awaits; injected stores must not mutate the baseline by reference.
  const binding = { id: doc.id, sha: doc.sha256, path: doc.path, size: doc.size_bytes, mime: doc.mime, tax: state.company.tax_id };
  const data = await d.download(doc.path);
  if (!data || data.length !== doc.size_bytes || await sha256(data) !== doc.sha256) throw new AnalysisError("Documento indisponível ou alterado.", 409);
  try { validateDocument(data, doc.mime); } catch { throw new AnalysisError("Tipo, tamanho ou conteúdo do documento inválido."); }
  if (request.signal.aborted) throw new AnalysisError("Análise cancelada.", 499);
  const raw = await d.generate({ bytes: data, mime: doc.mime, message: request.message, history: request.history, signal: request.signal });
  const after = await d.scope();
  const current = await d.load(request.session);
  const currentDoc = current.documents.find((x) => x.id === doc.id);
  if (request.signal.aborted) throw new AnalysisError("Análise cancelada.", 499);
  if (after.user !== before.user || after.company !== before.company || !allowedRole(after.role) || !after.preparation || current.session.id !== request.session || current.session.owner_id !== before.user || current.session.company_id !== before.company || current.company.id !== before.company || current.company.tax_id !== binding.tax || currentDoc?.sha256 !== binding.sha || currentDoc?.path !== binding.path || currentDoc?.size_bytes !== binding.size || currentDoc?.mime !== binding.mime) throw new AnalysisError("Contexto alterado. A resposta foi descartada; nenhum dado foi confirmado.", 409);
  return validateAnalysisReport(raw, { document_id: binding.id, document_sha256: binding.sha, company_id: before.company, company_tax: binding.tax });
}
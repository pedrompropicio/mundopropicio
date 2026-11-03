import { AdsContractError, decimalFromDatabase, requireThat, revision, rpcResult, uuid, type RpcPort } from './ads-invoice-generation.ts';
export type AdsPlatform = 'meta' | 'google' | 'tiktok';
export interface ExtractedIdentity { supplier_nif: string; customer_nif: string; account_id: string; currency: string; invoice_number: string }
export interface SourceIdentity { supplier_id: string; supplier_nif: string; connection_id: string; account_id: string; platform: AdsPlatform; invoice_number: string; sha256: string }
export interface SourceLine { line_no: number; raw_description: string; placement: string | null; campaign_name: string | null;
  external_campaign_id: string | null; amount: string; is_adjustment: boolean }
export interface SourceHeader { company_id: string; platform: AdsPlatform; invoice_number: string; currency: string; billing_period: string;
  issue_date: string | null; total_amount: string; lines_sum: string; source: 'pdf'; source_ref: string | null; file_path: string | null }
/** Conservative complementary extractor. Unknown operational layouts stay blocked.
 * Supplier/customer tax identities and advertising/bank accounts are never interchangeable.
 * Separators remain significant. No fixed identifiers, name or historical-use matching.
 */
export function extractSourceIdentity(rows: {tokens: {text: string}[]}[]): ExtractedIdentity {
  const fields: Record<keyof ExtractedIdentity, Set<string>> = {supplier_nif:new Set(),customer_nif:new Set(),account_id:new Set(),currency:new Set(),invoice_number:new Set()};
  const labels: [keyof ExtractedIdentity, RegExp][] = [
    ['supplier_nif',/^(?:Supplier|Seller|Fornecedor)\s+(?:VAT(?:\s+(?:ID|Number))?|NIF|Tax\s+ID)\s*:\s*(\S+)$/i],
    ['customer_nif',/^(?:Customer|Buyer|Adquirente)\s+(?:VAT(?:\s+(?:ID|Number))?|NIF|Tax\s+ID)\s*:\s*(\S+)$/i],
    ['account_id',/^(?:Ad(?:vertising)?\s+Account\s+ID|Advertiser\s+ID|Customer\s+ID)\s*:\s*([A-Za-z0-9_-]+)$/i],
    ['currency',/^(?:Currency|Moeda)\s*:\s*([A-Z]{3})$/],
    ['invoice_number',/^(?:Invoice\s*(?:Number|No\.?|#)|Fatura)\s*:\s*([A-Za-z0-9_./-]+)$/i],
  ];
  for (const row of rows) {
    const line = row.tokens.map(t => t.text).join(' ').replace(/[\u00a0\u2009\u202f]/g,' ').replace(/\s+/g,' ').trim();
    for (const [key,re] of labels) { const m = line.match(re); if (m) fields[key].add(m[1]); }
  }
  const missing = Object.entries(fields).filter(([,s]) => s.size !== 1).map(([key,s]) => `${key}:${s.size ? 'ambiguous' : 'missing'}`);
  if (missing.length) throw new AdsContractError('financial_source_required',{fields:missing});
  return Object.fromEntries(Object.entries(fields).map(([key,set]) => [key,[...set][0]])) as unknown as ExtractedIdentity;
}
export function resolveSourceIdentity(extracted: ExtractedIdentity, header: SourceHeader, digest: string,
  suppliers: {id: string; company_id: string; nif: string | null; is_active: boolean}[],
  connections: {id: string; company_id: string; platform: string; status: string; selected_ad_account_id: string | null}[], customerTaxId: string | null): SourceIdentity {
  requireThat(extracted.invoice_number === header.invoice_number && extracted.currency === header.currency,'source_attestation_invalid');
  requireThat(customerTaxId && extracted.customer_nif === customerTaxId,'financial_source_required');
  const vendor = suppliers.filter(s => s.company_id === header.company_id && s.is_active && s.nif === extracted.supplier_nif);
  const link = connections.filter(c => c.company_id === header.company_id && c.platform === header.platform && c.status === 'active' && c.selected_ad_account_id === extracted.account_id);
  requireThat(vendor.length === 1 && link.length === 1,'financial_source_required');
  requireThat(/^[0-9a-f]{64}$/.test(digest));
  return {supplier_id:uuid(vendor[0].id),supplier_nif:extracted.supplier_nif,connection_id:uuid(link[0].id),account_id:extracted.account_id,platform:header.platform,invoice_number:header.invoice_number,sha256:digest};
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
}
function lineIdentity(line: Record<string,any>) {
  return JSON.stringify([line.raw_description,line.placement,line.campaign_name,line.external_campaign_id,decimalFromDatabase(line.amount),line.is_adjustment]);
}
/** Header + full multiset, including null/empty and separators, bound to the returned revision. */
export function assertPersistedSource(header: SourceHeader, lines: SourceLine[], stored: Record<string,any>, storedLines: Record<string,any>[]) {
  for (const k of ['company_id','platform','invoice_number','currency','billing_period','issue_date','source']) requireThat(header[k] === stored[k],'source_attestation_invalid');
  for (const k of ['total_amount','lines_sum']) requireThat(header[k] === decimalFromDatabase(stored[k]),'source_attestation_invalid');
  const expected = lines.map(lineIdentity).sort(); const actual = storedLines.map(lineIdentity).sort();
  requireThat(JSON.stringify(expected) === JSON.stringify(actual),'source_attestation_invalid');
}
export interface ArchivePort { download(path: string): Promise<Uint8Array | null>; upload(path: string, bytes: Uint8Array): Promise<void> }
/** Content addressed, write-once archive with byte readback, including an upload-response failure. */
export async function archiveSource(port: ArchivePort, company: string, bytes: Uint8Array): Promise<{path: string; sha256: string}> {
  uuid(company); requireThat(bytes.length > 4 && bytes.length <= 20 * 1024 * 1024 && new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-','source_attestation_invalid');
  const digest = await sha256(bytes); const path = `${company}/faturas/source/${digest}.pdf`;
  if (!(await port.download(path))) { try { await port.upload(path,bytes); } catch (error) { if (!(await port.download(path))) throw error; } }
  const readback = await port.download(path); requireThat(readback && await sha256(readback) === digest,'document_digest_mismatch');
  return {path,sha256:digest};
}

export function extractSourceCurrency(rows: {tokens: {text: string}[]}[]): string {
  const found = new Set(rows.flatMap(r => { const m = r.tokens.map(t => t.text).join(' ').trim().match(/^(?:Currency|Moeda)\s*:\s*([A-Z]{3})$/); return m ? [m[1]] : []; }));
  requireThat(found.size === 1,'currency_mismatch'); return [...found][0];
}
export interface SourceImportPort {
  caller: RpcPort; admin: RpcPort; archive: ArchivePort;
  read(invoiceId: string): Promise<{invoice: Record<string,any>; lines: Record<string,any>[]}>;
  identity(header: SourceHeader, digest: string): Promise<SourceIdentity>;
}
/** Import validates user/tenant/gate before archiving. Failure preserves the proposal for retry. */
export async function importAndAttest(port: SourceImportPort, header: SourceHeader, lines: SourceLine[], bytes: Uint8Array) {
  const digest = await sha256(bytes); const path = `${uuid(header.company_id)}/faturas/source/${digest}.pdf`;
  header = {...header,file_path:path};
  const imported = await rpcResult(port.caller,'ads_invoice_import_v1',{p_invoice:header,p_lines:lines});
  requireThat(imported.contract_version === 1,'contract_unavailable'); uuid(imported.invoice_id); revision(imported.revision);
  const archived = await archiveSource(port.archive,header.company_id,bytes);
  const persisted = await port.read(imported.invoice_id);
  requireThat(persisted.invoice.generation_revision === imported.revision,'revision_conflict');
  assertPersistedSource(header,lines,persisted.invoice,persisted.lines);
  const attestationPath=persisted.invoice.file_path;
  requireThat(typeof attestationPath === 'string' && attestationPath.startsWith(`${header.company_id}/`) && !attestationPath.includes('..'),'source_attestation_invalid');
  // Identical legacy imports intentionally keep their old path. Prove its existing bytes
  // rather than replacing it or discarding retained references to manufacture equivalence.
  if (attestationPath !== archived.path) {
    const retained=await port.archive.download(attestationPath);
    requireThat(retained && await sha256(retained) === digest,'source_attestation_invalid');
  }
  // Applied identical import is terminal and must not invalidate the frozen proof.
  if (persisted.invoice.source_file_sha256 === digest && persisted.invoice.source_attestation?.sha256 === digest) return {...imported,source_verified:true};
  let identity: SourceIdentity;
  try { identity = await port.identity(header,digest); }
  catch (error) { if (error instanceof AdsContractError && error.code === 'financial_source_required') return {...imported,source_verified:false,source_blocker:error.code,source_details:error.details}; throw error; }
  const attested = await rpcResult(port.admin,'ads_invoice_source_attest_v1',{p_invoice_id:imported.invoice_id,p_expected_revision:imported.revision,
    p_source:{company_id:header.company_id,bucket:'ads-invoices',path:attestationPath,sha256:digest,identity}});
  requireThat(attested.contract_version === 1 && attested.invoice_id === imported.invoice_id,'contract_unavailable'); revision(attested.revision);
  return {...imported,revision:attested.revision,source_verified:true};
}

/** Shared attempt protocol. Transport executes reviewed typed RPCs with canonical identity. */
export type Attempt = { id: string; hash: string; state: 'prepare'|'authorized'|'inprogress'|'completed'|'review'; path: string;
  result: Record<string, unknown>|null; current: Record<string, unknown>|null; record_ok: boolean;
  document: { sha256: string; size_bytes: number; mime: string } };
export type AttemptTransport = {
  rpc(action: 'prepare'|'authorize'|'begin'|'commit'|'check'|'confirm_new_intent', id: string|null, envelope: Record<string, unknown>|null, hash: string|null): Promise<Attempt>;
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  /** Must read stored bytes and issue service-only receipt, never trust browser checksum. */
  verifyReceipt(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  read(path: string): Promise<Uint8Array|null>;
};
export async function documentHash(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function checkAttempt(t: AttemptTransport, a: Attempt): Promise<{status:'conferido'|'pendente';attempt:Attempt}> {
  const current=await t.rpc('check',a.id,null,a.hash);
  if(current.id!==a.id || current.hash!==a.hash) throw new Error('Tentativa divergente');
  const stored=current.state==='completed'?await t.read(current.path):null;
  const ok=current.record_ok && stored!==null && stored.length===current.document.size_bytes && await documentHash(stored)===current.document.sha256;
  return {status:ok?'conferido':'pendente',attempt:current};
}
/** No automatic retries. Same-ID recovery goes through SQL proof under the attempt lock. */
export async function executeAttempt(t: AttemptTransport, a: Attempt, bytes: Uint8Array) {
  if(bytes.length!==a.document.size_bytes || await documentHash(bytes)!==a.document.sha256) throw new Error('Documento divergente');
  if(a.state==='completed') return checkAttempt(t,a);
  if(a.state==='review') return {status:'pendente' as const,attempt:a};
  try {
    let claim=await t.rpc('authorize',a.id,null,a.hash);
    if(claim.id!==a.id || claim.hash!==a.hash || !['authorized','inprogress','completed'].includes(claim.state)) throw new Error('Reserva não autorizada');
    if(claim.state==='completed') return checkAttempt(t,claim);
    // Authorized persistent reservation precedes every upload, including retry conflicts.
    await t.upload(claim.path,bytes,claim.document.mime);
    await t.verifyReceipt(claim.path,bytes,claim.document.mime);
    claim=await t.rpc('begin',claim.id,null,claim.hash);
    await t.rpc('commit',claim.id,null,claim.hash);
    return await checkAttempt(t,claim);
  } catch {
    // A transport failure is not rollback. Check only; never blind replay/delete.
    try { return await checkAttempt(t,a); } catch { return {status:'pendente' as const,attempt:a}; }
  }
}
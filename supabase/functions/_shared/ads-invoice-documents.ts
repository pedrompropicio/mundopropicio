import { buildPdf, type PdfOp } from './simple-pdf.ts';
import { AdsContractError, requireThat, type DocumentTask, type MaintenanceTask, type Operation } from './ads-invoice-generation.ts';
import { sha256, type ArchivePort } from './ads-invoice-source.ts';

/** Proof from the frozen server snapshot, retaining signed source parcels. No allocation engine. */
export function buildInvoiceProof(operation: Operation, task: DocumentTask, descriptions: Record<string,string>): Uint8Array {
  const child = operation.result_snapshot.children.find(c => task.key === `proof:${c.key}` && task.transaction_id === c.transaction_id);
  requireThat(child && task.is_accounting === false,'request_conflict');
  requireThat(child.source_line_allocations.every(a => typeof descriptions[a.line_id] === 'string'),'source_attestation_invalid');
  const rows = ['Comprovativo de veiculação',`Operação: ${operation.id}`,`Lançamento: ${task.transaction_id}`,
    `Destino: ${child.destination} / ${child.event_id ?? 'empresa'}`,`BP: ${child.forecast_id ?? child.new_forecast_key ?? 'sem BP'}`,
    ...child.source_line_allocations.flatMap(a => [descriptions[a.line_id] ?? `Linha: ${a.line_id}`,`${a.prorated ? 'Ajuste proporcional' : 'Parcela integral'}: ${a.amount} EUR`]),
    `Total do comprovativo: ${child.amount} EUR`,`Fonte SHA256: ${operation.result_snapshot.source.sha256}`];
  const wrapped = rows.flatMap(row => row.match(/.{1,86}/gu) ?? ['']); const pages: PdfOp[][] = [];
  for (let start=0;start<wrapped.length;start+=45) pages.push(wrapped.slice(start,start+45).map((text,i) => ({kind:'text',x:35,y:45+i*16,size:10,text})));
  return buildPdf(pages);
}
export interface DocumentPort {
  storage(bucket: string): ArchivePort;
  current(): Promise<Operation>;
  descriptions(lineIds: string[]): Promise<Record<string,string>>;
  complete(operation: string, key: string, payload: Record<string,unknown>): Promise<unknown>;
}
/** Write-once paths/readback/callback permit redelivery across instances, without an in-memory mutex. */
export async function resumeDocuments(port: DocumentPort, operation: Operation, retryErrors = false) {
  requireThat(operation.state !== 'reverted','revert_blocked');
  for (const task of operation.documents) {
    if (task.status === 'error' && !retryErrors) return {pending:true,error_code:task.error_code};
    const current = await port.current(); requireThat(current.id === operation.id && current.state !== 'reverted','revert_blocked');
    const liveTask = current.documents.find(t => t.key === task.key);
    requireThat(liveTask && liveTask.path === task.path && liveTask.transaction_id === task.transaction_id,'request_conflict');
    const source = operation.result_snapshot.source;
    try {
      let bytes: Uint8Array;
      if (task.key === 'original') {
        const original = await port.storage(source.bucket).download(source.path);
        requireThat(original && await sha256(original) === source.sha256,'document_digest_mismatch'); bytes = original;
      } else {
        const child = operation.result_snapshot.children.find(c => `proof:${c.key}` === task.key); requireThat(child,'request_conflict');
        bytes = buildInvoiceProof(operation,task,await port.descriptions(child.source_line_allocations.map(a => a.line_id)));
      }
      const digest = await sha256(bytes); const storage = port.storage(task.bucket); let existing = await storage.download(task.path);
      if (!existing) { try { await storage.upload(task.path,bytes); } catch (e) { if (!(await storage.download(task.path))) throw e; } }
      existing = await storage.download(task.path); requireThat(existing && await sha256(existing) === digest,'document_digest_mismatch');
      await port.complete(operation.id,task.key,{company_id:operation.company_id,transaction_id:task.transaction_id,bucket:task.bucket,path:task.path,status:'complete',sha256:digest});
    } catch (error) {
      // Interrupted callbacks may have committed. Read before recording an error.
      const after = await port.current(); if (after.state === 'reverted') throw new AdsContractError('revert_blocked');
      if (after.documents.find(d => d.key === task.key)?.status === 'complete') {
        if (error instanceof AdsContractError && error.code === 'document_digest_mismatch') throw error;
        continue;
      }
      const code = error instanceof AdsContractError && error.code === 'document_digest_mismatch' ? error.code : 'document_io_failed';
      await port.complete(operation.id,task.key,{company_id:operation.company_id,transaction_id:task.transaction_id,bucket:task.bucket,path:task.path,status:'error',error_code:code});
      return {pending:true,error_code:code};
    }
  }
  return {pending:false};
}
/** Claim must be durable: D1 list/ack alone does not exclude concurrent workers.
 * Production has no claim adapter yet and cannot call this consumer. */
export interface MaintenancePort {
  head(): Promise<MaintenanceTask | null>; claim(task: MaintenanceTask): Promise<boolean>;
  effect(task: MaintenanceTask, idempotencyKey: string): Promise<void>;
  verify(task: MaintenanceTask, idempotencyKey: string): Promise<boolean>;
  ack(task: MaintenanceTask, status: 'complete' | 'error', error: string | null): Promise<void>;
}
export async function consumeMaintenance(port: MaintenancePort) {
  for (let n=0;n<2048;n++) {
    const task = await port.head(); if (!task) return {pending:false};
    if (task.status !== 'pending') return {pending:true,error_code:task.error_code};
    if (!(await port.claim(task))) return {pending:true,error_code:'maintenance_busy'};
    const key = `${task.invoice_id}:${task.task_id}:${task.action}`;
    try {
      if (!(await port.verify(task,key))) await port.effect(task,key);
      requireThat(await port.verify(task,key),'maintenance_effect_unverified');
    } catch { await port.ack(task,'error','maintenance_effect_failed'); return {pending:true,error_code:'maintenance_effect_failed'}; }
    // Ack failure redelivers the same effect; it is not an implicit retry of error.
    await port.ack(task,'complete',null);
  }
  return {pending:true,error_code:'maintenance_capacity'};
}

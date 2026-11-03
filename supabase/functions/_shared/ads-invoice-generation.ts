/** #486 D23: contrato partilhado. Só valida/transmite; o cálculo financeiro vive no RPC D1. */
export type Destination = 'event' | 'company' | 'outside' | 'carreira' | 'prorate';
export interface Allocation {
  key: string; line_id: string; destination: Destination; amount: string; observation: string;
  event_id?: string; forecast_id?: string; new_forecast_key?: string;
}
export interface NewForecast {
  key: string; event_id: string; category_id: string; description: string; specification: string | null;
  currency: string; amount: string; observation: string;
}
export interface PlanV1 { version: 1; allocations: Allocation[]; new_forecasts: NewForecast[]; budget_proposals: {forecast_id: string; new_amount: string}[] }
export interface Effect { effect_id: string; kind: 'create' | 'raise'; forecast_id: string | null; new_forecast_key: string | null;
  event_id: string; category_id: string; before: string; delta: string; after: string; description: string }
export interface Approval { effect_id: string; accepted: true; observation: string }
export interface Budget { event_id: string; category_id: string; forecast_id?: string | null; new_forecast_key?: string | null;
  current: string; committed: string; incoming: string; after: string; shortfall: string }
export interface Child { key: string; destination: 'event' | 'company' | 'carreira'; event_id: string | null;
  category_id: string; forecast_id: string | null; new_forecast_key: string | null; amount: string;
  source_line_allocations: { key: string; source_key: string | null; line_id: string; amount: string; prorated: boolean | null }[];
  transaction_id?: string }
export interface Preview { contract_version: 1; invoice_id: string; revision: number; generation_cycle: number; currency: string;
  preview_hash: string; allocations: unknown[]; children: Child[]; line_budgets: Budget[]; category_budgets: Budget[];
  effects: Effect[]; blockers: {code: string; reason?: string; [key: string]: unknown}[]; totals: {children: string; outside: string; invoice: string} }
export interface DocumentTask { key: string; transaction_id: string; bucket: string; path: string; name: string; doc_type: string;
  is_accounting: boolean; status: 'pending' | 'error' | 'complete'; document_id: string | null; error_code: string | null; sha256?: string }
export interface MaintenanceTask { task_id: string; company_id: string; invoice_id: string; action: 'lock_campaigns' | 'unlock_campaigns' | 'revert_cleanup';
  revision: number; generation_cycle: number; operation_id: string | null; resources: Record<string, unknown>;
  status: 'pending' | 'error' | 'complete'; attempt: number; error_code: string | null; receipts?: Record<string, unknown> }
export interface Operation { id: string; invoice_id: string; company_id: string; generation_cycle: number; request_key: string;
  state: 'financial_committed' | 'complete' | 'reverted'; plan_snapshot: PlanV1;
  result_snapshot: { parent: {id: string; amount: string}; children: Child[]; source: {bucket: string; path: string; sha256: string}; preview: Preview; [key: string]: unknown };
  documents: DocumentTask[]; [key: string]: unknown }
export interface OperationReply { contract_version: 1; invoice_id: string; revision: number; generation_cycle: number;
  operation: Operation | null; maintenance?: MaintenanceTask[]; already?: boolean }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MONEY = /^-?(0|[1-9][0-9]{0,11})\.[0-9]{2}$/;
const KEY = /^[A-Za-z0-9_-]{1,80}$/;
const HASH = /^[0-9a-f]{64}$/;
export class AdsContractError extends Error { constructor(public code: string, public details?: unknown) { super(code); } }
export function requireThat(ok: unknown, code = 'invalid_plan'): asserts ok { if (!ok) throw new AdsContractError(code); }
function obj(value: unknown): asserts value is Record<string, any> { requireThat(value && typeof value === 'object' && !Array.isArray(value)); }
function keys(v: unknown, allowed: string[], required = allowed): asserts v is Record<string, any> {
  obj(v); requireThat(Object.keys(v).every(k => allowed.includes(k)) && required.every(k => Object.prototype.hasOwnProperty.call(v, k)));
}
export function money(value: unknown): string { requireThat(typeof value === 'string' && MONEY.test(value)); return value; }
export function uuid(value: unknown): string { requireThat(typeof value === 'string' && UUID.test(value)); return value; }
export function revision(value: unknown): number { requireThat(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0); return value; }
const text = (v: unknown) => typeof v === 'string';
const nonempty = (v: unknown) => text(v) && (v as string).trim().length > 0;
function array(v: unknown): asserts v is any[] { requireThat(Array.isArray(v) && v.length <= 1000); }
const unique = (xs: any[], key: string) => requireThat(new Set(xs.map(x => x[key])).size === xs.length);
/** Conversão de representação apenas, sem arredondar ou aceitar centésimos fracionários. */
export function decimalFromDatabase(value: number | string): string {
  const raw = String(value); requireThat(/^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/.test(raw));
  const [whole, fraction = ''] = raw.split('.'); return money(`${whole}.${fraction.padEnd(2, '0')}`);
}
export function parsePlan(value: unknown): PlanV1 {
  keys(value, ['version','allocations','new_forecasts','budget_proposals']); requireThat(value.version === 1);
  for (const k of ['allocations','new_forecasts','budget_proposals']) array(value[k]);
  for (const a of value.allocations) {
    keys(a, ['key','line_id','destination','amount','observation','event_id','forecast_id','new_forecast_key'], ['key','line_id','destination','amount','observation']);
    requireThat(text(a.key) && KEY.test(a.key) && text(a.observation)); uuid(a.line_id); money(a.amount);
    requireThat(['event','company','outside','carreira','prorate'].includes(a.destination));
    if (a.destination === 'event') { uuid(a.event_id); requireThat(!!a.forecast_id !== !!a.new_forecast_key);
      if (a.forecast_id) uuid(a.forecast_id); if (a.new_forecast_key) requireThat(KEY.test(a.new_forecast_key));
    } else requireThat(!Object.prototype.hasOwnProperty.call(a,'event_id') && !Object.prototype.hasOwnProperty.call(a,'forecast_id') && !Object.prototype.hasOwnProperty.call(a,'new_forecast_key'));
    if (a.destination === 'outside') requireThat(nonempty(a.observation));
  }
  for (const n of value.new_forecasts) {
    keys(n, ['key','event_id','category_id','description','specification','currency','amount','observation']);
    requireThat(text(n.key) && KEY.test(n.key) && nonempty(n.description) && nonempty(n.observation));
    uuid(n.event_id); uuid(n.category_id); money(n.amount); requireThat(Number(n.amount) > 0 && /^[A-Z]{3}$/.test(n.currency));
    requireThat(n.specification === null || text(n.specification));
  }
  for (const b of value.budget_proposals) { keys(b,['forecast_id','new_amount']); uuid(b.forecast_id); money(b.new_amount); }
  unique(value.allocations,'key'); unique(value.new_forecasts,'key'); unique(value.budget_proposals,'forecast_id');
  requireThat(new TextEncoder().encode(JSON.stringify(value)).length <= 1048576);
  return value as PlanV1;
}
function envelope(v: unknown, invoiceId?: string): asserts v is Record<string, any> {
  obj(v); requireThat(v.contract_version === 1, 'contract_unavailable'); uuid(v.invoice_id);
  if (invoiceId) requireThat(v.invoice_id === invoiceId, 'request_conflict'); revision(v.revision); revision(v.generation_cycle);
}
export function parsePreview(value: unknown, invoiceId?: string): Preview {
  envelope(value,invoiceId);
  keys(value,['contract_version','invoice_id','revision','generation_cycle','currency','preview_hash','allocations','children','line_budgets','category_budgets','effects','blockers','totals']);
  requireThat(/^[A-Z]{3}$/.test(value.currency) && HASH.test(value.preview_hash));
  for (const k of ['allocations','children','line_budgets','category_budgets','effects','blockers']) requireThat(Array.isArray(value[k]));
  for (const c of value.children) { requireThat(nonempty(c.key) && ['event','company','carreira'].includes(c.destination)); money(c.amount); uuid(c.category_id);
    if (c.event_id !== null) uuid(c.event_id); if (c.forecast_id !== null) uuid(c.forecast_id);
    requireThat(Array.isArray(c.source_line_allocations)); for (const a of c.source_line_allocations) { uuid(a.line_id); money(a.amount); requireThat(text(a.key) && (a.prorated === null || typeof a.prorated === 'boolean')); }
  }
  for (const b of [...value.line_budgets,...value.category_budgets]) { uuid(b.event_id); uuid(b.category_id); for (const k of ['current','committed','incoming','after','shortfall']) money(b[k]); }
  for (const e of value.effects) { requireThat(nonempty(e.effect_id) && ['create','raise'].includes(e.kind) && text(e.description)); uuid(e.event_id); uuid(e.category_id); for (const k of ['before','delta','after']) money(e[k]); }
  unique(value.effects,'effect_id'); requireThat(value.blockers.every(b => b && nonempty(b.code)));
  keys(value.totals,['children','outside','invoice']); Object.values(value.totals).forEach(money);
  return value as Preview;
}
export function parseOperation(value: unknown, invoiceId?: string, companyId?: string): OperationReply {
  envelope(value,invoiceId); requireThat(Object.prototype.hasOwnProperty.call(value,'operation'));
  if (value.operation !== null) {
    const o = value.operation; obj(o); uuid(o.id); uuid(o.company_id); requireThat(o.invoice_id === value.invoice_id);
    if (companyId) requireThat(o.company_id === companyId,'forbidden'); revision(o.generation_cycle); uuid(o.request_key);
    requireThat(['financial_committed','complete','reverted'].includes(o.state)); parsePlan(o.plan_snapshot);
    obj(o.result_snapshot); parsePreview(o.result_snapshot.preview,value.invoice_id); uuid(o.result_snapshot.parent.id); money(o.result_snapshot.parent.amount);
    const source=o.result_snapshot.source; obj(source);
    requireThat(source.bucket === 'ads-invoices' && typeof source.path === 'string' && source.path.startsWith(`${o.company_id}/`) && !source.path.includes('..') && HASH.test(source.sha256),'source_attestation_invalid');
    requireThat(Array.isArray(o.result_snapshot.children) && Array.isArray(o.documents));
    for (const c of o.result_snapshot.children) {uuid(c.transaction_id);requireThat(o.result_snapshot.preview.children.some(p => p.key === c.key),'request_conflict');}
    requireThat(o.documents.length === o.result_snapshot.children.length+1 && o.documents.filter(d=>d.key==='original').length === 1,'request_conflict');
    for (const d of o.documents) { uuid(d.transaction_id); requireThat(nonempty(d.key) && nonempty(d.path) && d.bucket === 'transaction-documents' && ['pending','error','complete'].includes(d.status));
      requireThat(d.path.startsWith(`${o.company_id}/ads-invoices/operations/${o.id}/`) && !d.path.includes('..'));
      requireThat(d.is_accounting === (d.key === 'original') && d.doc_type === (d.key === 'original' ? 'fatura' : 'comprovativo_veiculacao'));
      if (d.key === 'original') requireThat(d.transaction_id === o.result_snapshot.parent.id);
      else requireThat(o.result_snapshot.children.some(c => d.key === `proof:${c.key}` && d.transaction_id === c.transaction_id));
      requireThat(nonempty(d.name)); if(d.status === 'complete')requireThat(HASH.test(d.sha256) && UUID.test(d.document_id));
    }
    unique(o.documents,'key'); unique(o.documents,'path');
  }
  return value as OperationReply;
}
export function validateApprovals(effects: Effect[], value: unknown): Approval[] {
  array(value); requireThat(value.length === effects.length,'approval_required');
  for (const a of value) { keys(a,['effect_id','accepted','observation']); requireThat(a.accepted === true && nonempty(a.observation) && effects.some(e => e.effect_id === a.effect_id),'approval_required'); }
  unique(value,'effect_id'); return [...value].sort((a,b) => a.effect_id < b.effect_id ? -1 : a.effect_id > b.effect_id ? 1 : 0) as Approval[];
}
export interface RpcPort { rpc(name: string, args: Record<string, unknown>): PromiseLike<{data: any; error: {code?: string; message: string; details?: string} | null}> }
export async function rpcResult(client: RpcPort, name: string, args: Record<string, unknown>): Promise<any> {
  const {data,error} = await client.rpc(name,args); if (error) throw new AdsContractError(error.message,{sqlstate:error.code,detail:error.details});
  requireThat(data !== null,'contract_unavailable'); return data;
}
/** JWT client is mandatory. Never substitutes a legacy financial writer on failure. */
export async function dispatchDecision(client: RpcPort, invoiceId: string, action: string, payload: Record<string, unknown>) {
  uuid(invoiceId);
  if (['operation','preview','save_plan','confirm','generate','set_split'].includes(action)) {
    const fields: Record<string,string[]> = {operation:[],preview:['expected_revision'],save_plan:['expected_revision','plan'],confirm:['expected_revision','preview_hash'],generate:['request_key','expected_revision','preview_hash','approvals'],set_split:['expected_revision','line_id','parts']};
    keys(payload,fields[action],action === 'preview' ? [] : fields[action]);
    if (action === 'save_plan') parsePlan(payload.plan);
    if (action !== 'operation' && action !== 'preview') revision(payload.expected_revision);
    if (['confirm','generate'].includes(action)) requireThat(HASH.test(String(payload.preview_hash)));
    if (action === 'generate') {
      uuid(payload.request_key); array(payload.approvals);
      for (const a of payload.approvals) { keys(a,['effect_id','accepted','observation']); requireThat(a.accepted === true && nonempty(a.effect_id) && nonempty(a.observation),'approval_required'); }
      unique(payload.approvals,'effect_id');
    }
    if (action === 'set_split') { uuid(payload.line_id); array(payload.parts); for (const p of payload.parts) {keys(p,['event_id','amount','source'],['event_id','amount']); uuid(p.event_id); money(p.amount); requireThat(Number(p.amount) >= 0);} unique(payload.parts,'event_id'); }
    if (action === 'preview' && payload.expected_revision !== undefined) revision(payload.expected_revision);
    return rpcResult(client,'ads_invoice_generation_v1',{p_invoice_id:invoiceId,p_action:action,p_payload:payload});
  }
  keys(payload,action === 'reopen' ? ['expected_revision'] : ['expected_revision','operation_id']); revision(payload.expected_revision);
  if (action === 'reopen') return rpcResult(client,'ads_invoice_reopen_v1',{p_invoice_id:invoiceId,p_expected_revision:payload.expected_revision});
  if (action === 'revert') return rpcResult(client,'ads_invoice_revert_v1',{p_invoice_id:invoiceId,p_operation_id:uuid(payload.operation_id),p_expected_revision:payload.expected_revision});
  throw new AdsContractError('invalid_plan');
}
export function httpStatus(error: unknown): number {
  const e = error as AdsContractError; const state = (e.details as any)?.sqlstate;
  if (e.code === 'feature_disabled') return 503;
  if (e.code === 'unauthenticated' || state === '28000') return 401;
  if (e.code === 'forbidden' || state === '42501') return 403;
  if (state === 'P0409' || ['revision_conflict','preview_stale','request_conflict','revert_blocked'].includes(e.code)) return 409;
  if (['55P03','40P01','57014'].includes(state)) return 409;
  return e instanceof AdsContractError ? 422 : 500;
}

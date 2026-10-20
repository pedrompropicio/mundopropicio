/**
 * #333 fase12e — cliente do executor Ticketline (SQL INERTE supabase/manual/20261020_issue333_assistant_executor.*).
 * Chama a RPC com o JWT do PRÓPRIO utilizador: a identidade e a empresa vêm de auth.uid()/current_company_id() na sessão,
 * nunca de argumentos. Não envia efeitos nem versão: o SQL carrega-os só da revisão persistida e recalcula o hash.
 * Falha de transporte ou erro desconhecido = resultado INCERTO: nunca repetir às cegas; recuperar por leitura (status).
 */
export const EXECUTOR_SCHEMA = "333-12e";
export class ExecutorUnavailable extends Error { status = 503; constructor() { super("Execução indisponível neste ambiente: executor por rever/aplicar. Nada foi executado."); } }
export class ExecutionRefused extends Error { constructor(message: string, readonly status = 409, readonly code = "") { super(message); } }
export class ExecutionUncertain extends Error { status = 502; constructor() { super("Resultado incerto. Não repita: use \"Verificar resultado\" para ler o estado gravado."); } }
export type ActionId = "a1" | "a2" | "a3" | "a4" | "a5";
export type ExecutionResult = { action_id: ActionId; status: "succeeded"; replayed: boolean; result: Record<string, unknown> };
export type ExecutionStatus = { authorization_id: string; action_ids: ActionId[]; executions: { action_id: ActionId; status: "succeeded"; result: Record<string, unknown>; at: string }[] };
export type CallerRpc = (token: string, name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
export interface Executor {
  probe(token: string): Promise<void>;
  execute(token: string, authorization_id: string, action_id: ActionId): Promise<ExecutionResult>;
  status(token: string, authorization_id: string): Promise<ExecutionStatus>;
}
/** Recusas definitivas do SQL (nada gravado). Tudo o resto é incerto. */
export const REFUSALS: Record<string, [string, number]> = {
  executor_closed: ["Execução fechada neste ambiente. Nada foi executado.", 503],
  context_mismatch: ["Sessão, empresa ou permissões não correspondem à autorização.", 403],
  action_not_authorized: ["Esta ação não faz parte da autorização.", 403],
  actions_blocked: ["Ação bloqueada na versão autorizada.", 409],
  dependency_pending: ["Execute primeiro as ações de que esta depende.", 409],
  stale_version: ["A revisão mudou depois da autorização; reveja e autorize de novo.", 409],
  hash_mismatch: ["Revisão persistida inconsistente; nada foi executado.", 409],
  data_incomplete: ["Faltam dados revistos para esta ação.", 422],
  event_sealed: ["O evento já tem fecho confirmado; o apuramento não foi registado.", 409],
  duplicate_statement: ["Já existe um apuramento com este número; não foi duplicado.", 409],
  data_changed: ["Os dados no sistema mudaram desde a autorização; nada foi alterado.", 409],
  awaiting_human_modal: ["Falta confirmar o fecho no modal de fecho (passo humano). Depois volte a conferir.", 409],
  readback_mismatch: ["A conferência falhou; a operação foi anulada.", 409],
};
export const unavailableExecutor: Executor = {
  probe: () => Promise.reject(new ExecutorUnavailable()),
  execute: () => Promise.reject(new ExecutorUnavailable()),
  status: () => Promise.reject(new ExecutorUnavailable()),
};
export function rpcExecutor(rpc: CallerRpc): Executor {
  const call = async <T>(token: string, args: Record<string, unknown>, uncertainOnUnknown: boolean): Promise<T> => {
    let r;
    try { r = await rpc(token, "data_entry_assistant_execute_333", args); }
    catch { if (uncertainOnUnknown) throw new ExecutionUncertain(); throw new ExecutorUnavailable(); }
    if (r.error) {
      const code = Object.keys(REFUSALS).find(k => r.error!.message?.includes(`#333: ${k}`));
      if (code) { const [m, s] = REFUSALS[code]; throw new ExecutionRefused(m, s, code); }
      if (r.error.code === "42883" || r.error.code === "PGRST202" || r.error.code === "42501") throw new ExecutorUnavailable();
      if (uncertainOnUnknown) throw new ExecutionUncertain();
      throw new ExecutorUnavailable();
    }
    return r.data as T;
  };
  return {
    async probe(token) {
      const r = await call<{ schema?: string; enabled?: boolean } | null>(token, { p_mode: "probe", p_authorization: null, p_action: null }, false);
      if (!r || r.schema !== EXECUTOR_SCHEMA || r.enabled !== true) throw new ExecutorUnavailable();
    },
    async execute(token, authorization_id, action_id) {
      const r = await call<ExecutionResult>(token, { p_mode: "execute", p_authorization: authorization_id, p_action: action_id }, true);
      if (!r || r.status !== "succeeded" || r.action_id !== action_id) throw new ExecutionUncertain();
      return r;
    },
    status: (token, authorization_id) => call<ExecutionStatus>(token, { p_mode: "status", p_authorization: authorization_id, p_action: null }, false),
  };
}
/** Destinos reais conferidos (só a partir de resultados gravados pelo SQL). */
export function executionLinks(r: { action_id: ActionId; result: Record<string, unknown> }): { label: string; href: string }[] {
  const s = (k: string) => typeof r.result[k] === "string" ? r.result[k] as string : null;
  const ev = s("event_id");
  if (r.action_id === "a1" || r.action_id === "a2") return [{ label: `Apuramento ${s("number") ?? ""}`.trim(), href: "/bilheteiras" }];
  if (r.action_id === "a3") return [{ label: "Fecho da bilheteira", href: "/bilheteiras" }];
  if (r.action_id === "a4" && ev) return [{ label: "Transações do evento", href: `/transacoes?event=${encodeURIComponent(ev)}` }];
  if (r.action_id === "a5" && s("transfer_transaction_id")) return [{ label: "Transferência do fecho", href: `/transacoes?highlight=${encodeURIComponent(s("transfer_transaction_id")!)}` }];
  return [];
}

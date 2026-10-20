/**
 * #333 fase12c — persistência da revisão/autorização. Só existe via RPC tipada (SQL INERTE em supabase/manual).
 * Sem migração revista/aplicada: indisponível (503). Nunca há fallback em memória que aparente persistência.
 * Identidade/empresa derivadas no SQL (auth.uid/current_company_id); o pedido só traz versão, hash e ações.
 */
import type { Proposal } from "./assistant-ticketline-proposal.ts";
export class ReviewUnavailable extends Error { status = 503; constructor() { super("Revisão e autorização ainda não disponíveis: persistência por rever/aplicar. Nada foi guardado."); } }
export class ReviewConflict extends Error { status = 409; }
export type SavedReview = { review_id: string; version: number; effects_hash: string };
export type AuthorizationRecord = { authorization_id: string; replayed: boolean; status: "authorized_inert" };
export interface ReviewStore {
  save(token: string, input: { review_id: string | null; expected_version: number | null; proposal: Proposal }): Promise<SavedReview>;
  authorize(token: string, input: { review_id: string; version: number; effects_hash: string; action_ids: string[]; replay_key: string }): Promise<AuthorizationRecord>;
}
export const unavailableReviewStore: ReviewStore = {
  save: () => Promise.reject(new ReviewUnavailable()),
  authorize: () => Promise.reject(new ReviewUnavailable()),
};
type Rpc = (token: string, name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
const MAP: Record<string, string> = {
  stale_version: "A prévia mudou entretanto; revê a versão atual.", replay_conflict: "Chave de repetição já usada para outra autorização.",
  actions_blocked: "Há ações bloqueadas; não é possível autorizar.", review_closed: "", context_mismatch: "Contexto alterado.",
};
/** Candidato para depois da migração revista; não é instanciado no index desta entrega. */
export function rpcReviewStore(rpc: Rpc): ReviewStore {
  const call = async <T>(token: string, args: Record<string, unknown>) => {
    const { data, error } = await rpc(token, "data_entry_assistant_review_333", args);
    if (error) {
      const code = Object.keys(MAP).find(k => error.message?.includes(k));
      if (!code || code === "review_closed" || error.code === "42883") throw new ReviewUnavailable();
      throw new ReviewConflict(MAP[code]);
    }
    return data as T;
  };
  return {
    save: (t, i) => call<SavedReview>(t, { p_action: "save", p_review: i.review_id, p_expected_version: i.expected_version, p_hash: i.proposal.effects_hash, p_proposal: i.proposal, p_action_ids: null, p_replay: null }),
    authorize: (t, i) => call<AuthorizationRecord>(t, { p_action: "authorize", p_review: i.review_id, p_expected_version: i.version, p_hash: i.effects_hash, p_proposal: null, p_action_ids: i.action_ids, p_replay: i.replay_key }),
  };
}

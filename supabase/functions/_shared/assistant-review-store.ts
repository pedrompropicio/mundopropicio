/**
 * #333 fase12d — persistência da revisão/autorização. Só via RPC tipada (SQL INERTE em supabase/manual), EXECUTE só service_role.
 * O actor/empresa vêm do JWT verificado + resolvedor canónico no servidor e são revalidados no SQL; a proposta é
 * construída no servidor e o SQL recalcula o hash. Sem esquema revisto ou com gate fechado: 503. Nunca memória.
 */
import type { Proposal } from "./assistant-ticketline-proposal.ts";
export class ReviewUnavailable extends Error { status = 503; constructor() { super("Revisão e autorização ainda não disponíveis: persistência por rever/aplicar. Nada foi guardado."); } }
export class ReviewConflict extends Error { status = 409; }
export type SavedReview = { review_id: string; version: number; effects_hash: string };
export type AuthorizationRecord = { authorization_id: string; replayed: boolean; status: "authorized_inert"; action_ids?: string[] };
export type ReviewScope = { user: string; company: string };
export interface ReviewStore {
  /** Confirma esquema revisto ('333-12d') e gate aberto; caso contrário ReviewUnavailable. */
  probe(): Promise<void>;
  save(scope: ReviewScope, input: { review_id: string | null; expected_version: number | null; proposal: Proposal }): Promise<SavedReview>;
  authorize(scope: ReviewScope, input: { review_id: string; version: number; effects_hash: string; action_ids: string[]; replay_key: string }): Promise<AuthorizationRecord>;
}
export const REVIEW_SCHEMA = "333-12d";
export const unavailableReviewStore: ReviewStore = {
  probe: () => Promise.reject(new ReviewUnavailable()),
  save: () => Promise.reject(new ReviewUnavailable()),
  authorize: () => Promise.reject(new ReviewUnavailable()),
};
export type ServiceRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
const MAP: Record<string, string> = {
  stale_version: "A prévia mudou entretanto; revê a versão atual.", replay_conflict: "Esta versão já tem autorização ou a chave foi usada noutra.",
  actions_blocked: "Ações bloqueadas ou dependências em falta; não é possível autorizar.", hash_mismatch: "Prévia inconsistente; recalcula.", context_mismatch: "Contexto alterado.",
};
const NONE = { p_review: null, p_expected_version: null, p_hash: null, p_proposal: null, p_action_ids: null, p_replay: null };
export function rpcReviewStore(rpc: ServiceRpc): ReviewStore {
  const call = async <T>(args: Record<string, unknown>) => {
    const { data, error } = await rpc("data_entry_assistant_review_333", args);
    if (error) {
      const code = Object.keys(MAP).find(k => error.message?.includes(`#333: ${k}`));
      if (!code) throw new ReviewUnavailable(); // review_closed, missing function (42883/PGRST202) or anything unknown
      throw new ReviewConflict(MAP[code]);
    }
    return data as T;
  };
  return {
    async probe() {
      const r = await call<{ schema?: string; enabled?: boolean } | null>({ p_action: "probe", p_actor: null, p_company: null, ...NONE });
      if (!r || r.schema !== REVIEW_SCHEMA || r.enabled !== true) throw new ReviewUnavailable();
    },
    save: (s, i) => call<SavedReview>({ ...NONE, p_action: "save", p_actor: s.user, p_company: s.company, p_review: i.review_id, p_expected_version: i.expected_version, p_hash: i.proposal.effects_hash, p_proposal: i.proposal }),
    authorize: (s, i) => call<AuthorizationRecord>({ ...NONE, p_action: "authorize", p_actor: s.user, p_company: s.company, p_review: i.review_id, p_expected_version: i.version, p_hash: i.effects_hash, p_action_ids: i.action_ids, p_replay: i.replay_key }),
  };
}

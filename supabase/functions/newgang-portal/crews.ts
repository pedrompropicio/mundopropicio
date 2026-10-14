// Crews do Clube (D-ERP274). Puro — testável sem base. Nunca devolve emails nem ids de outros membros.
import { shortName } from "./history.ts";

export const CREW_LINK = (domain: string, code: string) => `https://${domain}/clube?crew=${code}`;

/** Erros das RPCs club_crew_* → HTTP. */
export function crewErrorStatus(err: string): number {
  if (err === "no_session") return 401;
  if (err === "crew_not_found") return 404;
  if (["already_in_crew", "crew_full", "owner_transfer", "not_in_crew"].includes(err)) return 409;
  return 400;
}

export type CrewRow = { id: string; name: string; code: string; owner_member_id: string; completed_at: string | null };
export type CrewMemberRow = { member_id: string; joined_at: string; first_name: string | null; confirmed_at: string | null };

export function crewView(domain: string, crew: CrewRow, members: CrewMemberRow[], cfg: { min: number; max: number }) {
  const sorted = [...members].sort((a, b) => (a.joined_at < b.joined_at ? -1 : 1));
  return {
    name: crew.name,
    code: crew.code,
    invite_link: CREW_LINK(domain, crew.code),
    members: sorted.map((m) => ({ short_name: shortName(m.first_name) ?? "Membro", confirmed: !!m.confirmed_at, is_owner: m.member_id === crew.owner_member_id })),
    min: cfg.min,
    max: cfg.max,
    completed: !!crew.completed_at,
  };
}

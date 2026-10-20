// Read-only, injectable; scope and crew come exclusively from the server session.
import { shortName } from "./history.ts";

export const PENDING_FRIENDS_LIMIT = 50;
export const PENDING_MEMBERS_LIMIT = 20;
export type InviteRow = { first_name: string | null; created_at: string; pending_crew_code?: string | null };
export type InviteView = { short_name: string; at: string };

export function pendingInviteView(rows: InviteRow[], limit: number, ownCrewCode: string | null = null): InviteView[] {
  return rows.filter((r) => !ownCrewCode || r.pending_crew_code !== ownCrewCode)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((r) => ({ short_name: shortName(r.first_name) ?? "Convidado", at: r.created_at }));
}

export type InviteQuery = PromiseLike<{ data: InviteRow[] | null; count: number | null; error: unknown }> & {
  select(columns: string, opts: { count: "exact" }): InviteQuery;
  eq(column: string, value: string): InviteQuery;
  is(column: string, value: null): InviteQuery;
  or(filter: string): InviteQuery;
  order(column: string, opts: { ascending: boolean }): InviteQuery;
  limit(value: number): InviteQuery;
};
export type InviteScope = { siteId: string; companyId: string; memberId: string };

/** SQL excludes the ENTIRE own crew before count/limit, not only its first 20 entries. */
export async function readPendingInvites(from: () => InviteQuery, scope: InviteScope, crewCode: string | null) {
  const base = () => from().select("first_name,created_at", { count: "exact" })
    .eq("site_id", scope.siteId).eq("company_id", scope.companyId).is("confirmed_at", null);
  let friends = base().eq("referred_by_member_id", scope.memberId);
  if (crewCode) {
    const quoted = `"${crewCode.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    friends = friends.or(`pending_crew_code.is.null,pending_crew_code.neq.${quoted}`);
  }
  const read = async (query: InviteQuery, limit: number) => {
    try {
      const r = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
      if (r.error || r.count === null) throw new Error("unavailable");
      return { items: pendingInviteView(r.data ?? [], limit), total: r.count };
    } catch {
      // Optional reads must not alter existing me fields or pretend the real count is zero.
      return { items: [] as InviteView[], total: null, error: "unavailable" as const };
    }
  };
  const [f, c] = await Promise.all([
    read(friends, PENDING_FRIENDS_LIMIT),
    crewCode ? read(base().eq("pending_crew_code", crewCode), PENDING_MEMBERS_LIMIT) : null,
  ]);
  return {
    referrals: { pending_friends: f.items, pending_friends_total: f.total, ...(f.error ? { pending_friends_error: f.error } : {}) },
    crew: c ? { pending_members: c.items, pending_members_total: c.total, ...(c.error ? { pending_members_error: c.error } : {}) } : null,
  };
}
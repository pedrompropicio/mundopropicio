// #327 — teste local (sem rede) do contrato canónico de nível → objeto Wallet.
// O valor de nível vem da RPC club_member_level (pontos + piso); aqui simula-se só a linha devolvida.
import { buildObject } from "./wallet-google.ts";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); };
const rowToMember = (row: { points: number; level_name: string | null } | undefined) => ({
  id: "00000000-0000-4000-8000-00000000000m", member_no: 7, first_name: "Teste", points: Number(row?.points ?? 0), level: row?.level_name ?? null, crew: null,
});
Deno.test("nível protegido (500 pts, piso Crew) mantém Crew no cartão", () => {
  const o: any = buildObject("issuer", rowToMember({ points: 500, level_name: "Crew" }));
  eq(JSON.stringify(o).includes("Crew"), true, "Crew no objeto");
  eq(JSON.stringify(o).includes("500"), true, "pontos preservados");
});
Deno.test("Goat protegido (1500 pts) e Goat por pontos (3000) dão o mesmo nível", () => {
  const a: any = buildObject("issuer", rowToMember({ points: 1500, level_name: "Goat" }));
  const b: any = buildObject("issuer", rowToMember({ points: 3000, level_name: "Goat" }));
  eq(a.id, b.id, "mesmo id de objeto (membro)");
  eq(JSON.stringify(a).includes("Goat") && JSON.stringify(b).includes("Goat"), true, "Goat");
});
Deno.test("sem linha (RPC vazia) → 0 pontos, sem nível inventado", () => {
  const m = rowToMember(undefined); eq([m.points, m.level], [0, null], "fallback");
});

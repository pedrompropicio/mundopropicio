// #327 — testes do módulo REAL club-canon.ts (copiado para a worktree temporária). Sem rede, sem env.
import { memberLevel, referralProgress, rulesPublic, rulesView, type Rpc } from "./club-canon.ts";
import { buildObject } from "./wallet-google.ts";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); };
const fake = (map: Record<string, { data: unknown; error: { message: string } | null }>, calls: string[] = []): Rpc =>
  (fn, args) => { calls.push(fn + ":" + JSON.stringify(args)); return Promise.resolve(map[fn] ?? { data: null, error: { message: "fn desconhecida" } }); };

Deno.test("nível: erro de RPC é explícito (não cai para Gang/0)", async () => {
  let msg = "";
  try { await memberLevel(fake({ club_member_level: { data: null, error: { message: "boom" } } }), "m1"); } catch (e) { msg = (e as Error).message; }
  eq(msg, "club_member_level: boom", "erro");
});
Deno.test("nível: resultado vazio → 0 pontos, sem nível inventado", async () => {
  eq(await memberLevel(fake({ club_member_level: { data: [], error: null } }), "m1"), { points: 0, level: null, protected: false, next_level: null, next_level_min: null }, "vazio");
});
Deno.test("nível protegido: 500 pts Crew com piso; próximo nível coerente (Goat 3000, não 'Crew 750')", async () => {
  const lv = await memberLevel(fake({ club_member_level: { data: [{ points: 500, level_name: "Crew", protected: true, next_level_name: "Goat", next_level_min: 3000 }], error: null } }), "m1");
  eq([lv.level, lv.protected, lv.next_level, lv.next_level_min], ["Crew", true, "Goat", 3000], "protegido");
  const o: any = buildObject("issuer", { id: "00000000-0000-4000-8000-00000000000m", member_no: 7, first_name: "T", points: lv.points, level: lv.level, crew: null });
  eq(JSON.stringify(o).includes("Crew") && JSON.stringify(o).includes("500"), true, "Wallet com nível canónico e pontos");
});
Deno.test("nível: cache por membro evita 2.ª RPC", async () => {
  const calls: string[] = []; const cache = new Map();
  const rpc = fake({ club_member_level: { data: [{ points: 10, level_name: "Gang", protected: false, next_level_name: "Crew", next_level_min: 750 }], error: null } }, calls);
  await memberLevel(rpc, "m1", cache); await memberLevel(rpc, "m1", cache); await memberLevel(rpc, "m2", cache);
  eq(calls.length, 2, "1 RPC por membro");
});
Deno.test("conquistas: erro → status error (não null silencioso); ok → contagem e badges", async () => {
  eq(await referralProgress(fake({ club_referral_progress: { data: null, error: { message: "x" } } }), "m"), { status: "error" }, "erro");
  eq(await referralProgress(fake({ club_referral_progress: { data: null, error: null } }), "m"), { status: "error" }, "vazio");
  eq(await referralProgress(fake({ club_referral_progress: { data: { confirmed_friends: 4, badges: { friends_3: true, friends_5: false } }, error: null } }), "m"),
     { status: "ok", confirmed_friends: 4, badges: { friends_3: true, friends_5: false } }, "ok");
});
Deno.test("montra: compra/friend_bought indisponíveis não aparecem como 'ganha N'; teto da indicação exposto", () => {
  const v = rulesView([
    { rule_key: "join_confirmed", label: "Inscrição", points: 100, active: true, available: true, status: "ok", cap: null, scope: "adesao", event_id: "e", config_version: "2027-v1" },
    { rule_key: "friend_joined", label: "Amigo", points: 75, active: true, available: true, status: "ok", cap: 750, scope: "edicao", event_id: "e", config_version: "2027-v1" },
    { rule_key: "promo_lot_purchase", label: "Compra", points: 200, active: true, available: false, status: "sem_integracao", cap: null, scope: "edicao", event_id: "e", config_version: "2027-v1" },
    { rule_key: "friend_bought", label: "Amigo comprou", points: 300, active: true, available: false, status: "sem_integracao", cap: null, scope: null, event_id: "e", config_version: "2027-v1" },
    { rule_key: "x", label: "Off", points: 1, active: false, available: false, status: "inativa", cap: null, scope: null, event_id: "e", config_version: "2027-v1" },
  ]);
  eq(v.rules.map((r) => r.rule_key + ":" + r.points), ["friend_joined:75", "join_confirmed:100"], "disponíveis");
  eq(v.rules.find((r) => r.rule_key === "friend_joined")?.cap, 750, "teto");
  eq(v.unavailable.map((r) => r.rule_key + ":" + r.status), ["promo_lot_purchase:sem_integracao", "friend_bought:sem_integracao"], "indisponíveis");
  eq(JSON.stringify(v.unavailable).includes("200") || JSON.stringify(v.unavailable).includes("300"), false, "sem pontos prometidos");
});
Deno.test("montra: erro de RPC explícito; vazio → listas vazias", async () => {
  let msg = ""; try { await rulesPublic(fake({ club_rules_public: { data: null, error: { message: "y" } } }), "s"); } catch (e) { msg = (e as Error).message; }
  eq(msg, "club_rules_public: y", "erro");
  eq((await rulesPublic(fake({ club_rules_public: { data: [], error: null } }), "s")).rules, [], "vazio");
});

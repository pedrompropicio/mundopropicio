// #405 E2b — dados sintéticos, sem rede/segredos. deno test --allow-read --deny-net --deny-env presale-code_test.ts
import { deepStrictEqual as equal, ok as assert } from "node:assert/strict";
import { PRESALE_CODE_UNTIL, presaleCodeAction, type PresaleCodeDeps, type PresaleRateArgs } from "./presale-code.ts";

const TOKEN = "synthetic-session-token-405";
const IP = "192.0.2.40";
const SITE = { id: "synthetic-site", company_id: "synthetic-company" };
const MEMBER = { site_id: SITE.id, company_id: SITE.company_id, email: "  MEMBER@Example.invalid  ", erased_at: null };
const REQUEST = { action: "presale_code", token: TOKEN };
async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fixture(overrides: Partial<PresaleCodeDeps> = {}) {
  const calls: string[] = [], rates: PresaleRateArgs[] = [];
  const deps: PresaleCodeDeps = {
    now: () => Date.parse("2026-11-05T12:00:00Z"),
    sha256,
    rateHit: async (args) => { rates.push(args); calls.push("rate"); return { data: true, error: null }; },
    getSite: async () => { calls.push("site"); return SITE; },
    memberFromToken: async (siteId, token) => {
      calls.push("member"); equal([siteId, token], [SITE.id, TOKEN]); return MEMBER;
    },
    readCode: async (email) => { calls.push("code"); equal(email, "member@example.invalid"); return "NEWGANG27A"; },
    readExclusion: async (email) => { calls.push("exclusion"); equal(email, "member@example.invalid"); return false; },
    ...overrides,
  };
  return { deps, calls, rates, run: (raw: unknown = REQUEST, ip = IP) => presaleCodeAction(raw, ip, deps) };
}

function errorIs(result: Awaited<ReturnType<typeof presaleCodeAction>>, status: number, error: string) {
  equal(result, { status, body: { error } });
  equal(Object.keys(result.body), ["error"]);
}
function ineligibleIs(result: Awaited<ReturnType<typeof presaleCodeAction>>) {
  equal(result, { status: 200, body: { ok: true, status: "not_eligible" } });
  equal(Object.keys(result.body), ["ok", "status"]);
}

for (const code of ["NEWGANG27A", "NEWGANG27B"]) {
  Deno.test(`presale_code: eligible ${code}, email normalizado e chaves exactas`, async () => {
    const f = fixture({ readCode: async (email) => { equal(email, "member@example.invalid"); return code; } });
    const result = await f.run();
    equal(result, { status: 200, body: { ok: true, status: "eligible", code } });
    equal(Object.keys(result.body), ["ok", "status", "code"]);
    equal(f.calls, ["rate", "rate", "site", "member", "exclusion"]);
  });
}

Deno.test("presale_code: sem código e excluído são indistinguíveis", async () => {
  ineligibleIs(await fixture({ readCode: async () => null }).run());
  ineligibleIs(await fixture({ readExclusion: async () => true }).run());
  ineligibleIs(await fixture({ readCode: async () => null, readExclusion: async () => true }).run());
});

Deno.test("presale_code: membro sem email não lê tabelas de elegibilidade", async () => {
  for (const email of [null, "", "   "]) {
    const f = fixture({ memberFromToken: async () => ({ ...MEMBER, email }) });
    ineligibleIs(await f.run());
    equal(f.calls, ["rate", "rate", "site"]);
  }
});

for (const [label, member] of [
  ["erased_at", { ...MEMBER, erased_at: "2026-11-01T00:00:00Z" }],
  ["outro site", { ...MEMBER, site_id: "other-site" }],
  ["outra empresa", { ...MEMBER, company_id: "other-company" }],
  ["sessão inválida ou expirada", null],
] as const) {
  Deno.test(`presale_code: ${label} devolve só 401`, async () => {
    const f = fixture({ memberFromToken: async () => member });
    errorIs(await f.run(), 401, "no_session");
    equal(f.calls, ["rate", "rate", "site"]);
  });
}

Deno.test("presale_code: sem token, tipo inválido, <20 e >200 devolvem 401 antes das dependências", async () => {
  for (const token of [undefined, null, 42, {}, [], "", "x".repeat(19), "x".repeat(201)]) {
    const f = fixture();
    errorIs(await f.run({ action: "presale_code", ...(token === undefined ? {} : { token }) }), 401, "no_session");
    equal(f.calls, []);
  }
});

Deno.test("presale_code: os comprimentos 20 e 200 chegam ao resolvedor existente", async () => {
  for (const token of ["x".repeat(20), "x".repeat(200)]) {
    let seen = false;
    const f = fixture({ memberFromToken: async (siteId, received) => {
      equal([siteId, received], [SITE.id, token]); seen = true; return null;
    } });
    errorIs(await f.run({ action: "presale_code", token }), 401, "no_session");
    assert(seen);
  }
});

Deno.test("presale_code: qualquer campo extra dá 400, incluindo email/member_id e campos conhecidos do Body", async () => {
  for (const key of ["email", "member_id", "profile_payload", "preferences_payload", "dry_run", "code", "limit", "unknown"]) {
    const f = fixture();
    errorIs(await f.run({ ...REQUEST, [key]: "synthetic" }), 400, "invalid");
    errorIs(await f.run({ action: "presale_code", token: "short", [key]: null }), 400, "invalid");
    equal(f.calls, []);
  }
});

Deno.test("presale_code: corpo inválido é rejeitado sem leituras", async () => {
  for (const raw of [null, [], 42, "presale_code", {}, { action: "me", token: TOKEN }]) {
    const f = fixture(); errorIs(await f.run(raw), 400, "invalid"); equal(f.calls, []);
  }
});

Deno.test("presale_code: baldes separados, SHA-256 real, 20 pedidos/600 segundos", async () => {
  const f = fixture(); await f.run();
  equal(f.rates, [
    { p_bucket: `ng:presale_code:${await sha256(IP + ":ng")}`, p_max: 20, p_window_seconds: 600 },
    { p_bucket: `ng:presale_code:session:${await sha256(TOKEN)}`, p_max: 20, p_window_seconds: 600 },
  ]);
  assert(f.rates.every((r) => !r.p_bucket.includes(TOKEN) && !r.p_bucket.includes(IP)));
  equal(f.calls, ["rate", "rate", "site", "member", "code", "exclusion"]);
});

for (const blocked of ["ip", "session"]) {
  Deno.test(`presale_code: limite por ${blocked} devolve 429 antes de leituras`, async () => {
    const buckets: string[] = [];
    const f = fixture({ rateHit: async ({ p_bucket }) => {
      buckets.push(p_bucket);
      return { data: blocked === "ip" ? false : !p_bucket.includes(":session:"), error: null };
    } });
    errorIs(await f.run(), 429, "rate_limited");
    equal(buckets.length, blocked === "ip" ? 1 : 2);
    equal(f.calls, []);
  });
}

Deno.test("presale_code: mudar IP não contorna balde de sessão; sessões partilham o balde de IP", async () => {
  const hits = new Map<string, number>();
  const f = fixture({ rateHit: async ({ p_bucket, p_max }) => {
    const count = (hits.get(p_bucket) ?? 0) + 1; hits.set(p_bucket, count);
    return { data: count <= p_max, error: null };
  }, memberFromToken: async () => MEMBER });
  for (let i = 0; i < 20; i++) equal((await f.run(REQUEST, `192.0.2.${i}`)).status, 200);
  errorIs(await f.run(REQUEST, "192.0.2.200"), 429, "rate_limited");
  hits.clear();
  for (let i = 0; i < 20; i++) equal((await f.run({ action: "presale_code", token: `${TOKEN}-${i}` })).status, 200);
  errorIs(await f.run({ action: "presale_code", token: `${TOKEN}-21` }), 429, "rate_limited");
});

for (const failAt of [1, 2]) {
  Deno.test(`presale_code: erro/throw/resposta malformada do balde ${failAt} dá 503`, async () => {
    for (const failure of ["error", "throw", "null", "string", "undefined"]) {
      let hits = 0;
      const f = fixture({ rateHit: async () => {
        if (++hits !== failAt) return { data: true, error: null };
        if (failure === "throw") throw new Error("synthetic secret must not escape");
        return { data: failure === "error" ? true : failure === "string" ? "true" : failure === "null" ? null : undefined,
          error: failure === "error" ? { message: "synthetic secret must not escape" } : null };
      } });
      errorIs(await f.run(), 503, "rate_unavailable");
      equal(f.calls, []);
    }
  });
}

Deno.test("presale_code: erros inesperados não expõem detalhes e dão 500", async () => {
  const fail = async () => { throw new Error(`${TOKEN} member@example.invalid NEWGANG27A`); };
  for (const key of ["sha256", "getSite", "memberFromToken", "readCode", "readExclusion"] as const) {
    errorIs(await fixture({ [key]: fail }).run(), 500, "internal");
  }
  errorIs(await fixture({ now: () => { throw new Error("synthetic clock"); } }).run(), 500, "internal");
  errorIs(await fixture({ getSite: async () => null }).run(), 500, "internal");
});

Deno.test("presale_code: prazo exclusivo, incluindo o próprio instante, antes de QUALQUER dependência", async () => {
  equal(PRESALE_CODE_UNTIL, "2026-11-10T23:59:59Z");
  const cutoff = Date.parse(PRESALE_CODE_UNTIL);
  equal((await fixture({ now: () => cutoff - 1 }).run()).status, 200);
  for (const now of [cutoff, cutoff + 1, cutoff + 86400_000]) {
    const f = fixture({ now: () => now, sha256: async () => { throw new Error("must not hash"); } });
    for (const raw of [REQUEST, { ...REQUEST, email: "synthetic@example.invalid" }, { action: "presale_code" }]) {
      errorIs(await f.run(raw), 404, "action");
    }
    equal(f.calls, []);
  }
});

// B1: bytes fixados ANTES das alterações em main 549c8a7c1bc878267a252b43dbb608eac4ec9163.
// Inclui os auxiliares pageAll/sha256Tag, toda a função notifyPresale e todo o ramo reforco_*.
const B1_HASHES = {
  "index.ts:presale helpers + notifyPresale": "965cfc8ff53150a3000450a5e28ca2e43f715aa4376ccd0ecd62e23a3e22999f",
  "index.ts:reforco branch": "5441a8b9079fc8044b913ef0ef860ed5e50860e4633ef75ac08b3e580e1f7c00",
  "presale-reinforce-email.ts": "6a251beac8a4c904e3d1a9e46c208be8d075ec584f88f08536abd14550bfca93",
  "presale-reinforce.ts": "30d8e6afa4739bf718757a17b62404b2e956ad88f20d4cc8f334773a79e15b1c",
  "presale-reinforce_test.ts": "67e8ddcbbfc2da02474b1cfe60ab8bd5019e49268f13a710adfa72b5fa8ecd8f",
};

Deno.test("#405 B1: reforco_* e presale-reinforce*.ts byte a byte iguais ao main inicial", async () => {
  const index = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const between = (start: string, end: string) => {
    const a = index.indexOf(start), b = index.indexOf(end, a);
    assert(a >= 0 && b > a, `B1: marcadores ${start} / ${end}`);
    equal(index.indexOf(start, a + start.length), -1, "B1: início tem de ser único");
    return index.slice(a, b);
  };
  const hashes: Record<string, string> = {
    "index.ts:presale helpers + notifyPresale": await sha256(between("// #405 — Reforço", "\n// ---------- Google Wallet ----------")),
    "index.ts:reforco branch": await sha256(between("    // #405: reforço", '    if (b?.action !== "notify_pending")')),
  };
  const files: string[] = [];
  for await (const entry of Deno.readDir(new URL("./", import.meta.url))) {
    if (entry.isFile && /^presale-reinforce.*\.ts$/.test(entry.name)) files.push(entry.name);
  }
  equal(files.sort(), Object.keys(B1_HASHES).filter((key) => !key.startsWith("index.ts:")).sort());
  for (const name of files) hashes[name] = await sha256(await Deno.readFile(new URL(name, import.meta.url)));
  equal(hashes, B1_HASHES, "B1 falhou: deploy bloqueado");
});

// deno test supabase/functions/_shared/purchase-audience-match.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolvePurchaseAudience, scoreCandidate, normalize } from "./purchase-audience-match.ts";

const ivete = {
  eventName: "Ivete Clareou 2026",
  eventSlug: "ivete-clareou-2026",
  catalog: [
    { audience_id_meta: "120253191958140595", name: "[SITE] Compras 180D - Ivete Clareou 2026 (Novo)" },
    { audience_id_meta: "120252579441020595", name: "[SITE] ViewContent - Purchase 180D - Ivete Clareou" },
    { audience_id_meta: "120240000000000000", name: "[SITE] Lookalike Compradores Mundo Propício" },
    { audience_id_meta: "120240000000000001", name: "[SITE] Engajamento IG 30D - Ivete Clareou" },
  ],
};

const anitta = {
  eventName: "Ensaios da Anitta 2026",
  eventSlug: "ensaios-da-anitta-2026",
  catalog: [
    { audience_id_meta: "120253192608000595", name: "[SITE] Compras 180D - Ensaios da Anitta 26 (Novo)" },
    { audience_id_meta: "120251892106450595", name: "[SITE] Purchase 180D - Ensaios da Anitta" },
    { audience_id_meta: "120240000000000010", name: "[SITE] ViewContent 30D - Ensaios da Anitta" },
  ],
};

const simone = {
  eventName: "Simone Mendes 2026",
  eventSlug: "simone-mendes-2026",
  catalog: [
    { audience_id_meta: "120248416331610595", name: "[SITE] Purchase - 180D - Simone Mendes 2026" },
    { audience_id_meta: "120252579443690595", name: "[SITE] ViewContent - Purchase 180D - Simone Mendes" },
  ],
};

Deno.test("normalize: acentos, brackets, case", () => {
  assertEquals(normalize("[SITE] Compras 180D - Ivete Clareou 2026 (Novo)"), "site compras 180d ivete clareou 2026 novo");
});

Deno.test("Ivete: escolhe Compras 180D (Novo) sobre ViewContent", () => {
  const d = resolvePurchaseAudience(ivete);
  if (d.status !== "matched") throw new Error(`expected matched, got ${JSON.stringify(d)}`);
  assertEquals(d.audience_id_meta, "120253191958140595");
});

Deno.test("Anitta: escolhe Compras (Novo) sobre Purchase puro", () => {
  // Ambos passam GATE: "Compras 180D ... (Novo)" tem +5 novo; "Purchase 180D" não.
  // Sem ViewContent em nenhum, mesmo score base. Compras-Novo ganha por +5.
  const d = resolvePurchaseAudience(anitta);
  if (d.status !== "matched") throw new Error(`expected matched, got ${JSON.stringify(d)}`);
  assertEquals(d.audience_id_meta, "120253192608000595");
});

Deno.test("Simone: escolhe Purchase puro sobre ViewContent-Purchase", () => {
  const d = resolvePurchaseAudience(simone);
  if (d.status !== "matched") throw new Error(`expected matched, got ${JSON.stringify(d)}`);
  assertEquals(d.audience_id_meta, "120248416331610595");
});

Deno.test("AMBÍGUO: duas Compras 180D do mesmo evento sem desempate → null", () => {
  const d = resolvePurchaseAudience({
    eventName: "Festival X 2026",
    eventSlug: "festival-x-2026",
    catalog: [
      { audience_id_meta: "A1", name: "[SITE] Compras 180D - Festival X 2026" },
      { audience_id_meta: "A2", name: "[SITE] Purchase 180D - Festival X 2026" },
    ],
  });
  assertEquals(d.status, "ambiguous");
});

Deno.test("SEM MATCH: evento sem audiência de compra → null", () => {
  const d = resolvePurchaseAudience({
    eventName: "Evento Sem Audiencia 2026",
    eventSlug: "evento-sem-audiencia-2026",
    catalog: [
      { audience_id_meta: "X1", name: "[SITE] ViewContent 30D - Outro Evento" },
      { audience_id_meta: "X2", name: "Lookalike Compradores Mundo Propício" },
      { audience_id_meta: "X3", name: "[SITE] Engajamento IG 30D - Outro Evento" },
    ],
  });
  assertEquals(d.status, "none");
});

Deno.test("SEM MATCH: catálogo vazio", () => {
  const d = resolvePurchaseAudience({ eventName: "Qualquer", eventSlug: "qualquer", catalog: [] });
  assertEquals(d.status, "none");
});

Deno.test("Score: ViewContent-Purchase penaliza 30 pts vs Purchase puro", () => {
  const a = scoreCandidate("[SITE] Purchase 180D - Ensaios da Anitta", "Ensaios da Anitta 2026", "ensaios-da-anitta-2026");
  const b = scoreCandidate("[SITE] ViewContent - Purchase 180D - Ensaios da Anitta", "Ensaios da Anitta 2026", "ensaios-da-anitta-2026");
  if (!(a.score > b.score + 25)) throw new Error(`expected a.score >> b.score, got a=${a.score} b=${b.score}`);
});

Deno.test("GATE 1: sem token purchase → score 0", () => {
  const r = scoreCandidate("[SITE] ViewContent 30D - Ivete Clareou", "Ivete Clareou 2026", "ivete-clareou-2026");
  assertEquals(r.score, 0);
});

Deno.test("GATE 2: tem purchase mas evento não casa → score 0", () => {
  const r = scoreCandidate("[SITE] Compras 180D - Outro Artista", "Ivete Clareou 2026", "ivete-clareou-2026");
  assertEquals(r.score, 0);
});

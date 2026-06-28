// deno test supabase/functions/_shared/purchase-audience-match.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolvePurchaseAudience, scoreCandidate, normalize } from "./purchase-audience-match.ts";

Deno.test("normalize: acentos, brackets, case", () => {
  assertEquals(normalize("[SITE] Compras 180D - Ivete Clareou 2026 (Novo)"), "site compras 180d ivete clareou 2026 novo");
});

// ─────────────────────────── NÍVEL 1 ───────────────────────────────────────
Deno.test("NÍVEL 1: principal explícita ganha mesmo com menos registos", () => {
  const d = resolvePurchaseAudience({
    eventId: "evt-1",
    eventName: "Ivete Clareou 2026",
    eventSlug: "ivete-clareou-2026",
    catalog: [
      { audience_id_meta: "A1", name: "[SITE] Compras 180D - Ivete", event_id: "evt-1", is_primary_purchase: true, total_records_meta: 100 },
      { audience_id_meta: "A2", name: "[SITE] Purchase 90D - Ivete", event_id: "evt-1", is_primary_purchase: false, total_records_meta: 9999 },
    ],
  });
  if (d.status !== "matched_primary") throw new Error(`expected matched_primary, got ${JSON.stringify(d)}`);
  assertEquals(d.audience_id_meta, "A1");
});

// ─────────────────────────── NÍVEL 2 ───────────────────────────────────────
Deno.test("NÍVEL 2: ligadas sem principal — desempata por mais registos", () => {
  const d = resolvePurchaseAudience({
    eventId: "evt-2",
    eventName: "X",
    eventSlug: "x",
    catalog: [
      { audience_id_meta: "B1", name: "Compras 90D", event_id: "evt-2", is_primary_purchase: false, total_records_meta: 500 },
      { audience_id_meta: "B2", name: "Compras 180D", event_id: "evt-2", is_primary_purchase: false, total_records_meta: 1200 },
      { audience_id_meta: "B3", name: "Compras 30D", event_id: "evt-2", is_primary_purchase: false, total_records_meta: 100 },
    ],
  });
  if (d.status !== "matched_linked") throw new Error(`expected matched_linked, got ${JSON.stringify(d)}`);
  assertEquals(d.audience_id_meta, "B2");
  assertEquals(d.linked_count, 3);
});

Deno.test("NÍVEL 2: empate no topo de registos → ambiguous_linked", () => {
  const d = resolvePurchaseAudience({
    eventId: "evt-3",
    eventName: "X",
    eventSlug: "x",
    catalog: [
      { audience_id_meta: "C1", name: "Compras 90D", event_id: "evt-3", is_primary_purchase: false, total_records_meta: 1000 },
      { audience_id_meta: "C2", name: "Compras 180D", event_id: "evt-3", is_primary_purchase: false, total_records_meta: 1000 },
    ],
  });
  assertEquals(d.status, "ambiguous_linked");
});

// ─────────────────────────── NÍVEL 3 ───────────────────────────────────────
Deno.test("NÍVEL 3: sem ligadas — match por nome devolve suggested_by_name (NÃO matched_*)", () => {
  const d = resolvePurchaseAudience({
    eventId: "evt-X",
    eventName: "Ivete Clareou 2026",
    eventSlug: "ivete-clareou-2026",
    catalog: [
      { audience_id_meta: "D1", name: "[SITE] Compras 180D - Ivete Clareou 2026", total_records_meta: 800 },
      { audience_id_meta: "D2", name: "[SITE] Purchase 30D - Ivete Clareou", total_records_meta: 200 },
    ],
  });
  if (d.status !== "suggested_by_name") throw new Error(`expected suggested_by_name, got ${JSON.stringify(d)}`);
  // a de 180D (mais janela) ganha por score, não por "(Novo)"
  assertEquals(d.audience_id_meta, "D1");
  // garante explicitamente que o caller NÃO o trataria como exclusão automática
  // (caller só exclui em "matched_primary"/"matched_linked")
  if ((d.status as string) === "matched_primary" || (d.status as string) === "matched_linked") {
    throw new Error("LEVEL 3 não pode ter status determinístico");
  }
});

Deno.test('Reversão "(Novo)": desempate passa a ser por mais registos', () => {
  // Antes: o "(Novo)" +20 ganhava à outra. Agora ambos têm o mesmo score
  // (mesma janela, mesmo evento), e a com mais registos é que ganha.
  const d = resolvePurchaseAudience({
    eventId: null,
    eventName: "Ensaios da Anitta 2026",
    eventSlug: "ensaios-da-anitta-2026",
    catalog: [
      { audience_id_meta: "E_NOVO", name: "[SITE] Compras 180D - Ensaios da Anitta (Novo)", total_records_meta: 100 },
      { audience_id_meta: "E_VELHO", name: "[SITE] Purchase 180D - Ensaios da Anitta", total_records_meta: 9000 },
    ],
  });
  if (d.status !== "suggested_by_name") throw new Error(`expected suggested_by_name, got ${JSON.stringify(d)}`);
  assertEquals(d.audience_id_meta, "E_VELHO"); // a com mais registos
});

// ─────────────────────────── GATES preservados ─────────────────────────────
Deno.test("GATE 1: sem token purchase → score 0", () => {
  const r = scoreCandidate("[SITE] ViewContent 30D - Ivete Clareou", "Ivete Clareou 2026", "ivete-clareou-2026");
  assertEquals(r.score, 0);
});

Deno.test("GATE 2: tem purchase mas evento não casa → score 0", () => {
  const r = scoreCandidate("[SITE] Compras 180D - Outro Artista", "Ivete Clareou 2026", "ivete-clareou-2026");
  assertEquals(r.score, 0);
});

Deno.test("Score: ViewContent-Purchase penaliza 30 pts vs Purchase puro", () => {
  const a = scoreCandidate("[SITE] Purchase 180D - Ensaios da Anitta", "Ensaios da Anitta 2026", "ensaios-da-anitta-2026");
  const b = scoreCandidate("[SITE] ViewContent - Purchase 180D - Ensaios da Anitta", "Ensaios da Anitta 2026", "ensaios-da-anitta-2026");
  if (!(a.score > b.score + 25)) throw new Error(`expected a.score >> b.score, got a=${a.score} b=${b.score}`);
});

Deno.test("SEM MATCH: catálogo vazio → none", () => {
  const d = resolvePurchaseAudience({ eventId: null, eventName: "X", eventSlug: "x", catalog: [] });
  assertEquals(d.status, "none");
});

Deno.test("SEM MATCH: evento sem audiência de compra → none", () => {
  const d = resolvePurchaseAudience({
    eventId: null,
    eventName: "Evento Sem Audiencia 2026",
    eventSlug: "evento-sem-audiencia-2026",
    catalog: [
      { audience_id_meta: "X1", name: "[SITE] ViewContent 30D - Outro Evento" },
      { audience_id_meta: "X2", name: "Lookalike Compradores Mundo Propício" },
    ],
  });
  assertEquals(d.status, "none");
});

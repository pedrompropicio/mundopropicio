/**
 * Fixtures e utilitários partilhados pelos testes do módulo A&B.
 * Reutilizar nos testes de cálculo, UI e integração para garantir
 * que todos partem do MESMO modelo mental (Pista / VIP / Backstage).
 *
 * v2: adicionados fixtures para modo exploracao_propria.
 */
import type { ABZoneInput, ABFoodConfig } from "@/lib/event-ab-calc";

// ── Fixtures originais (modo terceirizacao) ───────────────────────────────────

export const FOOD_DEFAULT: ABFoodConfig = {
  fee_alimentos: 3000,
  repasse_alimentos_pct: 30,
  per_capita_alimentos: 6,
  per_capita_custo_alimentos: 0,
  custo_fixo_alimentos: 0,
};

export const ZONE_PISTA: ABZoneInput = {
  id: "pista",
  zone_label: "Pista",
  participants: 10000,
  open_bar: false,
  open_food: false,
  per_capita_bebidas: 12,
  repasse_bebidas_pct: 35,
  per_capita_custo_bebidas: 0,
  custo_fixo_bebidas: 0,
};

export const ZONE_VIP: ABZoneInput = {
  id: "vip",
  zone_label: "VIP",
  participants: 500,
  open_bar: true,
  open_food: true,
  per_capita_bebidas: 0,
  repasse_bebidas_pct: 0,
  per_capita_custo_bebidas: 0,
  custo_fixo_bebidas: 0,
};

export const ZONE_BACKSTAGE: ABZoneInput = {
  id: "backstage",
  zone_label: "Backstage",
  participants: 100,
  open_bar: false,
  open_food: false,
  per_capita_bebidas: 8,
  repasse_bebidas_pct: 40,
  per_capita_custo_bebidas: 0,
  custo_fixo_bebidas: 0,
};

export const ALL_ZONES: ABZoneInput[] = [ZONE_PISTA, ZONE_VIP, ZONE_BACKSTAGE];

// ── Fixtures v2 — modo exploracao_propria ────────────────────────────────────

/** Zona Pista em exploração própria: casa fatura e suporta custos directamente. */
export const ZONE_PISTA_EXPLORACAO: ABZoneInput = {
  ...ZONE_PISTA,
  per_capita_custo_bebidas: 5,    // custo CMV + operação por pessoa
  custo_fixo_bebidas: 2000,       // staff + aluguer de equipamento
};

/** Config de alimentos em exploração própria: restauração gerida pelo evento. */
export const FOOD_EXPLORACAO: ABFoodConfig = {
  fee_alimentos: 0,
  repasse_alimentos_pct: 0,
  per_capita_alimentos: 8,         // receita estimada/pessoa
  per_capita_custo_alimentos: 4,   // custo estimado/pessoa (CMV + operação)
  custo_fixo_alimentos: 5000,      // staff fixo da restauração
};

/** Zona com apenas custo fixo e sem participantes — resultado = −custo_fixo. */
export const ZONE_APENAS_CUSTO_FIXO: ABZoneInput = {
  id: "fixo",
  zone_label: "Staff Bar",
  participants: 0,
  open_bar: false,
  open_food: false,
  per_capita_bebidas: 10,
  repasse_bebidas_pct: 0,
  per_capita_custo_bebidas: 3,
  custo_fixo_bebidas: 1500,
};

// ── Utilitários ───────────────────────────────────────────────────────────────

/** Compara dois números com tolerância (default 0.01€ — alinhado ao Core rule). */
export const closeTo = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

/** Arredonda a 2 casas para asserções determinísticas. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Override leve de uma zona para criar variantes nos testes. */
export const withZone = (base: ABZoneInput, patch: Partial<ABZoneInput>): ABZoneInput => ({
  ...base,
  ...patch,
});

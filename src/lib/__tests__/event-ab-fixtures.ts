/**
 * Fixtures e utilitários partilhados pelos testes do módulo A&B.
 * Reutilizar nos testes de cálculo, UI e integração para garantir
 * que todos partem do MESMO modelo mental (Pista / VIP / Backstage).
 */
import type { ABZoneInput, ABFoodConfig } from "@/lib/event-ab-calc";

export const FOOD_DEFAULT: ABFoodConfig = {
  fee_alimentos: 3000,
  repasse_alimentos_pct: 30,
  per_capita_alimentos: 6,
};

export const ZONE_PISTA: ABZoneInput = {
  id: "pista",
  zone_label: "Pista",
  participants: 10000,
  open_bar: false,
  open_food: false,
  per_capita_bebidas: 12,
  repasse_bebidas_pct: 35,
};

export const ZONE_VIP: ABZoneInput = {
  id: "vip",
  zone_label: "VIP",
  participants: 500,
  open_bar: true,
  open_food: true,
  per_capita_bebidas: 0,
  repasse_bebidas_pct: 0,
};

export const ZONE_BACKSTAGE: ABZoneInput = {
  id: "backstage",
  zone_label: "Backstage",
  participants: 100,
  open_bar: false,
  open_food: false,
  per_capita_bebidas: 8,
  repasse_bebidas_pct: 40,
};

export const ALL_ZONES: ABZoneInput[] = [ZONE_PISTA, ZONE_VIP, ZONE_BACKSTAGE];

/** Compara dois números com tolerância (default 0.01€ — alinhado ao Core rule). */
export const closeTo = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

/** Arredonda a 2 casas para asserções determinísticas. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Override leve de uma zona para criar variantes nos testes. */
export const withZone = (base: ABZoneInput, patch: Partial<ABZoneInput>): ABZoneInput => ({
  ...base,
  ...patch,
});

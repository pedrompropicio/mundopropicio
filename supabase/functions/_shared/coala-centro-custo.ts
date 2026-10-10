/**
 * #230 — normalização do Centro Custo da planilha Coala, usada dos DOIS lados
 * (planilha e nome da rubrica): trim, colapsa espaços, remove acentos (NFKD —
 * o NFKC não separa o acento da letra) e minúsculas.
 * "Cachê Artistico", "Cachê Artístico" e "Seguro Viagem " normalizam igual.
 */
export const FALLBACK_CATEGORY_CODE = "0.0.99"; // "A classificar" — nunca 2.6.08

export const normCentroCusto = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200F\u2060\uFEFF\u00A0]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

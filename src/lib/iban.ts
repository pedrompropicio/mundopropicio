// IBAN validator — ISO 13616 (mod-97) + comprimento por país
// Não bloqueia: usado para emitir aviso amarelo na UI.

// Comprimentos oficiais por código de país
const IBAN_COUNTRY_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29,
  BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29,
  ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19,
  MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29,
  RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

export function normalizeIban(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export type IbanCheck = {
  valid: boolean;
  reason?: "empty" | "too_short" | "bad_chars" | "unknown_country" | "wrong_length" | "bad_check_digits";
  country?: string;
  expectedLength?: number;
};

export function validateIban(raw: string | null | undefined): IbanCheck {
  const iban = normalizeIban(raw);
  if (!iban) return { valid: false, reason: "empty" };
  if (iban.length < 4) return { valid: false, reason: "too_short" };
  if (!/^[A-Z0-9]+$/.test(iban)) return { valid: false, reason: "bad_chars" };

  const country = iban.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(country)) return { valid: false, reason: "bad_chars" };

  const expectedLength = IBAN_COUNTRY_LENGTHS[country];
  if (!expectedLength) return { valid: false, reason: "unknown_country", country };
  if (iban.length !== expectedLength) {
    return { valid: false, reason: "wrong_length", country, expectedLength };
  }

  // Mod-97: mover 4 primeiros para o fim, converter letras (A=10..Z=35), calcular mod 97
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const digit = code >= 65 && code <= 90 ? code - 55 : code - 48; // A-Z → 10-35, 0-9
    remainder = (remainder * (digit > 9 ? 100 : 10) + digit) % 97;
  }
  if (remainder !== 1) return { valid: false, reason: "bad_check_digits", country, expectedLength };
  return { valid: true, country, expectedLength };
}

export function ibanWarningMessage(check: IbanCheck): string | null {
  if (check.valid) return null;
  switch (check.reason) {
    case "empty": return null;
    case "too_short": return "IBAN demasiado curto.";
    case "bad_chars": return "IBAN contém caracteres inválidos.";
    case "unknown_country": return `Código de país "${check.country}" desconhecido.`;
    case "wrong_length": return `Comprimento inválido para ${check.country} (esperado ${check.expectedLength} caracteres).`;
    case "bad_check_digits": return "Dígitos de controlo inválidos — IBAN pode estar errado.";
    default: return "IBAN possivelmente inválido.";
  }
}

export function formatIban(iban: string): string {
  const n = normalizeIban(iban);
  return n.replace(/(.{4})/g, "$1 ").trim();
}

/** Snapshot metadata only: no defaults, conversion or financial calculations. */
export const originFields = ["currency", "original_amount", "fx_rate", "fx_rate_source"] as const;
export type OriginField = typeof originFields[number];
export type OriginSnapshot = Partial<Record<OriginField, unknown>>;
export type OriginValue =
  | { state: "missing" }
  | { state: "valid"; key: string; text: string }
  | { state: "invalid"; key: string; text: string };
export type Origin = Record<OriginField, OriginValue>;
export const originLabels: Record<OriginField, string> = {
  currency: "Moeda", original_amount: "Original", fx_rate: "Taxa FX", fx_rate_source: "Fonte FX",
};

// Decimal equality without rounding original values or using EUR's tolerance.
function decimalKey(text: string): string | null {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || !Number.isFinite(Number(text))) return null;
  let digits = (match[2] + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  let exponent = BigInt(match[4] ?? "0") - BigInt((match[3] ?? "").length);
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); exponent++; }
  return `${match[1] === "-" ? "-" : ""}${digits}e${exponent}`;
}

function normalize(value: unknown, numeric: boolean): OriginValue {
  // JSON null and omitted/undefined both mean not informed; zero is present.
  if (value == null) return { state: "missing" };
  const text = typeof value === "string" ? value : String(value);
  const key = numeric
    ? (typeof value === "number" || typeof value === "string" ? decimalKey(text) : null)
    : (typeof value === "string" && value.length > 0 ? value : null);
  if (key !== null) return { state: "valid", key, text };
  return { state: "invalid", key: `${typeof value}:${JSON.stringify(value) ?? text}:${text}`, text };
}

export function normalizeOrigin(snapshot: OriginSnapshot): Origin {
  return Object.fromEntries(originFields.map(field => [field,
    normalize(snapshot[field], field === "original_amount" || field === "fx_rate"),
  ])) as Origin;
}

export function changedOriginFields(origins: Origin[]): OriginField[] {
  return originFields.filter(field => {
    const keys = origins.map(origin => {
      const value = origin[field];
      return value.state === "missing" ? "missing" : `${value.state}:${value.key}`;
    });
    return new Set(keys).size > 1;
  });
}

export function originDisplayLines(origin: Origin, changed: OriginField[]): string[] {
  return originFields.flatMap(field => {
    const value = origin[field];
    if (value.state === "missing" && !changed.includes(field)) return [];
    const text = value.state === "missing" ? "Não informado"
      : value.state === "invalid" ? `Inválido (${value.text})` : value.text;
    return [`${originLabels[field]}${changed.includes(field) ? " (alterado)" : ""}: ${text}`];
  });
}

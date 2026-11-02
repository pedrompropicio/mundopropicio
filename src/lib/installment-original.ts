/** The decimal serialized by JSON must preserve cents too: a float multiply
 * round-trip alone can pass near MAX_SAFE_INTEGER while its JSON loses a cent.
 */
function centsPayload(cents: bigint): number {
  const amount = Number(cents) / 100;
  const text = String(amount);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Valor original excede o limite seguro de cêntimos.");
  const [whole, fraction = ""] = text.split(".");
  if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) !== cents) {
    throw new Error("Valor original excede o limite seguro de cêntimos.");
  }
  return amount;
}

/** Exact cents of the informed net original; weights are the confirmed EUR bases.
 * No FX conversion and no VAT calculation takes place here.
 */
export function distributeInstallmentOriginal(original: string | number | null | undefined, bases: number[]): number[] {
  const raw = original == null ? "" : String(original).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error("Informe o valor original não negativo com no máximo 2 casas decimais.");
  }
  const [whole, fraction = ""] = raw.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (cents > max) {
    throw new Error("Valor original excede o limite seguro de cêntimos.");
  }
  centsPayload(cents);
  if (!bases.length) throw new Error("Faltam as bases EUR das parcelas.");
  const weights = bases.map((base) => {
    const scaled = Math.round(base * 10000);
    if (!Number.isFinite(base) || base < 0 || !Number.isSafeInteger(scaled) || scaled / 10000 !== base) {
      throw new Error("Base EUR de parcela inválida ou fora do limite seguro (4 casas).");
    }
    return BigInt(scaled);
  });
  const total = weights.reduce((sum, w) => sum + w, 0n);
  if (total > max) throw new Error("Soma das bases EUR excede o limite seguro.");
  // Explicit zero needs no allocation, including when all weights are zero.
  if (cents === 0n) return weights.map(() => 0);
  if (total === 0n) throw new Error("Bases EUR nulas não permitem repartir um original positivo.");
  const shares = weights.map((w) => cents * w / total);
  const order = weights.map((w, i) => ({ i, remainder: cents * w % total }))
    .sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  const left = Number(cents - shares.reduce((sum, v) => sum + v, 0n));
  for (let i = 0; i < left; i++) shares[order[i].i]++;
  return shares.map(centsPayload);
}

export function installmentOriginals(currency: string, original: string, fx: string, bases: number[]): (number | null)[] {
  if (currency === "EUR") return bases.map(() => null);
  if (!["BRL", "USD", "GBP"].includes(currency)) throw new Error("Moeda original não suportada.");
  if (!fx.trim() || !Number.isFinite(Number(fx)) || Number(fx) <= 0 || parseFloat(fx) !== Number(fx)) throw new Error("Taxa de câmbio inválida para o parcelamento.");
  return distributeInstallmentOriginal(original, bases);
}

export const FOREIGN_INSTALLMENT_CHANGE = "Alterações monetárias de parcelas em moeda estrangeira estão indisponíveis até suporte atómico no servidor. Os valores originais e o câmbio seriam inconsistentes.";

/** Unknown legacy currency is deliberately fail-closed for monetary changes. */
export function assertEuroInstallmentChange(currencies: (string | null | undefined)[]) {
  if (!currencies.length || currencies.some((currency) => currency !== "EUR")) throw new Error(FOREIGN_INSTALLMENT_CHANGE);
}

/**
 * Conversão bruto → base (net) para parcelamento de transações.
 *
 * Problema: dividir o BRUTO (c/IVA) em N parcelas dá sempre soma exacta, mas
 * converter cada parcela para base com apenas 2 casas decimais perde cêntimos
 * na ida-e-volta (ex.: 8.374,94 / 1,23 = 6.808,8943 → 6.808,89 → c/IVA 8.374,93).
 *
 * Solução: gravar as bases com 4 casas decimais (a coluna `amount` é numeric).
 * Assim conseguimos simultaneamente:
 *  (a) soma das bases == base total da factura;
 *  (b) round2(net_i × ivaMultiplier) == gross_i para cada parcela.
 */

const SCALE = 10_000; // 4 casas decimais

function round4(v: number): number {
  return Math.round(v * SCALE) / SCALE;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computeInstallmentNets(
  grossParcels: number[],
  baseTotal: number,
  ivaMultiplier: number,
): number[] {
  const n = grossParcels.length;
  if (n === 0) return [];
  const mult = Number(ivaMultiplier) || 1;

  // Inteiros escalados a 10^4 para evitar aritmética float encadeada.
  const scaled = grossParcels.map((g) => Math.round((Number(g) || 0) / mult * SCALE));

  if (n === 1) {
    // Uma só parcela: a base é a base total introduzida no formulário.
    return [round4(baseTotal)];
  }

  const baseTotalScaled = Math.round((Number(baseTotal) || 0) * SCALE);
  const sumHead = scaled.slice(0, n - 1).reduce((s, v) => s + v, 0);
  const lastAdjusted = baseTotalScaled - sumHead;

  const nets = scaled.map((v) => v / SCALE);
  const lastGross = Number(grossParcels[n - 1]) || 0;
  const candidate = lastAdjusted / SCALE;

  // Verificação de segurança: o c/IVA da última parcela tem de bater com o wizard.
  nets[n - 1] = round2(candidate * mult) === round2(lastGross)
    ? round4(candidate)
    : round4(scaled[n - 1] / SCALE);

  return nets.map((v) => round4(v));
}

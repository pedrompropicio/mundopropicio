/**
 * Ordenação de códigos hierárquicos do plano de contas ("1.2.03" < "1.10.01").
 *
 * Movido de `src/lib/utils.ts` para o pacote partilhado: o gerador do documento
 * do sócio corre no browser (ERP) e em Deno (edge function `partner-statement`)
 * e não pode depender de clsx/tailwind-merge. `src/lib/utils.ts` reexporta.
 */
export function compareHierarchicalCodes(a?: string | null, b?: string | null) {
  const safeA = a?.trim() ?? "";
  const safeB = b?.trim() ?? "";

  if (safeA === safeB) return 0;

  const partsA = safeA.split(".");
  const partsB = safeB.split(".");
  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const partA = partsA[i] ?? "";
    const partB = partsB[i] ?? "";

    if (partA === partB) continue;
    if (!partA) return -1;
    if (!partB) return 1;

    const numA = Number(partA);
    const numB = Number(partB);
    const isNumA = !Number.isNaN(numA);
    const isNumB = !Number.isNaN(numB);

    if (isNumA && isNumB) {
      const diff = numA - numB;
      if (diff !== 0) return diff;
      continue;
    }

    if (isNumA !== isNumB) {
      return isNumA ? -1 : 1;
    }

    const textDiff = partA.localeCompare(partB, undefined, { numeric: true, sensitivity: "base" });
    if (textDiff !== 0) return textDiff;
  }

  return safeA.localeCompare(safeB, undefined, { numeric: true, sensitivity: "base" });
}

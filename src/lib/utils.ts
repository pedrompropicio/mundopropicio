import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

export function sortByHierarchicalCode<T>(items: T[], getCode: (item: T) => string | null | undefined) {
  return [...items].sort((a, b) => compareHierarchicalCodes(getCode(a), getCode(b)));
}

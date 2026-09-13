/**
 * Texto dos documentos de fecho — épica #146 (f), ponto 1.
 *
 * Decisão do Pedro (13/09/2026): o **nome do fechamento é interno**. Nunca
 * aparece no PDF de um sócio nem no Portal do Sócio, e a origem da quota nunca
 * se descreve por hierarquia ("fechamento acima", "nível", "pai", "filho") —
 * escreve-se como **cálculo contratual**:
 *
 *   Resultado do evento (despesas c/IVA) X · Sócios locais NN% = Y · <sócio> PP% = Z
 *
 * Função pura: não fala com a BD nem com o React. Testada em
 * `src/lib/__tests__/settlement-doc-text.test.ts`.
 */

export interface QuotaOriginInput {
  /** Resultado do evento na base da quota (o "X"). */
  parentResult: number;
  /** true = a quota é calculada sobre despesas c/IVA. */
  grossExpenses: boolean;
  /** Percentagem contratada do resultado do evento (o "NN"). */
  sharePct: number;
  /** Valor da quota (o "Y"). */
  quota: number;
  /** Nome do sócio destinatário; ausente = peça interna da equipa. */
  partnerName?: string | null;
  /** Percentagem do sócio dentro da quota (o "PP"). */
  partnerPct?: number | null;
  /** Parte do sócio (o "Z"). */
  partnerShare?: number | null;
}

/** Palavras proibidas nos documentos de sócio (ponto 1 da (f)). */
export const FORBIDDEN_DOC_TERMS = [
  "fechamento acima",
  "fechamento abaixo",
  "nível",
  "nivel",
  "pai",
  "filho",
  "apuramento acima",
];

const pctText = (v: number) => {
  const n = Math.round(Number(v || 0) * 10000) / 10000;
  return `${String(n).replace(".", ",")}%`;
};

/**
 * Linha de origem da quota, sem hierarquia. `fmt` é o formatador de moeda do
 * chamador (ecrã usa `formatCurrency`; o PDF usa o mesmo).
 */
export function quotaOriginText(input: QuotaOriginInput, fmt: (v: number) => string): string {
  const base = input.grossExpenses ? "despesas c/IVA" : "despesas s/IVA";
  const parts = [
    `Resultado do evento (${base}) ${fmt(input.parentResult)}`,
    `Sócios locais ${pctText(input.sharePct)} = ${fmt(input.quota)}`,
  ];
  if (input.partnerName && input.partnerPct != null && input.partnerShare != null) {
    parts.push(`${input.partnerName} ${pctText(input.partnerPct)} = ${fmt(input.partnerShare)}`);
  }
  return parts.join(" · ");
}

/** Título do documento: "Fecho do evento X" (+ " — <sócio>" na peça de um sócio). */
export function settlementDocTitle(eventName: string, partnerName?: string | null): string {
  return partnerName ? `Fecho do evento ${eventName} — ${partnerName}` : `Fecho do evento ${eventName}`;
}

/**
 * Nome do ficheiro: o nome do fechamento só entra na peça INTERNA (sem sócio).
 * No PDF de um sócio é sempre `Fecho_<evento>_<sócio>.pdf`.
 */
export function settlementDocFileName(args: {
  eventName: string;
  partnerName?: string | null;
  settlementName?: string | null;
  multipleSettlements: boolean;
}): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_");
  if (args.partnerName) return `Fecho_${safe(args.eventName)}_${safe(args.partnerName)}.pdf`;
  const suffix =
    args.multipleSettlements && args.settlementName ? `_${safe(args.settlementName)}` : "";
  return `Fecho_${safe(args.eventName)}${suffix}.pdf`;
}

/**
 * Fechamento inferido para o PDF de um sócio: aquele onde ele **acerta**
 * (`mode = 'settles'`). O selector do ecrã serve só para a peça interna.
 */
export function inferSettlesSettlementId<
  T extends { supplier_id?: string | null; mode?: string; settlement_id: string },
>(participants: T[], supplierId: string | null | undefined): string | null {
  if (!supplierId) return null;
  const hit = participants.find((p) => p.supplier_id === supplierId && p.mode === "settles");
  return hit?.settlement_id ?? null;
}

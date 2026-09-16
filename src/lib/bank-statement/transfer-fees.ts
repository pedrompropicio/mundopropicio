/**
 * Taxas de transferência internacional identificadas pela REFERÊNCIA (D-ERP74).
 *
 * Cada transferência SEPA+ internacional deixa no extrato uma linha-mãe
 * (`TRF.CRÉD.N.SEPA+EMITIDA <ref>`) e até quatro linhas de taxa com a MESMA
 * referência numérica no fim da descrição:
 *
 *   TRF.CRÉD.N.SEPA+(DESP.SHA) <ref>      → despesa do banco correspondente
 *   DESPESAS SWIFT <ref>                  → serviço com IVA
 *   IMP.S/VALOR ACRESCENTADO <ref>        → o IVA (23%) do SWIFT
 *   IMP.DE SELO <ref>                     → imposto, sem IVA
 *
 * Este módulo só LÊ e AGRUPA: não cria nada, não decide nada sozinho. A regra
 * (D-ERP29) mantém-se — propõe-se, a pessoa confirma. O evento vem da
 * transação-mãe, nunca do padrão, e por isso estes casos NÃO geram
 * `bank_line_rules`.
 */

export type FeeKind = "sha" | "swift" | "vat" | "stamp";

/** Maiúsculas sem acentos: a descrição do banco varia na acentuação. */
function norm(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const FEE_PATTERNS: { kind: FeeKind; needle: string }[] = [
  { kind: "sha", needle: "TRF.CRED.N.SEPA+(DESP.SHA)" },
  { kind: "swift", needle: "DESPESAS SWIFT" },
  { kind: "vat", needle: "IMP.S/VALOR ACRESCENTADO" },
  { kind: "stamp", needle: "IMP.DE SELO" },
];

const MOTHER_NEEDLE = "TRF.CRED.N.SEPA+EMITIDA";

/** Referência numérica longa no fim da descrição (≥ 8 dígitos). */
function trailingRef(description: string): string | null {
  const m = norm(description).match(/(\d{8,})\s*$/);
  return m ? m[1] : null;
}

/** A linha é uma taxa de transferência? Devolve o tipo e a referência. */
export function classifyFeeLine(description: string): { kind: FeeKind; ref: string } | null {
  const d = norm(description);
  const hit = FEE_PATTERNS.find((p) => d.includes(p.needle));
  if (!hit) return null;
  const ref = trailingRef(description);
  return ref ? { kind: hit.kind, ref } : null;
}

/** A linha é a transferência-mãe? Devolve a referência. */
export function extractMotherRef(description: string): string | null {
  return norm(description).includes(MOTHER_NEEDLE) ? trailingRef(description) : null;
}

export interface FeeLineInput {
  id: string;
  description: string;
  amount: number;
  booking_date: string;
  value_date?: string | null;
}

export interface FeeGroup {
  ref: string;
  /** Linhas do grupo, com o tipo de taxa. */
  members: { kind: FeeKind; line: FeeLineInput }[];
  total: number;
  bookingDate: string;
}

/** Agrupa as linhas de taxa por referência (só as que têm referência). */
export function buildFeeGroups(lines: FeeLineInput[]): FeeGroup[] {
  const byRef = new Map<string, { kind: FeeKind; line: FeeLineInput }[]>();
  for (const line of lines) {
    const c = classifyFeeLine(line.description);
    if (!c) continue;
    const arr = byRef.get(c.ref) ?? [];
    arr.push({ kind: c.kind, line });
    byRef.set(c.ref, arr);
  }
  return Array.from(byRef.entries()).map(([ref, members]) => ({
    ref,
    members,
    total: Math.round(members.reduce((a, m) => a + Number(m.line.amount ?? 0), 0) * 100) / 100,
    bookingDate: String(
      members.map((m) => String(m.line.booking_date ?? "").slice(0, 10)).sort()[0] ?? "",
    ),
  }));
}

export interface FeeLeg {
  /** `swift` = serviço + o seu IVA; `sha` = despesa do banco + imposto de selo. */
  key: "swift" | "sha";
  label: string;
  lineIds: string[];
  /** Valor LÍQUIDO da transação (Core rule). */
  amount: number;
  ivaRate: number;
  /** Bruto que saiu do banco. */
  paidAmount: number;
}

/**
 * Dois lançamentos, porque as taxas não têm todas a mesma taxa de IVA:
 *  1. DESPESAS SWIFT + IMP.S/VALOR ACRESCENTADO → base = SWIFT, IVA 23 %,
 *     pago = soma dos dois (o IVA é exactamente o imposto cobrado);
 *  2. DESP.SHA + IMP.DE SELO → base = soma, IVA 0 %.
 */
export function buildFeeLegs(group: FeeGroup): FeeLeg[] {
  const abs = (k: FeeKind) =>
    Math.round(
      group.members
        .filter((m) => m.kind === k)
        .reduce((a, m) => a + Math.abs(Number(m.line.amount ?? 0)), 0) * 100,
    ) / 100;
  const ids = (ks: FeeKind[]) =>
    group.members.filter((m) => ks.includes(m.kind)).map((m) => m.line.id);

  const legs: FeeLeg[] = [];

  const swift = abs("swift");
  const vat = abs("vat");
  if (swift > 0 || vat > 0) {
    legs.push({
      key: "swift",
      label: "Despesas SWIFT + IVA",
      lineIds: ids(["swift", "vat"]),
      amount: swift > 0 ? swift : Math.round((vat / 0.23) * 100) / 100,
      ivaRate: 23,
      paidAmount: Math.round((swift + vat) * 100) / 100,
    });
  }

  const sha = abs("sha");
  const stamp = abs("stamp");
  if (sha > 0 || stamp > 0) {
    const sum = Math.round((sha + stamp) * 100) / 100;
    legs.push({
      key: "sha",
      label: "Despesas do banco + Imposto de selo",
      lineIds: ids(["sha", "stamp"]),
      amount: sum,
      ivaRate: 0,
      paidAmount: sum,
    });
  }

  return legs;
}

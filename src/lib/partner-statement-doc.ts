/**
 * (g4) DOCUMENTO DO SÓCIO — construtor puro no padrão da prestação de contas.
 *
 * Regras invioláveis (D25 + adenda g4):
 *  R1 — IVA SEMPRE linha a linha (calcIvaAmount) e só depois se soma.
 *  R3 — receitas s/IVA · despesas c/IVA · resultado = receitas − despesas c/IVA
 *       (a base é do FECHAMENTO; quem chama diz se é c/IVA ou s/IVA).
 *  R6 — a parte do destinatário é ROUND(resultado × %, 2); o resto sai por
 *       subtracção, para que as duas linhas somem exactamente o resultado.
 *  ESTANQUE — o destinatário aparece pelo nome; TODOS os outros participantes
 *       colapsam numa única linha. Nunca nomes, percentagens, bases ou valores
 *       de outros participantes; nunca "nível", "fechamento acima/abaixo" nem
 *       "bases diferentes".
 */
import { calcIvaAmount, roundCents, type IvaRate } from "@/lib/iva";
import { buildCategoryLookup } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes } from "@/lib/utils";
import { HOUSE_PARTNER_NAME } from "@/lib/settlement-participants";
import {
  effectiveExpenseBasisLabel,
  effectiveResultBasisLabel,
  effectiveUsesGrossExpenses,
} from "@/lib/settlement-basis";

export type DocLocale = "pt-PT" | "pt-BR";

export interface StatementParticipantInput {
  name: string;
  percentage: number;
  isHouse?: boolean;
}

export interface StatementRevenueLine {
  /** Origem (Bilheteira/Bilheteria, Bares, Patrocínios, …). */
  origin: string;
  description?: string;
  /** Valor s/IVA. */
  net: number;
}

export interface StatementExpenseLine {
  categoryId: string | null;
  description: string;
  base: number;
  ivaRate: number;
  attachments?: number;
}

export interface StatementExtraItem {
  label: string;
  value: number;
  /** (g13) Itemização do termo (ex.: receitas próprias, operações de terceiros). */
  items?: Array<{ label: string; value: number }>;
}

/**
 * (g13) CASCATA do resultado — quando o acordo do sócio se apura sobre uma parte
 * do resultado do evento, o documento mostra a conta desde o evento inteiro e
 * nomeia os sócios cujas partes são deduzidas antes da parte da sociedade.
 * Nunca se nomeiam os acordos, só as pessoas.
 */
export interface StatementCascadeDeduction {
  name: string;
  percentage: number;
  value: number;
}

export interface StatementCascadeLevel {
  /** Valor de partida deste passo (o resultado do evento no primeiro passo). */
  baseValue: number;
  deductions: StatementCascadeDeduction[];
  /** Percentagem contratada da sociedade sobre o valor de partida. */
  quotaPct: number;
  quota: number;
}

export interface StatementCascade {
  levels: StatementCascadeLevel[];
}

export interface PartnerStatementDocInput {
  locale?: DocLocale;
  eventName: string;
  eventDate: string | null;
  eventLocation?: string | null;
  generatedAt?: Date;
  companyName?: string | null;
  logoDataUrl?: string | null;
  /** Nome do destinatário do documento — o único participante nomeado. */
  recipientName: string;
  /** Todos os participantes do fechamento, casa incluída. */
  participants: StatementParticipantInput[];
  revenues: StatementRevenueLine[];
  expenseLines: StatementExpenseLine[];
  categories: any[];
  /** Base do FECHAMENTO: true = despesas c/IVA. */
  usesGrossExpenses: boolean;
  /**
   * (g10) O fechamento devolve o IVA dedutível do fechamento acima. Nesse caso a
   * base EFETIVA é s/IVA e o documento apresenta "Despesas s/IVA" e
   * "Resultado s/IVA" directamente, sem falar do mecanismo do IVA.
   */
  returnsDeductibleVat?: boolean;
  /**
   * Termos adicionais do acordo já calculados pelo motor (quota contratual do
   * apuramento de origem, IVA dedutível devolvido, activos adicionais…).
   * Entram no resultado depois das receitas e antes das despesas.
   */
  extras?: StatementExtraItem[];
  /** Resultado do nó vindo do motor — quando dado, manda sobre o cálculo local. */
  resultOverride?: number | null;
  /** Parte do destinatário vinda do motor — quando dada, manda sobre R6. */
  recipientShareOverride?: number | null;
  /**
   * (g4 adenda 13/09) Termos do acerto do sócio — a secção 5 fecha na base a
   * transferir e, quando o repasse é facturado, no total com IVA 23%.
   */
  /** Despesas do evento pagas pelo próprio sócio (financiamento a devolver-lhe). */
  paidByPartner?: number;
  /** (g5) Ajustes manuais ao desembolso (valor com sinal). */
  disbursementAdjustments?: number;
  /** (g5) Receitas do evento já em poder do sócio, itemizadas. */
  revenuesHeld?: Array<{ label: string; value: number }>;
  /** Extras do sócio a abater. */
  partnerExtras?: number;
  /** Já adiantado ao sócio. */
  partnerAdvances?: number;
  /** Repasse facturado com IVA (23%) — só incide quando a base é positiva. */
  transferWithVat?: boolean;
}

export interface StatementRubrica {
  code: string;
  name: string;
  base: number;
  iva: number;
  total: number;
  documents: number;
  lines: Array<{ description: string; base: number; iva: number; total: number; ivaRate: number; documents: number }>;
}

export interface StatementFamily {
  code: string;
  name: string;
  base: number;
  iva: number;
  total: number;
  rubricas: StatementRubrica[];
}

export interface StatementShareRow {
  name: string;
  percentage: number;
  value: number;
  isRecipient: boolean;
}

export interface PartnerStatementDoc {
  locale: DocLocale;
  t: StatementTerms;
  title: string;
  subtitle: string;
  dataNote: string;
  fileBase: string;
  recipientName: string;
  agreement: StatementShareRow[];
  revenues: StatementRevenueLine[];
  revenueNet: number;
  extras: StatementExtraItem[];
  extrasTotal: number;
  families: StatementFamily[];
  expenseBase: number;
  expenseIva: number;
  expenseTotal: number;
  /** Valor de despesa que entra no resultado (c/IVA ou s/IVA conforme o fechamento). */
  expenseForResult: number;
  /** Base EFETIVA do fechamento (já com a regra g10 aplicada). */
  usesGrossExpenses: boolean;
  /** (g10) "Despesas c/IVA" | "Despesas s/IVA" — rótulo da secção 3/4. */
  expenseBasisLabel: string;
  /** (g10) "Resultado c/IVA" | "Resultado s/IVA". */
  resultBasisLabel: string;
  result: number;
  recipientShare: number;
  othersShare: number;
  /** (g4 adenda) Acerto do sócio — base a transferir, IVA do repasse e total. */
  paidByPartner: number;
  disbursementAdjustments: number;
  revenuesHeld: Array<{ label: string; value: number }>;
  totalRevenuesHeld: number;
  financingToReturn: number;
  partnerExtras: number;
  partnerAdvances: number;
  transferBase: number;
  transferWithVat: boolean;
  transferVat: number;
  transferTotal: number;
}

export interface StatementTerms {
  statement: string;
  summarySheet: string;
  detailSheet: string;
  section1: string;
  section2: string;
  section3: string;
  section4: string;
  section5: (partner: string) => string;
  partner: string;
  quota: string;
  value: string;
  origin: string;
  description: string;
  netValue: string;
  family: string;
  rubrica: string;
  iva: string;
  totalWithIva: string;
  attachments: string;
  totalRevenues: string;
  totalExpenses: string;
  subtotal: string;
  total: string;
  resultLine: string;
  ticketing: string;
  localPartners: string;
  dataAt: (d: string) => string;
  ivaNote: string;
  detailARevenues: string;
  detailBExpenses: string;
  ofResult: string;
  paidByPartnerLine: (partner: string) => string;
  adjustmentsLine: string;
  revenuesHeldLine: (partner: string) => string;
  financingLine: string;
  extrasLine: string;
  advancesLine: (partner: string) => string;
  transferBaseLine: (partner: string) => string;
  receiveBaseLine: (partner: string) => string;
  vatOnTransfer: string;
  transferTotalLine: (partner: string) => string;
  receiveTotalLine: (partner: string) => string;
  fileName: string;
  page: string;
  of: string;
}

const TERMS: Record<DocLocale, StatementTerms> = {
  "pt-PT": {
    statement: "Prestação de contas",
    summarySheet: "Resumo",
    detailSheet: "Detalhamento",
    section1: "1. O ACORDO",
    section2: "2. AS RECEITAS DO EVENTO (s/IVA)",
    section3: "3. AS DESPESAS DO EVENTO",
    section4: "4. O RESULTADO",
    section5: (p) => `5. A PARTE DE ${p.toUpperCase()}`,
    partner: "Sócio",
    quota: "Quota",
    value: "Valor",
    origin: "Origem",
    description: "Descrição",
    netValue: "Valor s/IVA",
    family: "Família",
    rubrica: "Rubrica",
    iva: "IVA",
    totalWithIva: "Total c/IVA",
    attachments: "Anexos",
    totalRevenues: "Total das receitas",
    totalExpenses: "Total das despesas",
    subtotal: "Subtotal",
    total: "TOTAL",
    resultLine: "Resultado",
    ticketing: "Bilheteira",
    localPartners: "Sócios locais",
    dataAt: (d) => `Dados do sistema em ${d} · valores em euros`,
    ivaNote:
      "O IVA é calculado linha a linha sobre o valor da despesa (artigo 18.º do CIVA) e só depois somado.",
    detailARevenues: "A. Receitas linha a linha (s/IVA)",
    detailBExpenses: "B. Despesas por família e rubrica (c/IVA)",
    ofResult: "do resultado",
    paidByPartnerLine: (p) => `+ Despesas do evento pagas por ${p}`,
    adjustmentsLine: "+/- Ajustes ao desembolso",
    revenuesHeldLine: (p) => `- Receitas do evento em poder de ${p}`,
    financingLine: "= Financiamento a devolver",
    extrasLine: "- Extras",
    advancesLine: (p) => `- Já adiantado a ${p}`,
    transferBaseLine: (p) => `= BASE A TRANSFERIR A ${p.toUpperCase()}`,
    receiveBaseLine: (p) => `= BASE A RECEBER DE ${p.toUpperCase()}`,
    vatOnTransfer: "+ IVA 23% sobre o repasse",
    transferTotalLine: (p) => `= TOTAL A TRANSFERIR A ${p.toUpperCase()}`,
    receiveTotalLine: (p) => `= TOTAL A RECEBER DE ${p.toUpperCase()}`,
    fileName: "Prestacao_de_Contas",
    page: "Página",
    of: "de",
  },
  "pt-BR": {
    statement: "Prestação de contas",
    summarySheet: "Resumo",
    detailSheet: "Detalhamento",
    section1: "1. O ACORDO",
    section2: "2. AS RECEITAS DO EVENTO (s/IVA)",
    section3: "3. AS DESPESAS DO EVENTO",
    section4: "4. O RESULTADO",
    section5: (p) => `5. A PARTE DE ${p.toUpperCase()}`,
    partner: "Sócio",
    quota: "Cota",
    value: "Valor",
    origin: "Origem",
    description: "Descrição",
    netValue: "Valor s/IVA",
    family: "Família",
    rubrica: "Rubrica",
    iva: "IVA",
    totalWithIva: "Total c/IVA",
    attachments: "Anexos",
    totalRevenues: "Total das receitas",
    totalExpenses: "Total das despesas",
    subtotal: "Subtotal",
    total: "TOTAL",
    resultLine: "Resultado",
    ticketing: "Bilheteria",
    localPartners: "Sócios locais",
    dataAt: (d) => `Dados do sistema em ${d} · valores em euros`,
    ivaNote:
      "O IVA é calculado linha a linha sobre o valor da despesa (artigo 18.º do CIVA) e só depois somado.",
    detailARevenues: "A. Receitas linha a linha (s/IVA)",
    detailBExpenses: "B. Despesas por família e rubrica (c/IVA)",
    ofResult: "do resultado",
    paidByPartnerLine: (p) => `+ Despesas do evento pagas por ${p}`,
    adjustmentsLine: "+/- Ajustes ao desembolso",
    revenuesHeldLine: (p) => `- Receitas do evento em poder de ${p}`,
    financingLine: "= Financiamento a devolver",
    extrasLine: "- Extras",
    advancesLine: (p) => `- Já adiantado a ${p}`,
    transferBaseLine: (p) => `= BASE A TRANSFERIR A ${p.toUpperCase()}`,
    receiveBaseLine: (p) => `= BASE A RECEBER DE ${p.toUpperCase()}`,
    vatOnTransfer: "+ IVA 23% sobre o repasse",
    transferTotalLine: (p) => `= TOTAL A TRANSFERIR A ${p.toUpperCase()}`,
    receiveTotalLine: (p) => `= TOTAL A RECEBER DE ${p.toUpperCase()}`,
    fileName: "Prestacao_de_Contas",
    page: "Página",
    of: "de",
  },
};

export function statementTerms(locale: DocLocale | undefined): StatementTerms {
  return TERMS[locale === "pt-BR" ? "pt-BR" : "pt-PT"];
}

/** Termos proibidos no documento do sócio (estanque). */
export const FORBIDDEN_DOC_TERMS = [
  "nível",
  "nivel",
  "fechamento acima",
  "fechamento abaixo",
  "bases diferentes",
  // (g9c · #166) o documento do sócio nunca revela a estrutura de fechos.
  "fechamento",
  "fecho",
];

/** Taxa normal de IVA PT aplicada ao repasse facturado. */
export const TRANSFER_IVA_RATE: IvaRate = 23;

const isHouseName = (n: string) => n.toLowerCase().includes(HOUSE_PARTNER_NAME.toLowerCase());

function fmtDate(iso: string | null | undefined, locale: DocLocale): string {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function safeFileToken(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function buildPartnerStatementDoc(input: PartnerStatementDocInput): PartnerStatementDoc {
  const locale: DocLocale = input.locale === "pt-BR" ? "pt-BR" : "pt-PT";
  const t = statementTerms(locale);
  const lookup = buildCategoryLookup(input.categories);

  // ---- Despesas: família → rubrica → linhas (IVA linha a linha) ----
  const famMap = new Map<string, StatementFamily>();
  let expenseBase = 0;
  let expenseIva = 0;

  for (const line of input.expenseLines) {
    const base = Number(line.base) || 0;
    const rate = Number(line.ivaRate) || 0;
    const iva = calcIvaAmount(base, rate);
    expenseBase = roundCents(expenseBase + base);
    expenseIva = roundCents(expenseIva + iva);

    const info = line.categoryId ? lookup[line.categoryId] : null;
    // Linhas sem rubrica no plano de contas agrupam numa família neutra
    // ("Outras despesas") — nunca aparecem códigos técnicos no documento.
    const famCode = info?.l2Code ?? info?.code ?? "";
    const famName = info?.l2Name ?? info?.name ?? "Outras despesas";
    const rubCode = info?.code ?? "";
    const rubName = info?.name ?? "Outras despesas";
    const rubKey = `${rubCode}|${rubName}`;

    let fam = famMap.get(famCode);
    if (!fam) {
      fam = { code: famCode, name: famName, base: 0, iva: 0, total: 0, rubricas: [] };
      famMap.set(famCode, fam);
    }
    fam.base = roundCents(fam.base + base);
    fam.iva = roundCents(fam.iva + iva);
    fam.total = roundCents(fam.base + fam.iva);

    let rub = fam.rubricas.find((r) => `${r.code}|${r.name}` === rubKey);
    if (!rub) {
      rub = { code: rubCode, name: rubName, base: 0, iva: 0, total: 0, documents: 0, lines: [] };
      fam.rubricas.push(rub);
    }
    rub.base = roundCents(rub.base + base);
    rub.iva = roundCents(rub.iva + iva);
    rub.total = roundCents(rub.base + rub.iva);
    rub.documents += Number(line.attachments) || 0;
    rub.lines.push({
      description: line.description || "—",
      base,
      iva,
      total: roundCents(base + iva),
      ivaRate: rate,
      documents: Number(line.attachments) || 0,
    });
  }

  const families = [...famMap.values()]
    .map((f) => ({
      ...f,
      rubricas: f.rubricas.sort((a, b) => compareHierarchicalCodes(a.code, b.code)),
    }))
    .sort((a, b) => compareHierarchicalCodes(a.code, b.code));

  const expenseTotal = roundCents(expenseBase + expenseIva);
  // (g10) Base EFETIVA: quando o fechamento devolve o IVA dedutível do
  // fechamento acima, o documento apura sobre despesas s/IVA.
  const usesGrossEffective = effectiveUsesGrossExpenses({
    usesGrossExpenses: input.usesGrossExpenses,
    returnsParentDeductibleVat: input.returnsDeductibleVat,
  });
  const expenseForResult = usesGrossEffective ? expenseTotal : expenseBase;

  // ---- Receitas ----
  const revenues = input.revenues
    .map((r) => ({ ...r, net: roundCents(r.net) }))
    .filter((r) => Math.abs(r.net) > 0.004);
  const revenueNet = roundCents(revenues.reduce((s, r) => s + r.net, 0));

  const extras = (input.extras ?? [])
    .map((e) => ({ label: e.label, value: roundCents(e.value) }))
    .filter((e) => Math.abs(e.value) > 0.004)
    // (g10) Com base efetiva s/IVA não se descreve o mecanismo do IVA dedutível:
    // as despesas já aparecem s/IVA e o resultado é o mesmo.
    .filter((e) => usesGrossEffective || !/iva\s*dedut/i.test(e.label));
  const extrasTotal = roundCents(extras.reduce((s, e) => s + e.value, 0));

  const result =
    input.resultOverride != null
      ? roundCents(input.resultOverride)
      : roundCents(revenueNet + extrasTotal - expenseForResult);

  // ---- Acordo: destinatário nomeado + colapso de todos os outros ----
  const recipient =
    input.participants.find((p) => p.name === input.recipientName) ??
    ({ name: input.recipientName, percentage: 0 } as StatementParticipantInput);
  const others = input.participants.filter((p) => p !== recipient);
  const recipientPct = roundCents(Number(recipient.percentage) || 0);
  const othersPct = roundCents(100 - recipientPct);

  const resultCents = Math.round(result * 100);
  const recipientShare =
    input.recipientShareOverride != null
      ? roundCents(input.recipientShareOverride)
      : Math.round(resultCents * (recipientPct / 100)) / 100;
  const othersShare = roundCents((resultCents - Math.round(recipientShare * 100)) / 100);

  // Excepção: se o único outro participante for a casa, escreve o nome da casa.
  const onlyOtherIsHouse = others.length === 1 && (others[0].isHouse || isHouseName(others[0].name));
  const othersLabel = onlyOtherIsHouse ? "Mundo Propício" : t.localPartners;

  const agreement: StatementShareRow[] = [
    { name: recipient.name, percentage: recipientPct, value: recipientShare, isRecipient: true },
  ];
  if (othersPct > 0.004 || Math.abs(othersShare) > 0.004) {
    agreement.push({ name: othersLabel, percentage: othersPct, value: othersShare, isRecipient: false });
  }

  // ---- (g4 adenda) Acerto do sócio: base a transferir e IVA do repasse ----
  const paidByPartner = roundCents(input.paidByPartner ?? 0);
  const partnerExtras = roundCents(input.partnerExtras ?? 0);
  const partnerAdvances = roundCents(input.partnerAdvances ?? 0);
  const disbursementAdjustments = roundCents(input.disbursementAdjustments ?? 0);
  const revenuesHeld = (input.revenuesHeld ?? []).map((r) => ({
    label: r.label,
    value: roundCents(Number(r.value) || 0),
  }));
  const totalRevenuesHeld = roundCents(revenuesHeld.reduce((a, r) => a + r.value, 0));
  const financingToReturn = roundCents(paidByPartner + disbursementAdjustments - totalRevenuesHeld);
  const transferBase = roundCents(
    recipientShare + financingToReturn - partnerExtras - partnerAdvances,
  );
  const transferWithVat = input.transferWithVat === true;
  // O IVA do repasse só incide quando há valor a transferir ao sócio.
  const transferVat =
    transferWithVat && transferBase > 0 ? calcIvaAmount(transferBase, TRANSFER_IVA_RATE) : 0;
  const transferTotal = roundCents(transferBase + transferVat);

  const generatedAt = input.generatedAt ?? new Date();
  const generatedLabel = `${String(generatedAt.getDate()).padStart(2, "0")}/${String(
    generatedAt.getMonth() + 1,
  ).padStart(2, "0")}/${generatedAt.getFullYear()}`;

  const subtitle = [t.statement, input.eventLocation || null, fmtDate(input.eventDate, locale)]
    .filter(Boolean)
    .join(" · ");

  return {
    locale,
    t,
    title: input.eventName,
    subtitle,
    dataNote: t.dataAt(generatedLabel),
    fileBase: `${t.fileName}_${safeFileToken(input.eventName)}_${safeFileToken(recipient.name)}`,
    recipientName: recipient.name,
    agreement,
    revenues,
    revenueNet,
    extras,
    extrasTotal,
    families,
    expenseBase,
    expenseIva,
    expenseTotal,
    expenseForResult,
    usesGrossExpenses: usesGrossEffective,
    expenseBasisLabel: effectiveExpenseBasisLabel({
      usesGrossExpenses: input.usesGrossExpenses,
      returnsParentDeductibleVat: input.returnsDeductibleVat,
    }),
    resultBasisLabel: effectiveResultBasisLabel({
      usesGrossExpenses: input.usesGrossExpenses,
      returnsParentDeductibleVat: input.returnsDeductibleVat,
    }),
    result,
    recipientShare,
    othersShare,
    paidByPartner,
    disbursementAdjustments,
    revenuesHeld,
    totalRevenuesHeld,
    financingToReturn,
    partnerExtras,
    partnerAdvances,
    transferBase,
    transferWithVat,
    transferVat,
    transferTotal,
  };
}

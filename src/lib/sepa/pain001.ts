/**
 * Gerador de ficheiro SEPA ISO 20022 pain.001.001.09 (formato C2PSP 06.01)
 * aceite pelo NetBanco Empresas do Santander PT.
 *
 * Puro e testável: sem dependências de React/Supabase.
 * Estrutura validada manualmente contra um ficheiro real aceite pelo banco —
 * não desviar (ver docs/features/pagamentos-export-sepa-santander.md).
 */

import { normalizeIban, validateIban } from "@/lib/iban";

/** Países da zona SEPA (ISO 3166-1 alfa-2). Fora desta lista → não exportável. */
export const SEPA_COUNTRIES = new Set([
  "AD", "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GB", "GI", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC",
  "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK", "SM", "VA",
]);

export type IbanRejectReason = "missing" | "invalid" | "non_sepa";

export interface IbanCheckResult {
  ok: boolean;
  iban: string;
  reason?: IbanRejectReason;
  detail?: string;
}

/** Valida IBAN (mod-97 + comprimento por país) e restringe à zona SEPA. */
export function checkSepaIban(raw: string | null | undefined): IbanCheckResult {
  const iban = normalizeIban(raw);
  if (!iban) return { ok: false, iban: "", reason: "missing", detail: "Sem IBAN" };
  const check = validateIban(iban);
  if (!check.valid) {
    return { ok: false, iban, reason: "invalid", detail: "IBAN inválido (dígitos de controlo ou comprimento)" };
  }
  const country = iban.slice(0, 2);
  if (!SEPA_COUNTRIES.has(country)) {
    return { ok: false, iban, reason: "non_sepa", detail: `IBAN fora da zona SEPA (${country})` };
  }
  return { ok: true, iban };
}

// ────────────────────────────── charset SEPA ──────────────────────────────

const ASCII_MAP: Record<string, string> = {
  á: "a", à: "a", ã: "a", â: "a", ä: "a", å: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", õ: "o", ô: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n", ý: "y", ÿ: "y",
  "€": "EUR", "ª": "a", "º": "o", "&": "e",
  "“": "'", "”": "'", "‘": "'", "’": "'", "–": "-", "—": "-", "…": "...",
};

/** Transliteração para ASCII (remove acentos e substitui símbolos comuns). */
export function toAscii(input: string): string {
  const normalized = (input ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized
    .split("")
    .map((ch) => ASCII_MAP[ch] ?? ASCII_MAP[ch.toLowerCase()] ?? ch)
    .join("");
}

/**
 * Charset SEPA permitido: a-z A-Z 0-9 / - ? : ( ) . , ' + espaço.
 * Nunca começa/acaba com "/" nem contém "//".
 */
export function sanitizeSepaText(input: string, maxLength: number): string {
  let out = toAscii(input ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  out = out.replace(/\/{2,}/g, "/");
  out = out.replace(/^\/+/, "").replace(/\/+$/, "").trim();
  if (out.length > maxLength) out = out.slice(0, maxLength).trim();
  out = out.replace(/^\/+/, "").replace(/\/+$/, "").trim();
  return out;
}

export const USTRD_HARD_LIMIT = 140;
export const USTRD_TARGET = 70;
export const CDTR_NAME_LIMIT = 70;

const MONTHS: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
  outubro: "10", novembro: "11", dezembro: "12",
};

/**
 * Compactação determinística (síncrona) do descritivo.
 * Aplica abreviações fixas + charset SEPA. Não trunca abaixo do limite rígido.
 */
export function compactDescriptionDeterministic(raw: string): string {
  let s = toAscii(raw ?? "").replace(/\s+/g, " ").trim();

  // meses por extenso → numérico: "referente a julho de 2026" → "ref 07/2026"
  const monthNames = Object.keys(MONTHS).join("|");
  const refRe = new RegExp(`(referente\\s+a[o]?\\s+)?\\b(${monthNames})\\b(\\s+de)?\\s+(\\d{4})`, "gi");
  s = s.replace(refRe, (_m, refPrefix, month, _de, year) => {
    const mm = MONTHS[String(month).toLowerCase()] ?? "";
    return `${refPrefix ? "ref " : ""}${mm}/${year}`;
  });
  // "referente a" solto → "ref"
  s = s.replace(/\breferente\s+a[o]?\b/gi, "ref");

  // abreviações fixas
  s = s.replace(/\(\s*label\s+eda\s*\)/gi, "EDA");
  s = s.replace(/\(\s*eda\s*\)/gi, "EDA");
  s = s.replace(/\bEnvelopamento\b/gi, "Envelop.");

  s = s.replace(/\s+/g, " ").trim();
  return sanitizeSepaText(s, USTRD_HARD_LIMIT);
}

/** Extrai as sequências numéricas de um texto (para validar compactações do LLM). */
export function numericSignature(text: string): string[] {
  return (text.match(/\d+/g) ?? []).slice();
}

/** Truncagem final segura com "..." dentro do limite. */
export function truncateUstrd(text: string, limit = USTRD_HARD_LIMIT): string {
  const clean = sanitizeSepaText(text, USTRD_HARD_LIMIT);
  if (clean.length <= limit) return clean;
  return sanitizeSepaText(clean.slice(0, Math.max(1, limit - 3)) + "...", limit);
}

/**
 * Aceita uma compactação candidata (ex.: vinda do LLM) só se couber no limite
 * e preservar exatamente as mesmas sequências numéricas do original.
 */
export function acceptCompaction(original: string, candidate: string, limit = USTRD_TARGET): string | null {
  const clean = sanitizeSepaText(candidate ?? "", USTRD_HARD_LIMIT);
  if (!clean) return null;
  if (clean.length > limit) return null;
  const a = numericSignature(original).join("|");
  const b = numericSignature(clean).join("|");
  if (a !== b) return null;
  return clean;
}

// ────────────────────────────── datas / nomes ──────────────────────────────

function toLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatLocalDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Data de execução: se cair em fim de semana ou no passado, avança para o
 * próximo dia útil. (Feriados não são considerados — o banco reagenda.)
 */
export function resolveExecutionDate(requested: string | null | undefined, today = new Date()): string {
  const todayIso = formatLocalDate(today);
  let d = requested ? toLocalDate(requested) : toLocalDate(todayIso);
  if (formatLocalDate(d) < todayIso) d = toLocalDate(todayIso);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return formatLocalDate(d);
}

/** yyyymmddHHmmss local, para o MsgId. */
export function timestampId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * Referência legível do lote: PAGAMENTOS-MP-<DDMMYYYY da lista>-<DDMMHHMM do envio>.
 * 31 chars; com o sufixo -P1 do PmtInfId fica em 34 (limite do formato = 35).
 */
export function buildBatchReference(listDate: string | null | undefined, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = listDate ? toLocalDate(listDate) : now;
  const listPart = `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`;
  const sentPart = `${p(now.getDate())}${p(now.getMonth() + 1)}${p(now.getHours())}${p(now.getMinutes())}`;
  return `PAGAMENTOS-MP-${listPart}-${sentPart}`;
}


/** CreDtTm ISO local sem timezone (o banco aceita sem offset). */
export function creationDateTime(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

export function slugify(input: string): string {
  return toAscii(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "lista";
}

function money(value: number): string {
  return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ────────────────────────────── gerador ──────────────────────────────

export interface SepaPaymentRow {
  /** id da transação (para o EndToEndId) */
  transactionId: string;
  creditorName: string;
  iban: string;
  amount: number;
  /** descritivo final (RmtInf/Ustrd) — já compactado/editado pelo utilizador */
  remittance: string;
}

export interface SepaFileInput {
  listId: string;
  listTitle: string;
  debtorName: string;
  debtorIban: string;
  /** BIC do banco ordenante (Santander PT = TOTAPTPL) */
  debtorBic: string;
  executionDate: string;
  /** payment_date da lista (YYYY-MM-DD) — 1.º bloco da referência do lote */
  listDate?: string | null;
  rows: SepaPaymentRow[];
  now?: Date;
  /** true quando a lista não está aprovada → sufixo _TESTE no nome */
  isTest?: boolean;
}


export interface SepaFileOutput {
  xml: string;
  fileName: string;
  msgId: string;
  numberOfTxs: number;
  controlSum: string;
}

export const SANTANDER_PT_BIC = "TOTAPTPL";
export const DEFAULT_DEBTOR_IBAN = "PT50001800034889774802033";

export function buildPain001(input: SepaFileInput): SepaFileOutput {
  const now = input.now ?? new Date();
  const msgId = `PL-${input.listId.replace(/-/g, "").slice(0, 8)}-${timestampId(now)}`.slice(0, 35);
  const pmtInfId = `${msgId}-P1`.slice(0, 35);

  const rows = input.rows;
  const controlSumCents = rows.reduce((s, r) => s + Math.round((Number(r.amount) || 0) * 100), 0);
  const controlSum = money(controlSumCents / 100);
  const debtorName = sanitizeSepaText(input.debtorName, CDTR_NAME_LIMIT);

  const txXml = rows
    .map((r, idx) => {
      const e2e = `PL${String(idx + 1).padStart(3, "0")}-${r.transactionId.replace(/-/g, "").slice(0, 8)}`;
      const name = sanitizeSepaText(r.creditorName || "BENEFICIARIO", CDTR_NAME_LIMIT) || "BENEFICIARIO";
      const ustrd = truncateUstrd(r.remittance || "Pagamento", USTRD_HARD_LIMIT) || "Pagamento";
      return [
        `      <CdtTrfTxInf>`,
        `        <PmtId><EndToEndId>${xmlEscape(e2e)}</EndToEndId></PmtId>`,
        `        <Amt><InstdAmt Ccy="EUR">${money(r.amount)}</InstdAmt></Amt>`,
        `        <Cdtr><Nm>${xmlEscape(name)}</Nm></Cdtr>`,
        `        <CdtrAcct><Id><IBAN>${xmlEscape(normalizeIban(r.iban))}</IBAN></Id></CdtrAcct>`,
        `        <RmtInf><Ustrd>${xmlEscape(ustrd)}</Ustrd></RmtInf>`,
        `      </CdtTrfTxInf>`,
      ].join("\r\n");
    })
    .join("\r\n");

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">`,
    `  <CstmrCdtTrfInitn>`,
    `    <GrpHdr>`,
    `      <MsgId>${xmlEscape(msgId)}</MsgId>`,
    `      <CreDtTm>${creationDateTime(now)}</CreDtTm>`,
    `      <NbOfTxs>${rows.length}</NbOfTxs>`,
    `      <CtrlSum>${controlSum}</CtrlSum>`,
    `      <InitgPty><Nm>${xmlEscape(debtorName)}</Nm></InitgPty>`,
    `    </GrpHdr>`,
    `    <PmtInf>`,
    `      <PmtInfId>${xmlEscape(pmtInfId)}</PmtInfId>`,
    `      <PmtMtd>TRF</PmtMtd>`,
    `      <BtchBookg>false</BtchBookg>`,
    `      <NbOfTxs>${rows.length}</NbOfTxs>`,
    `      <CtrlSum>${controlSum}</CtrlSum>`,
    `      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>`,
    `      <ReqdExctnDt><Dt>${input.executionDate}</Dt></ReqdExctnDt>`,
    `      <Dbtr><Nm>${xmlEscape(debtorName)}</Nm></Dbtr>`,
    `      <DbtrAcct><Id><IBAN>${xmlEscape(normalizeIban(input.debtorIban))}</IBAN></Id><Ccy>EUR</Ccy></DbtrAcct>`,
    `      <DbtrAgt><FinInstnId><BICFI>${xmlEscape(input.debtorBic || SANTANDER_PT_BIC)}</BICFI></FinInstnId></DbtrAgt>`,
    `      <ChrgBr>SLEV</ChrgBr>`,
    txXml,
    `    </PmtInf>`,
    `  </CstmrCdtTrfInitn>`,
    `</Document>`,
    ``,
  ];

  const stamp = input.executionDate.replace(/-/g, "");
  const fileName = `transferencias_${slugify(input.listTitle)}_${stamp}${input.isTest ? "_TESTE" : ""}.xml`;

  return {
    xml: lines.join("\r\n"),
    fileName,
    msgId,
    numberOfTxs: rows.length,
    controlSum,
  };
}

/** Download no browser via Blob. */
export function downloadXml(xml: string, fileName: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

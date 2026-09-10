/**
 * Regras de lançamento a partir da linha do banco.
 *
 * Princípio inviolável: a regra PROPÕE, a pessoa CONFIRMA. Nada neste ficheiro
 * cria transações — só decide qual o preenchimento a sugerir e ajuda a
 * adivinhar o padrão a guardar depois de um lançamento à mão.
 *
 * A regra só entra em cena DEPOIS de as camadas de conciliação falharem
 * (D-ERP28): aplica-se a linhas `unmatched`, nunca a linhas já ligadas.
 */
import { normalizeForMatch } from "@/lib/string-similarity";

export type BankRuleAction = "create_expense" | "create_income" | "create_transfer";
export type BankRuleMatchType = "contains" | "starts_with" | "regex";
export type BankRuleDirection = "debit" | "credit" | "any";

export interface BankLineRule {
  id: string;
  name: string;
  pattern: string;
  match_type: BankRuleMatchType;
  direction: BankRuleDirection;
  amount_min: number | null;
  amount_max: number | null;
  supplier_id: string | null;
  category_id: string | null;
  event_id: string | null;
  iva_rate: number | null;
  description_template: string | null;
  action: BankRuleAction;
  target_account_id: string | null;
  is_active: boolean;
  hits?: number | null;
  last_used_at?: string | null;
}

export interface RuleCandidateLine {
  description: string;
  amount: number;
}

/** A regra casa com a linha? Direção, faixa de valor e padrão, por esta ordem. */
export function ruleMatchesLine(rule: BankLineRule, line: RuleCandidateLine): boolean {
  if (!rule.is_active) return false;

  if (rule.direction === "debit" && line.amount >= 0) return false;
  if (rule.direction === "credit" && line.amount <= 0) return false;

  const abs = Math.abs(Number(line.amount ?? 0));
  if (rule.amount_min !== null && rule.amount_min !== undefined && abs < Number(rule.amount_min)) return false;
  if (rule.amount_max !== null && rule.amount_max !== undefined && abs > Number(rule.amount_max)) return false;

  const desc = normalizeForMatch(line.description);
  const pattern = rule.match_type === "regex" ? rule.pattern : normalizeForMatch(rule.pattern);
  if (!pattern) return false;

  if (rule.match_type === "starts_with") return desc.startsWith(pattern);
  if (rule.match_type === "regex") {
    try {
      return new RegExp(pattern, "i").test(line.description);
    } catch {
      return false;
    }
  }
  return desc.includes(pattern);
}

/**
 * Primeira regra que casa. Padrão mais longo primeiro: a regra mais específica
 * ganha à mais genérica sem obrigar a ordenar à mão.
 */
export function findMatchingRule(
  rules: BankLineRule[],
  line: RuleCandidateLine,
): BankLineRule | null {
  const sorted = [...rules].sort((a, b) => (b.pattern?.length ?? 0) - (a.pattern?.length ?? 0));
  return sorted.find((r) => ruleMatchesLine(r, line)) ?? null;
}

/**
 * Padrão sugerido a partir da descrição do banco: retira a parte variável —
 * tipicamente o número ou o código de referência colado no fim — e devolve o
 * texto estável, normalizado. A pessoa ajusta antes de gravar.
 */
export function suggestPattern(description: string): string {
  let s = normalizeForMatch(description);
  // Código de referência do banco / número de operação no fim da descrição.
  s = s.replace(/[-\s]*[a-z]?\d{4,}[a-z0-9]*\s*$/i, "");
  s = s.replace(/[-\s]*[a-z0-9]*\d{4,}[a-z0-9]*\s*$/i, "");
  s = s.replace(/[\s\-.+]+$/g, "").trim();
  return s.length >= 4 ? s : normalizeForMatch(description);
}

/** Descrição a propor: o modelo da regra, ou a descrição do banco. */
export function buildDescription(rule: BankLineRule | null, fallback: string): string {
  const t = (rule?.description_template ?? "").trim();
  return t || fallback;
}

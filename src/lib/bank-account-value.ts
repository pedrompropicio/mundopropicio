import { isValidIBAN } from "ibantools";

// Classificação de um valor de conta bancária de fornecedor (slots iban/iban_2/iban_3).
// O MOD-97 só se aplica a valores que se apresentam como IBAN (2 letras de país + 2 dígitos);
// o resto (ABA/routing, banco/agência/conta BR, …) é aceite tal e qual, sem bloqueio.
export type BankAccountKind = "iban_valido" | "iban_invalido" | "nao_iban" | "vazio";

const IBAN_SHAPE = /^[A-Z]{2}\d{2}/i;

export const NON_IBAN_WARNING = "Conta fora da zona IBAN — sem validação";

export function classifyBankAccountValue(value: string | null | undefined): BankAccountKind {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "vazio";
  const compact = trimmed.replace(/\s+/g, "");
  if (!IBAN_SHAPE.test(compact)) return "nao_iban";
  return isValidIBAN(compact.toUpperCase()) ? "iban_valido" : "iban_invalido";
}

/** Só `iban_invalido` bloqueia o submit; `nao_iban` e `vazio` passam. */
export function blocksSubmit(kind: BankAccountKind): boolean {
  return kind === "iban_invalido";
}

/**
 * Valor a gravar no slot: IBAN (ou com forma de IBAN) normaliza-se como até aqui;
 * não-IBAN guarda-se tal e qual (só trim), para não perder separadores como «021000021 / 123».
 */
export function bankAccountValueToStore(
  value: string | null | undefined,
  normalize: (v: string | null | undefined) => string,
): string | null {
  const kind = classifyBankAccountValue(value);
  if (kind === "vazio") return null;
  if (kind === "nao_iban") return (value ?? "").trim();
  return normalize(value) || null;
}

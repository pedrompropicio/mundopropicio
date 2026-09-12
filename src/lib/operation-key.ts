/**
 * Chave de operação (D-ERP45) — domínio e validação.
 *
 * Casa única do padrão. Espelhado em dois sítios que NÃO podem importar daqui:
 *  - CHECK `transactions_operation_key_check` na base de dados
 *  - `supabase/functions/update-transaction/index.ts` (constante OPERATION_KEY_RE)
 *
 * Numa chave de agrupamento o erro de escrita é silencioso: uma chave com um
 * espaço em vez de hífen cria um grupo novo de uma linha e o total do fecho
 * deixa de bater sem ninguém dar por isso. Por isso recusa-se, não se avisa.
 */

export const OPERATION_KEY_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;

export const OPERATION_KEY_EXAMPLE = "ACERTO-FOOD-IVETE-2026";

export function isValidOperationKey(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length > 0 && OPERATION_KEY_PATTERN.test(v);
}

/**
 * Normaliza enquanto se escreve: maiúsculas, acentos fora, espaços e underscores
 * viram hífen, caracteres inválidos caem, hífens repetidos colapsam.
 * Não apara o hífen final para não travar a escrita a meio.
 */
export function normalizeOperationKeyInput(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");
}

/** Mensagem em pt-PT quando a string escrita não pode virar chave. */
export function operationKeyRejectionReason(raw: string): string | null {
  const v = normalizeOperationKeyInput(raw).replace(/-+$/, "");
  if (!v) return "Escreve a chave — por exemplo " + OPERATION_KEY_EXAMPLE + ".";
  if (!OPERATION_KEY_PATTERN.test(v)) {
    return `Só letras e números, em maiúsculas, separados por hífen — por exemplo ${OPERATION_KEY_EXAMPLE}.`;
  }
  return null;
}

/** Acréscimos BR ao domínio PT, partilhados pelo frontend e update-transaction. */
export const BR_ONLY_PAYMENT_METHODS = ["pix", "boleto"] as const;

// O lookahead exige o fim real da string: `$` também aceita uma quebra final em JS.
export const BOLETO_REFERENCE_PATTERN = /^\d{47,48}(?![\s\S])/;
export const BOLETO_CHECK_CONSTRAINT = "transactions_boleto_requires_linha";
export const BOLETO_FIELDS_MESSAGE = "Boleto exige linha digitável de 47 ou 48 dígitos";

export function validateBoletoFields(input: {
  payment_method?: string | null;
  payment_reference?: string | null;
}): string | null {
  if (input.payment_method !== "boleto") return null;
  return BOLETO_REFERENCE_PATTERN.test(input.payment_reference ?? "") ? null : BOLETO_FIELDS_MESSAGE;
}

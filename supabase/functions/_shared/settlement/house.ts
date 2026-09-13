/**
 * Nome da casa (empresa gestora) nos fechamentos.
 *
 * Vive no pacote partilhado porque tanto o ERP como a edge function
 * `partner-statement` precisam da MESMA constante. `src/lib/settlement-participants`
 * reexporta-a para não quebrar imports existentes.
 */
export const HOUSE_PARTNER_NAME = "MUNDO PROPÍCIO";

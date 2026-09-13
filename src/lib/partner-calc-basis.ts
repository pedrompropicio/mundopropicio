/**
 * Reexport do pacote PARTILHADO (ERP + edge function `partner-statement`).
 * O código vive em `supabase/functions/_shared/settlement/partner-calc-basis.ts` para que o
 * servidor use exactamente o mesmo cálculo — nunca duplicar aqui.
 */
export * from "@shared/settlement/partner-calc-basis.ts";

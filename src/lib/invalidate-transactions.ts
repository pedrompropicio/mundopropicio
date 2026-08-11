import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalida, por prefixo/predicate, TODAS as queries que alimentam as telas de
 * transações (lista, badges de fatura, totais "Aberto:", contadores por data,
 * parcelas, pagamentos, BP vinculado). Regra geral: qualquer modal que grava
 * dados chama isto para a tela por trás refletir os novos valores de imediato.
 */
export function invalidateTransactionQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      const flat = Array.isArray(key) ? key : [key];
      return flat.some((part) => {
        if (typeof part !== "string") return false;
        const p = part.toLowerCase();
        return (
          p.includes("transaction") ||
          p.includes("invoice") ||
          p.includes("installment") ||
          p.includes("payment") ||
          p.includes("forecast")
        );
      });
    },
  });
}

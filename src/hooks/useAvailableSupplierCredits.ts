import { useQuery } from "@tanstack/react-query";
import { fetchAvailableCredits, expireStaleCredits, type SupplierCredit } from "@/lib/supplier-credits";

/** Créditos utilizáveis do fornecedor (activos, com saldo, não expirados). */
export function useAvailableSupplierCredits(supplierId?: string | null, enabled = true) {
  return useQuery<SupplierCredit[]>({
    queryKey: ["supplier-credits-available", supplierId],
    enabled: !!supplierId && enabled,
    queryFn: async () => {
      await expireStaleCredits();
      return fetchAvailableCredits(supplierId as string);
    },
  });
}

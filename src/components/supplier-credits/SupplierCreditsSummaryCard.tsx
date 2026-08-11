import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { creditRemaining, isCreditExpired } from "@/lib/supplier-credits";

/**
 * Card resumo "Créditos de fornecedor ativos" — total disponível e nº de
 * fornecedores. Clicável para a aba Créditos em Fornecedores.
 */
export function SupplierCreditsSummaryCard() {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["supplier-credits-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_credits" as any)
        .select("supplier_id, amount, used_amount, status, valid_until")
        .eq("status", "active");
      if (error) throw error;
      const usable = ((data ?? []) as any[]).filter((c) => !isCreditExpired(c.valid_until) && creditRemaining(c) > 0);
      return {
        total: usable.reduce((s, c) => s + creditRemaining(c), 0),
        suppliers: new Set(usable.map((c) => c.supplier_id)).size,
      };
    },
  });

  const total = data?.total ?? 0;
  const suppliers = data?.suppliers ?? 0;

  return (
    <button
      onClick={() => navigate("/fornecedores")}
      className="glass rounded-xl p-4 text-left transition-colors hover:bg-secondary/20"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <CreditCard className="h-3.5 w-3.5" /> Créditos de fornecedor ativos
      </p>
      <p className="mt-1 text-2xl font-bold text-primary">{formatCurrency(total)}</p>
      <p className="text-xs text-muted-foreground">
        em {suppliers} fornecedor{suppliers === 1 ? "" : "es"}
      </p>
    </button>
  );
}

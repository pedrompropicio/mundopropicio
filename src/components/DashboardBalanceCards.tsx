/**
 * Cartões de saldo do Dashboard (fase 2 do Passo 3, D-ERP27 + D-ERP36).
 *
 * Consome o MESMO hook da página de Contas (`useAccountBalanceCards`) — os
 * saldos vêm agregados do servidor (`account_true_balances_asof` e
 * `ticket_office_balances`), com a permissão resolvida lá. Nada é somado aqui.
 *
 * Regras da página de entrada:
 * - caixa e retido em bilheteiras NUNCA se somam (dinheiros diferentes);
 * - onde não há permissão não se mostra zero: o cartão desaparece;
 * - "não controlado" (`skip_balance_check`) continua distinto de "sem permissão".
 */
import { useQuery } from "@tanstack/react-query";
import { Wallet, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/mock-data";
import { useAccountBalanceCards } from "@/hooks/useAccountBalanceCards";

export function DashboardBalanceCards() {
  const { companyId } = useCompany();

  const { data: accounts = [] } = useQuery({
    queryKey: ["dashboard_balance_accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, type, is_active, skip_balance_check")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cards = useAccountBalanceCards(accounts as any[]);

  if (accounts.length === 0 || cards.isLoading) return null;

  const cash = cards.cash;
  const office = cards.ticketOffice;

  // Sem um único valor visível no grupo → o cartão não aparece (nunca zero).
  const showCash = cash.count - cash.hiddenNames.length - cash.uncontrolledNames.length > 0;
  const showOffice = office.count - office.hiddenNames.length - office.uncontrolledNames.length > 0;

  if (!showCash && !showOffice) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showCash && (
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Saldo em Caixa
            </p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <p
            className={`mt-1 text-2xl font-bold ${
              cash.total >= 0 ? "text-success" : "text-destructive"
            }`}
          >
            {formatCurrency(cash.total)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Contas bancárias, caixa e cartões pré-pagos
          </p>
          {cash.uncontrolledNames.length > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Excluídas por não terem controlo: {cash.uncontrolledNames.join(", ")}
            </p>
          )}
          {cash.hiddenNames.length > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Fora do total, sem permissão: {cash.hiddenNames.join(", ")}
            </p>
          )}
        </div>
      )}

      {showOffice && (
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Retido em Bilheteiras
            </p>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-bold text-warning">
            {formatCurrency(office.total)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Dinheiro que existe mas ainda não está no banco — não é caixa
          </p>
          {office.hiddenNames.length > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Fora do total, sem permissão: {office.hiddenNames.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

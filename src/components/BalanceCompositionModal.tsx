/**
 * Composição de um card de saldo (D-ERP27 / D-ERP36).
 *
 * REGRA INVIOLÁVEL: este componente NÃO recalcula nada e não introduz uma quarta
 * fórmula de saldo. Recebe as parcelas que o próprio card já tem
 * (`useAccountBalanceCards`) e mostra-as, para que a soma apresentada bata sempre
 * ao cêntimo com o número do card em que se clicou.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/mock-data";
const TYPE_LABELS: Record<string, string> = {
  bank: "Conta Bancária",
  ticket_office: "Bilheteira",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  prepaid_card: "Cartão Pré-Pago",
  cash: "Caixa",
  other: "Outra",
};
import type { AccountBalanceEntry } from "@/hooks/useAccountBalanceCards";

interface AccountLike {
  id: string;
  name: string;
  type: string;
  is_active?: boolean | null;
  skip_balance_check?: boolean | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Total do card — a linha de soma tem de ser idêntica a este valor. */
  total: number;
  /** Contas do grupo do card (já filtradas por quem chama). */
  accounts: AccountLike[];
  /** `balances` tal como o hook devolve: balances[contaId] = { value, reason }. */
  balances: Record<string, AccountBalanceEntry>;
  /** Legenda opcional por baixo do título. */
  description?: string;
}

function typeLabel(type: string): string {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function BalanceCompositionModal({
  open,
  onClose,
  title,
  total,
  accounts,
  balances,
  description,
}: Props) {
  const navigate = useNavigate();

  const { included, uncontrolled, noPermission } = useMemo(() => {
    const active = accounts.filter((a) => a.is_active !== false);
    const inc: Array<AccountLike & { value: number }> = [];
    const unc: AccountLike[] = [];
    const nop: AccountLike[] = [];
    active.forEach((a) => {
      const entry = balances[a.id];
      if (!entry || entry.value === null) {
        if (entry?.reason === "uncontrolled") unc.push(a);
        else nop.push(a);
        return;
      }
      inc.push({ ...a, value: entry.value });
    });
    inc.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
    return { included: inc, uncontrolled: unc, noPermission: nop };
  }, [accounts, balances]);

  const goToDetail = (a: AccountLike) => {
    onClose();
    if (a.type === "ticket_office") {
      navigate(`/relatorios/bilheteiras?conta=${a.id}`);
    } else {
      navigate(`/relatorios/extrato?conta=${a.id}&auto=1`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Parcelas que compõem exactamente o valor do cartão."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {included.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma conta com valor visível.</p>
          )}
          {included.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {typeLabel(a.type)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`font-mono text-sm font-semibold ${
                    a.value >= 0 ? "text-foreground" : "text-destructive"
                  }`}
                >
                  {formatCurrency(a.value)}
                </span>
                <button
                  type="button"
                  onClick={() => goToDetail(a)}
                  title="Ver detalhe desta conta"
                  className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary transition-colors"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border px-3 pt-3">
            <span className="text-sm font-semibold">Soma</span>
            <span className="font-mono text-lg font-bold">{formatCurrency(total)}</span>
          </div>
        </div>

        {(uncontrolled.length > 0 || noPermission.length > 0) && (
          <div className="mt-4 space-y-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fora do total
            </p>
            {uncontrolled.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">Não controlado</span>
              </div>
            ))}
            {noPermission.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">Sem permissão</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

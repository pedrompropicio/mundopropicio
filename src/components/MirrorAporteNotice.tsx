/**
 * Aviso (não bloqueio) nos ecrãs de pagamento: a conta escolhida é uma
 * conta-espelho de sócio, logo o pagamento vai gerar automaticamente um aporte
 * (rubrica 10.1.01) de igual valor para esse sócio.
 */
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { useMirrorPartnerAccounts } from "@/lib/mirror-partner-account";

interface Props {
  accountId: string | null | undefined;
  /** Valor do pagamento (no lote, o total do lote). */
  amount: number;
  className?: string;
}

export function MirrorAporteNotice({ accountId, amount, className }: Props) {
  const { data: mirrors } = useMirrorPartnerAccounts();
  const mirror = accountId ? mirrors?.[accountId] : undefined;
  if (!mirror) return null;

  return (
    <div
      className={`mt-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning ${className ?? ""}`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Conta-espelho de <strong>{mirror.partnerName}</strong>. Este pagamento vai gerar
        automaticamente um aporte de <strong>{formatCurrency(amount || 0)}</strong> para o sócio.
      </span>
    </div>
  );
}

export default MirrorAporteNotice;

/**
 * Custo partilhado com terceiros (D-ERP69) — marcação da linha.
 *
 * Bloco recolhido por omissão, só em despesas. Escolher uma conta de circuito
 * significa "esta linha não é custo da MP: é adiantamento por conta de
 * terceiros". A imposição de `exclude_from_result` é do trigger; aqui só se
 * reflecte.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Handshake } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { useCircuitAccounts } from "@/lib/circuit-account";

interface Props {
  accountId: string;
  counterpartyId: string;
  onChange: (next: { accountId: string; counterpartyId: string }) => void;
  /** Valor bruto (base + IVA) da linha, para o texto explicativo. */
  grossAmount: number;
  suppliers: Array<{ id: string; name: string }>;
  disabled?: boolean;
}

export function SharedCostFields({
  accountId,
  counterpartyId,
  onChange,
  grossAmount,
  suppliers,
  disabled,
}: Props) {
  const { data: circuitAccounts = [] } = useCircuitAccounts();
  const [open, setOpen] = useState(!!accountId);

  // Sem contas de circuito configuradas o bloco não tem o que oferecer.
  if (circuitAccounts.length === 0 && !accountId) return null;

  const chosen = circuitAccounts.find((a) => a.id === accountId);

  return (
    <div className="rounded-lg border border-border bg-secondary/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Handshake className="h-4 w-4 text-primary" />
        <span>Custo partilhado com terceiros</span>
        {accountId && (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            Parte de terceiros
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Conta corrente do circuito
            </label>
            <select
              value={accountId}
              disabled={disabled}
              onChange={(e) => onChange({ accountId: e.target.value, counterpartyId })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            >
              <option value="">Não é custo partilhado</option>
              {circuitAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Terceiro (opcional)
            </label>
            <select
              value={counterpartyId}
              disabled={disabled || !accountId}
              onChange={(e) => onChange({ accountId, counterpartyId: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            >
              <option value="">Sem contraparte atribuída</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Atribuir o terceiro é o que torna a posição do circuito legível por contraparte.
            </p>
          </div>

          {chosen && (
            <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              Esta linha não é custo da MP. Fica fora do resultado, não consome verba do BP e,
              quando for paga, vai gerar automaticamente{" "}
              <strong>{formatCurrency(grossAmount || 0)}</strong> na conta{" "}
              <strong>{chosen.name}</strong>, que passa a ser o que o terceiro nos deve.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SharedCostFields;

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { formatMoney } from "@/lib/currency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useConfirmMetaAction } from "@/components/crm/ConfirmMetaActionDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adset: {
    external_adset_id: string;
    name: string | null;
    daily_budget_cents: number | null;
    currency: string | null;
  };
  connectionId: string;
  adAccountId: string | null;
  onSaved: () => void;
}

/**
 * Edita o orçamento DIÁRIO de um adset via crm-meta-entity-action.
 * Pré-preenche com o valor atual em euros (daily_budget_cents / 100).
 */
export function EditAdsetBudgetDialog({
  open,
  onOpenChange,
  adset,
  connectionId,
  adAccountId,
  onSaved,
}: Props) {
  const initialEur = (adset.daily_budget_cents ?? 0) / 100;
  const [valueEur, setValueEur] = useState<number>(initialEur);
  const [saving, setSaving] = useState(false);
  const displayCurrency = useDisplayCurrency();
  const currency = adset.currency ?? displayCurrency;

  // Re-sincroniza ao reabrir com outro adset
  function handleOpenChange(v: boolean) {
    if (v) setValueEur(initialEur);
    onOpenChange(v);
  }

  async function handleSave() {
    if (!valueEur || valueEur <= 0) {
      toast.error("Valor inválido", { description: "O orçamento tem de ser maior que 0." });
      return;
    }
    const cents = Math.round(valueEur * 100);
    if (cents === adset.daily_budget_cents) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: connectionId,
          entity_type: "adset",
          external_id: adset.external_adset_id,
          action: "update",
          ad_account_id: adAccountId ?? undefined,
          updates: { daily_budget_cents: cents },
          triggered_by: "user_manual",
        },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            if (b?.error === "budget_cap_exceeded") {
              detail = `Excede o teu limite (${formatMoney(b.cap_eur, currency)}/dia). Tentaste ${formatMoney(b.attempted_eur, currency)}.`;
            } else if (b?.error === "no_budget_authority") {
              detail = "Não tens permissão para alterar orçamento.";
            } else {
              detail = b?.detail || b?.message || b?.error || detail;
            }
          } catch {}
        }
        throw new Error(detail);
      }
      if ((data as any)?.ok === false) throw new Error((data as any)?.detail ?? "Falha");
      toast.success(`Orçamento do adset "${adset.name ?? "(sem nome)"}" atualizado`);
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error("Falha a atualizar verba no Meta", {
        description: e?.message ?? String(e),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar orçamento diário</DialogTitle>
          <DialogDescription className="line-clamp-2">
            Adset: <strong>{adset.name ?? adset.external_adset_id}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Orçamento diário ({currency})
            </Label>
            <MoneyInput
              value={valueEur}
              onChange={setValueEur}
              currency={currency}
              disabled={saving}
            />
            <p className="text-[11px] text-muted-foreground">
              Valor atual: {formatMoney(initialEur, currency)}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Gravar no Meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

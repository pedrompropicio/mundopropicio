import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useRoleBudgetCap } from "@/hooks/useRoleBudgetCap";
import { useConfirmMetaAction } from "@/components/crm/ConfirmMetaActionDialog";
import { formatMoney } from "@/lib/currency";
import type { CampaignRow } from "@/components/crm/dashboard/types";

// ============================================================
// Edit Campaign Popover (inline)
// ============================================================
export function EditCampaignPopover({
  c,
  onSaved,
  budgetMode,
}: {
  c: CampaignRow;
  onSaved: () => void;
  /** ABO/CBO determinado pelo caller (CampaignView passa budgetSummary.mode).
   *  Quando ausente, deriva heuristicamente do próprio c. */
  budgetMode?: "ABO" | "CBO" | "unknown";
}) {
  // Sinal canónico ABO/CBO: se o caller passou, usa; senão deriva
  // (CBO ⇔ campanha tem budget > 0; ABO ⇔ não tem).
  const resolvedMode: "ABO" | "CBO" | "unknown" =
    budgetMode ??
    ((c.daily_budget_cents ?? 0) > 0 || (c.lifetime_budget_cents ?? 0) > 0
      ? "CBO"
      : "ABO");
  const isAbo = resolvedMode === "ABO";

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(c.name);
  // Em ABO não mostramos o campo; mantemos estado vazio para o payload não enviar verba.
  const [dailyEur, setDailyEur] = useState(
    !isAbo && c.daily_budget_cents ? (c.daily_budget_cents / 100).toFixed(2) : "",
  );
  const [endDate, setEndDate] = useState(c.stop_time ? c.stop_time.slice(0, 10) : "");
  const [roasGoal, setRoasGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const { capEur } = useRoleBudgetCap();
  const { confirm: confirmMetaAction } = useConfirmMetaAction();

  const supportsRoas = c.bid_strategy === "LOWEST_COST_WITH_MIN_ROAS";

  const handleApply = async () => {
    const updates: any = {};
    if (name.trim() && name.trim() !== c.name) updates.name = name.trim();
    // Em ABO o campo de verba não é mostrado e nunca é enviado.
    if (!isAbo && dailyEur) {
      const n = parseFloat(dailyEur.replace(",", "."));
      if (Number.isFinite(n) && n > 0) {
        const cents = Math.round(n * 100);
        if (cents !== c.daily_budget_cents) updates.daily_budget_cents = cents;
      }
    }
    if (endDate) updates.end_time = `${endDate}T23:59:59Z`;
    if (supportsRoas && roasGoal) {
      const r = parseFloat(roasGoal.replace(",", "."));
      if (Number.isFinite(r) && r > 0) updates.roas_average_floor = r;
    }
    if (Object.keys(updates).length === 0) {
      toast.info("Nada para alterar.");
      return;
    }
    // Guardrail client-side (1ª linha; o servidor revalida). Só bloqueia se já
    // sabemos o cap (number). null = sem limite; undefined = a carregar → deixa
    // passar e confia no servidor.
    if (typeof updates.daily_budget_cents === "number" && typeof capEur === "number") {
      if (capEur === 0) {
        toast.error("Sem autoridade para alterar verba", {
          description: "O teu role não está autorizado a definir orçamentos. Pede a um admin.",
        });
        return;
      }
      const attemptedEur = updates.daily_budget_cents / 100;
      if (attemptedEur > capEur) {
        toast.error("Verba diária excede o limite", {
          description: `Verba diária ${formatMoney(attemptedEur, c.currency)} excede o limite de ${formatMoney(capEur, c.currency)}/dia para o teu role. Pede revisão a um admin.`,
        });
        return;
      }
    }
    setSaving(true);
    try {
      // Quando a edição inclui verba, passa pelo guard de confirmação (gasta).
      // Edição só de nome/end_time/ROAS mantém o caminho directo (sem impacto $).
      const touchesBudget = typeof updates.daily_budget_cents === "number";
      if (touchesBudget) {
        const beforeEur = (c.daily_budget_cents ?? 0) / 100;
        const afterEur = (updates.daily_budget_cents as number) / 100;
        const r = await confirmMetaAction(
          [{
            connection_id: c.connection_id,
            entity_type: "campaign",
            external_id: c.external_campaign_id,
            ad_account_id: c.ad_account_id,
            action: "update",
            updates,
            label: `Campanha «${c.name}» — verba ${formatMoney(beforeEur, c.currency)} → ${formatMoney(afterEur, c.currency)}`,
            triggered_by: "user_manual",
          }],
          { title: "Atualizar campanha (inclui verba)" },
        );
        if (r.ok > 0) {
          setOpen(false);
          onSaved();
        }
        return;
      }

      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: c.connection_id,
          entity_type: "campaign",
          external_id: c.external_campaign_id,
          action: "update",
          ad_account_id: c.ad_account_id,
          updates,
        },
      });
      if (error) {
        let detail = error.message;
        if ((error as any).context) {
          try {
            const ctx = (error as any).context;
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.message || b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if (data?.ok === false) throw new Error(data?.message ?? data?.detail ?? data?.error ?? "Falha");
      toast.success(`Campanha "${c.name}" actualizada.`);
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error("Falha a actualizar no Meta", { description: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          title="Editar campanha"
          onClick={(e) => e.stopPropagation()}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 z-[100]"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`edit-name-${c.id}`} className="text-xs">Nome</Label>
            <Input id={`edit-name-${c.id}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {isAbo ? (
            <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
              Campanha <span className="font-medium text-foreground">ABO</span> — a verba é
              gerida por adset. Edita a verba em cada adset.
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor={`edit-daily-${c.id}`} className="text-xs">Verba diária ({c.currency ?? "EUR"})</Label>
              <Input
                id={`edit-daily-${c.id}`}
                type="number"
                step="0.01"
                min="0"
                value={dailyEur}
                onChange={(e) => setDailyEur(e.target.value)}
              />
              {capEur === null ? (
                <p className="text-[11px] text-muted-foreground">Limite: sem restrição</p>
              ) : capEur === 0 ? (
                <p className="text-[11px] text-destructive">Sem autoridade para alterar verba</p>
              ) : typeof capEur === "number" ? (
                <p className="text-[11px] text-muted-foreground">Limite: {formatMoney(capEur, c.currency)}/dia</p>
              ) : null}
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Data de fim (opcional)</Label>
            <DatePicker value={endDate} onChange={setEndDate} />
          </div>
          {supportsRoas && (
            <div className="space-y-1">
              <Label htmlFor={`edit-roas-${c.id}`} className="text-xs">ROAS goal (ex: 4.5)</Label>
              <Input
                id={`edit-roas-${c.id}`}
                type="number"
                step="0.1"
                min="0"
                placeholder="—"
                value={roasGoal}
                onChange={(e) => setRoasGoal(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleApply} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { CampaignRow } from "@/components/crm/dashboard/types";

/**
 * Fluxo de re-design de campanha (crm-meta-campaign-redesign).
 * Extraído de Campaigns.tsx (Fase 1) — comportamento idêntico.
 */
export function CampaignRedesignDialog({
  open,
  onOpenChange,
  campaignId,
  diagnosisId,
  campaigns,
  currency,
  periodDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  diagnosisId: string | null;
  campaigns: CampaignRow[];
  currency: string;
  periodDays: number;
}) {
  const navigate = useNavigate();
  const [redesignLoading, setRedesignLoading] = useState(false);
  const [rdKeepBudget, setRdKeepBudget] = useState(true);
  const [rdDailyEur, setRdDailyEur] = useState<string>("");
  const [rdRoasGoal, setRdRoasGoal] = useState<string>("");
  const [rdEndTime, setRdEndTime] = useState<string>("");

  // Pré-popula com o valor actual da campanha ao abrir.
  useEffect(() => {
    if (!open) return;
    const camp = campaigns?.find((c) => c.external_campaign_id === campaignId);
    const dailyEur = camp?.daily_budget_cents ? (camp.daily_budget_cents / 100).toFixed(2) : "";
    setRdKeepBudget(true);
    setRdDailyEur(dailyEur);
    setRdRoasGoal("");
    setRdEndTime("");
  }, [open, campaignId, campaigns]);

  const submitRedesign = async () => {
    if (!campaignId) return;
    const diagId = diagnosisId;
    if (!diagId) {
      toast.error("Faz primeiro um diagnóstico desta campanha.");
      return;
    }
    const constraints: any = { keep_original_budget: rdKeepBudget };
    if (!rdKeepBudget && rdDailyEur) {
      const n = parseFloat(rdDailyEur.replace(",", "."));
      if (Number.isFinite(n) && n > 0) constraints.daily_budget_cents = Math.round(n * 100);
    }
    if (rdRoasGoal) {
      const r = parseFloat(rdRoasGoal.replace(",", "."));
      if (Number.isFinite(r) && r > 0) constraints.roas_floor = r;
    }
    if (rdEndTime) constraints.end_time = `${rdEndTime}T23:59:59Z`;

    setRedesignLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-campaign-redesign", {
        body: { campaign_id: campaignId, diagnosis_id: diagId, period_days: periodDays, constraints },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      if (!data?.strategy_id) throw new Error("Resposta inválida do servidor");
      toast.success("Re-design gerado. A abrir nova estratégia…");
      onOpenChange(false);
      navigate(`/audience/strategies/${data.strategy_id}`);
    } catch (e: any) {
      toast.error(e?.message || "Falha a re-desenhar campanha");
    } finally {
      setRedesignLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-desenhar campanha</DialogTitle>
            <DialogDescription>
              Define as constraints. A IA vai respeitá-las exactamente em vez de inventar valores.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded border border-border p-3">
              <div>
                <Label htmlFor="rd-keep" className="text-sm font-medium">Manter verba actual</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Usa a verba diária/lifetime já configurada na campanha original.
                </p>
              </div>
              <Switch id="rd-keep" checked={rdKeepBudget} onCheckedChange={setRdKeepBudget} />
            </div>
            {!rdKeepBudget && (
              <div className="space-y-1.5">
                <Label htmlFor="rd-daily" className="text-xs">Verba diária ({currency})</Label>
                <Input
                  id="rd-daily"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="50.00"
                  value={rdDailyEur}
                  onChange={(e) => setRdDailyEur(e.target.value)}
                />
              </div>
            )}
            {(() => {
              const camp = campaigns?.find((c) => c.external_campaign_id === campaignId);
              if (camp?.bid_strategy !== "LOWEST_COST_WITH_MIN_ROAS") return null;
              return (
                <div className="space-y-1.5">
                  <Label htmlFor="rd-roas" className="text-xs">ROAS goal (ex: 4.5 = 450%)</Label>
                  <Input
                    id="rd-roas"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="4.5"
                    value={rdRoasGoal}
                    onChange={(e) => setRdRoasGoal(e.target.value)}
                  />
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <Label className="text-xs">Data de fim (opcional)</Label>
              <DatePicker value={rdEndTime} onChange={setRdEndTime} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={redesignLoading}>
              Cancelar
            </Button>
            <Button
              onClick={submitRedesign}
              disabled={redesignLoading}
              className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
              variant="outline"
            >
              {redesignLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
              Re-desenhar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { Switch } from "@/components/ui/switch";
import { partnerSettlementExclusionReason } from "@/lib/fecho-filters";

export function PartnerSettlementExclusionSwitch({ row, canManage, checked, onChange, inheritedFromForecast }: {
  row: any;
  canManage: boolean;
  checked: boolean;
  onChange: (value: boolean) => void;
  inheritedFromForecast?: boolean | null;
}) {
  if (!canManage || row?.type !== "income") return null;
  const reason = partnerSettlementExclusionReason(row);
  const inherited = inheritedFromForecast != null;
  return <div className="space-y-1 py-2">
    <label className="flex items-center gap-2 text-xs">
      <Switch aria-label="Fora do acerto do sócio (receita só da MP)" checked={inherited ? inheritedFromForecast : !reason && checked} disabled={inherited || !!reason} onCheckedChange={onChange} />
      Fora do acerto do sócio (receita só da MP)
    </label>
    {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
    {inherited && <p className="text-xs text-muted-foreground">Herdado da linha do BP</p>}
  </div>;
}

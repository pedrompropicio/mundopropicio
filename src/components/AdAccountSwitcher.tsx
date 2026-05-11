import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
import { ChevronDown, Briefcase, Check } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";

export function AdAccountSwitcher() {
  const { links, active, setActiveAdAccountId, hasMultiple, isLoading } = useAdAccountSelection();
  const navigate = useNavigate();

  if (isLoading || links.length === 0) return null;

  if (!hasMultiple) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
        <Briefcase className="h-3 w-3" />
        <span className="font-medium">{active?.display_label ?? "Ad Account"}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 hover:bg-cyan-500/15 transition-colors">
          <Briefcase className="h-3 w-3" />
          <span className="font-medium truncate max-w-[140px]">{active?.display_label ?? "Escolher"}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs">Conta de anúncios ativa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {links.map(l => (
          <DropdownMenuItem
            key={l.id}
            onClick={() => setActiveAdAccountId(l.ad_account_id)}
            className="flex items-center justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{l.display_label}</span>
                {l.is_primary && <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">primary</span>}
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">{l.ad_account_id} · {l.ad_account_currency ?? "—"}</p>
            </div>
            {l.ad_account_id === active?.ad_account_id && <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/audience/ad-accounts")} className="text-xs text-muted-foreground">
          Gerir ad accounts →
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

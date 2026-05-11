import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
import { Card } from "@/components/ui/card";
import { Briefcase } from "lucide-react";

export default function CrmAdAccounts() {
  const { links, isLoading } = useAdAccountSelection();
  if (isLoading) return <div className="p-6">A carregar…</div>;
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-cyan-400" />
          Ad Accounts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Contas de anúncios Meta ligadas ao MP Audience. Funcionalidades de CRUD em breve.</p>
      </div>
      {links.length === 0 && (
        <Card className="p-6"><p className="text-sm text-muted-foreground">Nenhuma ad account ligada. Liga uma conta Meta primeiro em Conexões.</p></Card>
      )}
      {links.map(l => (
        <Card key={l.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{l.display_label}</h3>
                {l.is_primary && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Primary</span>}
                {l.enabled && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">Ativa</span>}
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1">{l.ad_account_id}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{l.ad_account_currency ?? "—"}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Página Google Ads no MP Audience — só conversões offline (Data Manager API).
//
// Fase 3B: a aba "Campanhas" foi removida. As campanhas Google passaram a viver no
// dashboard unificado (/audience/dashboard), com filtro de plataforma, o mesmo
// selector de período e a moeda da conta. A tabela antiga duplicava o dashboard e
// formatava tudo em EUR fixo, contra a regra de moeda do módulo.
// Customer Match / Audiences continua no MP CRM (/crm/google-ads).

import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowRight, KeyRound, MousePointerClick } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function AudienceGoogleAds() {
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-cyan-400" />
            Google Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conversões offline do Google Ads. O desempenho das campanhas vive no
            dashboard unificado; Customer Match / Audiences vive no MP CRM.
          </p>
        </div>
        <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
          MP Audience
        </Badge>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 flex-wrap py-4">
          <p className="text-sm text-muted-foreground">
            As campanhas Google aparecem no dashboard, lado a lado com o Meta e com o
            mesmo período.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/audience/dashboard">
              Abrir dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            Conversões offline (Data Manager API)
            <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-700 border-amber-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" /> Sprint 2
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Fila <code className="text-xs bg-muted px-1 rounded">crm.google_conversion</code> —
            conversões de venda (transaction_id Ticketline/Fever) atribuídas a um clique
            (gclid/gbraid/wbraid) e enviadas à Google. Espelha a lógica do purchase do CAPI Meta.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Monitor de estado (pending / sent / failed) e data_manager_job_id.</li>
            <li>Deduplicação por order_id (transaction_id da venda).</li>
            <li>Reenvio manual de falhas e detalhe de erro.</li>
          </ul>
          <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground border-t border-border">
            <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Depende do developer token Google Ads aprovado (Basic/Standard).</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

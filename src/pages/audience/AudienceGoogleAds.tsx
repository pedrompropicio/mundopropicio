// Página Google Ads no MP Audience.
// Acompanhamento de campanhas e conversões offline (Data Manager API).
// Customer Match continua no MP CRM (/crm/google-ads).

import { useState } from "react";
import { Activity, AlertTriangle, KeyRound, Megaphone, MousePointerClick } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GoogleCampaignsTable from "@/pages/crm-admin/google-ads/GoogleCampaignsTable";

type SecaoId = "campanhas" | "conversoes";

export default function AudienceGoogleAds() {
  const [secao, setSecao] = useState<SecaoId>("campanhas");

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-cyan-400" />
            Google Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhamento de campanhas Google Ads e conversões offline. Customer
            Match / Audiences vive no MP CRM.
          </p>
        </div>
        <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
          MP Audience
        </Badge>
      </div>

      <Tabs value={secao} onValueChange={(v) => setSecao(v as SecaoId)}>
        <TabsList>
          <TabsTrigger value="campanhas">
            <Megaphone className="h-3.5 w-3.5 mr-1.5" /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="conversoes">
            <MousePointerClick className="h-3.5 w-3.5 mr-1.5" /> Conversões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="mt-4">
          <GoogleCampaignsTable />
        </TabsContent>

        <TabsContent value="conversoes" className="mt-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Área "Google Ads" do MP CRM — apenas Customer Match / Audiences.
// Acompanhamento de campanhas e conversões offline foi movido para o MP Audience
// (/audience/google-ads). Customer Match fica aqui por coerência com Meta Audiences
// (infraestrutura de plataforma).

import { AlertTriangle, KeyRound, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CustomerMatchEnsure from "./CustomerMatchEnsure";

export default function GoogleAdsAdmin() {
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-sky-600" />
            Google Ads — Customer Match
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Listas de Customer Match para Google Ads (a par das Meta Audiences). O
            acompanhamento de campanhas e conversões offline vive agora no{" "}
            <strong>MP Audience → Google Ads</strong>.
          </p>
        </div>
        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" /> Sprint 2 — gated
        </Badge>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 flex items-start gap-3 text-sm">
          <KeyRound className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Dependência: Data Manager API</p>
            <p className="text-muted-foreground">
              O upload de listas Customer Match depende da <strong>Data Manager API</strong>{" "}
              da Google e de um <strong>developer token</strong> aprovado
              (Basic/Standard access).
            </p>
          </div>
        </CardContent>
      </Card>

      <CustomerMatchEnsure />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" /> Próximos passos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Construção de listas a partir de contactos/leads (respeitando consentimento e hashing).</li>
            <li>Upload e estado de match (Sprint 2, gated na Data Manager API).</li>
            <li>Lookalike / segmentos derivados.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

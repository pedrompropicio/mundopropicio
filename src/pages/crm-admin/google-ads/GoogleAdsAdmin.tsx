// Área admin "Google Ads" do MP CRM (Sprint 1 — esqueleto navegável).
// A par de meta-capi e meta-audiences. Sem lógica de API: só navegação +
// placeholders das secções (Conversões, Campanhas, Audiences/Customer Match,
// Definições). A lógica chega no Sprint 2 (depende da Data Manager API + do
// developer token da Google aprovado).

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  KeyRound,
  Megaphone,
  MousePointerClick,
  Settings,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CustomerMatchEnsure from "./CustomerMatchEnsure";

type SecaoId = "conversoes" | "campanhas" | "audiences" | "definicoes";

function Placeholder({
  icon: Icon,
  titulo,
  descricao,
  itens,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  descricao: string;
  itens: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" /> {titulo}
          <Badge variant="outline" className="ml-auto bg-muted text-muted-foreground border-border">
            Sprint 2
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{descricao}</p>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          {itens.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function GoogleAdsAdmin() {
  const [secao, setSecao] = useState<SecaoId>("conversoes");

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-sky-600" />
            Google Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Integração Google Ads do MP Audience — atribuição de clique (GCLID),
            conversões offline e espelho de campanhas. Em paralelo ao Meta.
          </p>
        </div>
        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" /> Sprint 1 — esqueleto
        </Badge>
      </div>

      {/* Gate do developer token */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 flex items-start gap-3 text-sm">
          <KeyRound className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Dependências pendentes (Sprint 2)</p>
            <p className="text-muted-foreground">
              O envio de conversões e a sincronização de campanhas dependem da{" "}
              <strong>Data Manager API</strong> da Google e de um{" "}
              <strong>developer token</strong> aprovado (Basic/Standard access). Esta
              sprint cria apenas o schema <code className="text-xs bg-muted px-1 rounded">crm.google_*</code>,
              a captura de GCLID na landing e este esqueleto de navegação — nada que
              exija credenciais da Google API.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Navegação por secção */}
      <Tabs value={secao} onValueChange={(v) => setSecao(v as SecaoId)}>
        <TabsList>
          <TabsTrigger value="conversoes">
            <MousePointerClick className="h-3.5 w-3.5 mr-1.5" /> Conversões
          </TabsTrigger>
          <TabsTrigger value="campanhas">
            <Megaphone className="h-3.5 w-3.5 mr-1.5" /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="audiences">
            <Users className="h-3.5 w-3.5 mr-1.5" /> Audiences / Customer Match
          </TabsTrigger>
          <TabsTrigger value="definicoes">
            <Settings className="h-3.5 w-3.5 mr-1.5" /> Definições
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversoes" className="mt-4">
          <Placeholder
            icon={MousePointerClick}
            titulo="Conversões offline (Data Manager API)"
            descricao="Fila crm.google_conversion — conversões de venda (transaction_id Ticketline/Fever) atribuídas a um clique (gclid/gbraid/wbraid) e enviadas à Google. Espelha a lógica do purchase do CAPI Meta."
            itens={[
              "Monitor de estado (pending / sent / failed) e data_manager_job_id.",
              "Deduplicação por order_id (transaction_id da venda).",
              "Reenvio manual de falhas e detalhe de erro.",
            ]}
          />
        </TabsContent>

        <TabsContent value="campanhas" className="mt-4">
          <Placeholder
            icon={Megaphone}
            titulo="Espelho de campanhas"
            descricao="Snapshot read-only de Campaign → Ad Group → Keyword / Asset Group, com performance e last_synced_at. NÃO é source of truth para status/budget (igual ao espelho Meta)."
            itens={[
              "Lista de campanhas Search e Performance Max.",
              "Performance (impressões, cliques, custo, conversões).",
              "Sincronização via Google Ads API (Sprint 2).",
            ]}
          />
        </TabsContent>

        <TabsContent value="audiences" className="mt-4">
          <Placeholder
            icon={Users}
            titulo="Audiences / Customer Match"
            descricao="Listas de Customer Match a partir da audiência primária do Portal (à semelhança das Custom Audiences do Meta), respeitando consentimento e hashing."
            itens={[
              "Construção de listas a partir de contactos/leads.",
              "Upload e estado de match (Sprint 2).",
              "Lookalike / segmentos derivados.",
            ]}
          />
        </TabsContent>

        <TabsContent value="definicoes" className="mt-4">
          <Placeholder
            icon={Settings}
            titulo="Definições"
            descricao="Ligação da conta Google Ads (OAuth), developer token, conversion actions e mapeamento de eventos."
            itens={[
              "Conexão OAuth (crm.ad_platform_connections, platform='google').",
              "Conversion actions e mapeamento order → conversão.",
              "Estado do developer token (Basic/Standard).",
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

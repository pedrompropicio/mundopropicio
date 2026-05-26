import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DiagnosisTest() {
  const [companyId, setCompanyId] = useState("7c858982-6ccd-47ca-bd65-e0dd3eebf01c");
  const [externalCampaignId, setExternalCampaignId] = useState("120249812312780595");
  const [targetRoas, setTargetRoas] = useState("8.0");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-campaign-diagnosis", {
        body: {
          company_id: companyId,
          external_campaign_id: externalCampaignId,
          target_roas: Number(targetRoas),
        },
      });
      if (error) {
        // Try to extract response body if available
        let body: any = null;
        try {
          // @ts-expect-error - FunctionsHttpError has context.response
          body = await error.context?.response?.text?.();
        } catch { /* ignore */ }
        setError({ message: error.message, name: error.name, body, raw: error });
      }
      setResult(data ?? null);
    } catch (e: any) {
      setError({ message: e?.message ?? String(e), raw: e });
    } finally {
      setLoading(false);
    }
  };

  const highlight = (result && typeof result === "object") ? result : {};

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Teste — crm-campaign-diagnosis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ferramenta interna para invocar a edge function com a sessão atual.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parâmetros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company_id">company_id</Label>
            <Input id="company_id" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="external_campaign_id">external_campaign_id</Label>
            <Input id="external_campaign_id" value={externalCampaignId} onChange={(e) => setExternalCampaignId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target_roas">target_roas</Label>
            <Input id="target_roas" type="number" step="0.1" value={targetRoas} onChange={(e) => setTargetRoas(e.target.value)} />
          </div>
          <Button onClick={run} disabled={loading}>
            {loading ? "A correr…" : "Correr diagnóstico"}
          </Button>
        </CardContent>
      </Card>

      {(result || error) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destaques</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {["ok", "source_campaign_class", "projected_baseline_roas", "recommended_posture", "persisted", "diagnosis_id", "error", "detail"].map((k) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-muted-foreground">{k}</dt>
                  <dd className="font-mono break-all">{highlight[k] !== undefined ? JSON.stringify(highlight[k]) : "—"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto bg-muted p-3 rounded">{JSON.stringify(error, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resposta completa</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto bg-muted p-3 rounded">{JSON.stringify(result, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

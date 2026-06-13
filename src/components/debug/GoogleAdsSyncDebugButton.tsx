// TEMPORÁRIO — remover após validação do sync Google Ads em Live.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export function GoogleAdsSyncDebugButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const handleClick = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-google-ads-sync", {
        body: {},
      });
      setResult({ data, error });
    } catch (e) {
      setResult({ thrown: String(e), details: e });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium">Debug — sync Google Ads</p>
            <p className="text-xs text-muted-foreground">
              Temporário — remover após validação. Invoca a edge function{" "}
              <code className="text-[11px] bg-muted px-1 rounded">crm-google-ads-sync</code>.
            </p>
          </div>
          <Button onClick={handleClick} disabled={loading} variant="outline" size="sm">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                A disparar…
              </>
            ) : (
              "Disparar sync Google Ads (debug)"
            )}
          </Button>
        </div>
        {result !== null && (
          <pre className="text-[11px] leading-relaxed overflow-auto max-h-96 p-3 rounded bg-background border border-border whitespace-pre-wrap break-all">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

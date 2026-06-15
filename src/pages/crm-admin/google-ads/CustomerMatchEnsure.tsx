// Customer Match — botão para invocar `crm-google-user-list-ensure` em produção.
// Usa a sessão do utilizador (supabase client). Mostra o resultado cru
// (status HTTP + JSON) para o Pedro poder ler o desfecho sem ir aos logs.
// Upload de membros continua gated na Data Manager API.

import { useState } from "react";
import { Loader2, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const USER_LIST_ID = "fc1c186b-17b3-4632-99f7-581e136cd452";

type Outcome = {
  httpStatus: number | null;
  ok: boolean;
  body: unknown;
  errorMessage?: string;
};

export default function CustomerMatchEnsure() {
  const { role } = useAuth();
  const authorized = role === "admin" || role === ("platform_admin" as any) || role === "marketing_manager";
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (!authorized) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Sem permissão para gerir Customer Match. Requer <code>admin</code>, <code>platform_admin</code> ou <code>marketing_manager</code>.
        </CardContent>
      </Card>
    );
  }

  const run = async () => {
    setLoading(true);
    setOutcome(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-google-user-list-ensure", {
        body: { user_list_id: USER_LIST_ID },
      });

      // FunctionsHttpError expõe context.response
      const anyErr = error as any;
      const resp: Response | undefined = anyErr?.context?.response ?? anyErr?.context;
      let httpStatus: number | null = null;
      let body: unknown = data ?? null;
      let errorMessage: string | undefined;

      if (error) {
        errorMessage = anyErr?.message ?? String(error);
        if (resp && typeof resp.status === "number") {
          httpStatus = resp.status;
          try {
            const text = await resp.clone().text();
            try {
              body = JSON.parse(text);
            } catch {
              body = text;
            }
          } catch {
            // ignore
          }
        }
      } else {
        httpStatus = 200;
      }

      setOutcome({ httpStatus, ok: !error, body, errorMessage });
    } catch (e: any) {
      setOutcome({ httpStatus: null, ok: false, body: null, errorMessage: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Customer Match — "MP Leads"
          <Badge variant="outline" className="ml-auto">Live</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1 text-muted-foreground">
          <p>
            Cria (ou sincroniza) a lista de Customer Match na conta Google Ads associada.
            Lista alvo: <code className="text-xs bg-muted px-1 rounded">{USER_LIST_ID}</code> ("MP Leads — Customer Match").
          </p>
          <p>
            O <strong>upload de membros</strong> continua gated na Data Manager API e não é feito por este botão.
          </p>
        </div>

        <Button onClick={run} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              A invocar…
            </>
          ) : (
            "Criar/sincronizar lista no Google"
          )}
        </Button>

        {outcome && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {outcome.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              <span className="font-medium">
                HTTP {outcome.httpStatus ?? "—"} {outcome.ok ? "OK" : "ERRO"}
              </span>
              {outcome.errorMessage && (
                <span className="text-muted-foreground">— {outcome.errorMessage}</span>
              )}
            </div>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[480px] whitespace-pre-wrap break-words">
{typeof outcome.body === "string"
  ? outcome.body
  : JSON.stringify(outcome.body, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

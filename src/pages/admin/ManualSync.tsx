import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { BookOpen, Loader2, RefreshCw } from "lucide-react";
import { loadManualSyncPayload, manualFileCount } from "@/lib/help-manual-source";

interface SyncResult {
  ok?: boolean;
  inserted?: string[];
  updated?: string[];
  unchanged?: string[];
  orphans?: string[];
  chunks?: number;
  errors?: { slug: string; error: string }[];
  error?: string;
}

export default function ManualSync() {
  const { role } = useAuth();
  const isAuthorized = role === "admin" || role === ("platform_admin" as any);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  if (!isAuthorized) return <Navigate to="/" replace />;

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const articles = loadManualSyncPayload();
      const { data, error } = await supabase.functions.invoke("manual-sync", {
        body: { articles },
      });
      if (error) throw error;
      const res = data as SyncResult;
      setResult(res);
      if (res?.error) {
        toast({ title: "Sincronização falhou", description: res.error, variant: "destructive" });
      } else if ((res?.errors ?? []).length > 0) {
        toast({
          title: "Sincronização com erros",
          description: `${res.errors!.length} artigo(s) não foram gravados`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Manual sincronizado",
          description: `${res.inserted?.length ?? 0} inseridos · ${res.updated?.length ?? 0} atualizados · ${res.unchanged?.length ?? 0} inalterados`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ error: msg });
      toast({ title: "Sincronização falhou", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const list = (label: string, items?: string[]) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground w-28">{label}</span>
      {(items ?? []).length === 0 ? (
        <span className="text-sm">—</span>
      ) : (
        (items ?? []).map((s) => (
          <Badge key={`${label}-${s}`} variant="secondary">
            {s}
          </Badge>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Sincronizar manual
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lê os artigos-fonte do Manual de Orientação e grava-os na base (texto, secções e
          pedaços para pesquisa). Artigos que já estão iguais não são regravados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Artigos-fonte</CardTitle>
          <CardDescription>
            {manualFileCount()} capítulo(s) encontrado(s) no manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={run} disabled={running}>
            {running ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> A sincronizar…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" /> Sincronizar manual
              </>
            )}
          </Button>

          {result && (
            <div className="space-y-2 rounded-md border p-4">
              {result.error && (
                <p className="text-sm text-destructive">{result.error}</p>
              )}
              {!result.error && (
                <>
                  {list("Inseridos", result.inserted)}
                  {list("Atualizados", result.updated)}
                  {list("Inalterados", result.unchanged)}
                  {list("Órfãos", result.orphans)}
                  <p className="text-sm text-muted-foreground">
                    Pedaços gravados: {result.chunks ?? 0}
                  </p>
                  {(result.errors ?? []).length > 0 && (
                    <ul className="text-sm text-destructive list-disc pl-5">
                      {result.errors!.map((e) => (
                        <li key={e.slug}>
                          {e.slug}: {e.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Estado de FALHA de uma consulta — distinto do estado vazio.
 *
 * A 14/09/2026 o ecrã de Transações mostrou "Sem transações registadas." durante
 * mais de um dia enquanto a consulta devolvia PGRST201. Uma lista vazia e uma
 * consulta falhada nunca mais podem ter o mesmo aspeto.
 */
export function QueryErrorState({
  title = "Não foi possível carregar os dados",
  error,
  onRetry,
  context,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  /** Identifica a consulta no registo da consola, ex.: "Transações — lista". */
  context?: string;
}) {
  const err = error as { message?: string; code?: string; hint?: string; details?: unknown } | null;
  const message = err?.message ?? String(error ?? "Erro desconhecido");

  React.useEffect(() => {
    console.error(`[query falhou]${context ? ` ${context}` : ""}`, error);
  }, [error, context]);

  return (
    <div
      role="alert"
      className="my-4 rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-left"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-destructive">{title}</p>
          <p className="break-words font-mono text-xs text-destructive/90">
            {err?.code ? `${err.code}: ` : ""}
            {message}
          </p>
          {err?.hint && (
            <p className="break-words text-xs text-muted-foreground">Sugestão do servidor: {err.hint}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Isto é uma falha da consulta, não uma lista vazia. O erro completo está registado na consola.
          </p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Tentar de novo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default QueryErrorState;

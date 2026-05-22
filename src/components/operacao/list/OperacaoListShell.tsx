import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListScope } from "@/hooks/useOperacaoListFilters";

interface Props {
  title: string;
  subtitle?: string;
  scope: ListScope;
  filtersBar?: ReactNode;
  refreshButton?: boolean;
  lastUpdatedAt?: number;
  onRefresh?: () => void;
  isFetching?: boolean;
  total?: number | null;
  page: number;
  pageSize: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  isEmpty: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  children: ReactNode;
}

function ageSeconds(ts?: number): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - ts) / 1000);
}

export function OperacaoListShell({
  title,
  subtitle,
  filtersBar,
  refreshButton,
  lastUpdatedAt,
  onRefresh,
  isFetching,
  total,
  page,
  pageSize,
  onLoadMore,
  hasMore,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  isEmpty,
  emptyTitle = "Sem resultados",
  emptyMessage,
  emptyAction,
  children,
}: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const age = ageSeconds(lastUpdatedAt);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="sticky top-12 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur border-b">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs md:text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {total !== null && total !== undefined && (
              <span className="text-xs text-muted-foreground">
                {total} {total === 1 ? "resultado" : "resultados"}
              </span>
            )}
            {refreshButton && (
              <>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  {lastUpdatedAt ? `atualizado há ${age}s` : "—"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isFetching}
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5 mr-1", isFetching && "animate-spin")}
                  />
                  Atualizar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {filtersBar}

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro a carregar</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs">{errorMessage ?? "Tenta novamente."}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Repetir
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <Card className="p-10 text-center space-y-3">
          <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="font-medium">{emptyTitle}</h3>
          {emptyMessage && (
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {emptyMessage}
            </p>
          )}
          {emptyAction}
        </Card>
      ) : (
        <Card className="overflow-hidden">{children}</Card>
      )}

      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isFetching}>
            {isFetching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> A carregar…
              </>
            ) : (
              <>Carregar mais (pág. {page + 2})</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

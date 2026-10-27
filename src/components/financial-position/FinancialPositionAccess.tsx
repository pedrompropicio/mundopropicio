import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { FINANCIAL_POSITION_PERMISSION } from "@/lib/financial-position";

export function FinancialPositionAccess({ children }: { children: ReactNode }) {
  const { loading, hasPermission } = useAuth();
  if (loading) return <p role="status">A verificar acesso…</p>;
  if (!hasPermission(FINANCIAL_POSITION_PERMISSION)) return <section><h1 className="text-2xl font-semibold">Sem acesso</h1><p className="text-muted-foreground">Sem permissão para ver a posição financeira</p></section>;
  return <>{children}</>;
}
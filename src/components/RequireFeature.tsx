import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompanyFeaturesSet } from "@/hooks/useCompanyFeatures";
import type { FeatureKey } from "@/lib/features";

/** Bloqueia uma rota quando a empresa ativa não tem a função (company_features). */
export function RequireFeature({
  feature,
  children,
  backTo = "/",
}: {
  feature: FeatureKey;
  children: ReactNode;
  backTo?: string;
}) {
  const { data, isLoading } = useCompanyFeaturesSet();
  if (isLoading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="A carregar">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data?.has(feature)) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-lg font-semibold text-foreground">Não disponível nesta empresa</h2>
        <p className="text-sm text-muted-foreground">Esta função não está ativa para a empresa selecionada.</p>
        <Button asChild variant="outline"><Link to={backTo}>Voltar</Link></Button>
      </div>
    );
  }
  return <>{children}</>;
}

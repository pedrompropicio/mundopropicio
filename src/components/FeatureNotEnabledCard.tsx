import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FEATURE_LABELS, type FeatureKey } from "@/lib/features";

interface Props {
  featureKey: FeatureKey;
}

export function FeatureNotEnabledCard({ featureKey }: Props) {
  const navigate = useNavigate();
  const meta = FEATURE_LABELS[featureKey];

  return (
    <div className="flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            Funcionalidade não disponível
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A funcionalidade <strong>"{meta?.label ?? featureKey}"</strong> não está
            ativa para a empresa atual. Contacta o suporte para a ativar.
          </p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

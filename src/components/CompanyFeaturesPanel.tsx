import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ALL_FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@/lib/features";

interface Row {
  id?: string;
  feature_key: string;
  enabled: boolean;
  enabled_at: string | null;
  enabled_by: string | null;
}

export function CompanyFeaturesPanel({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { isPlatformAdmin } = useCompany();

  const q = useQuery({
    queryKey: ["company-features-admin", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_features" as any)
        .select("id, feature_key, enabled, enabled_at, enabled_by")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const byKey = new Map<string, Row>((q.data ?? []).map((r) => [r.feature_key, r]));

  const toggleMut = useMutation({
    mutationFn: async ({ key, enabled }: { key: FeatureKey; enabled: boolean }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        company_id: companyId,
        feature_key: key,
        enabled,
        enabled_at: new Date().toISOString(),
        enabled_by: u.user?.id ?? null,
      };
      const { error } = await supabase
        .from("company_features" as any)
        .upsert(payload, { onConflict: "company_id,feature_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-features-admin", companyId] });
      qc.invalidateQueries({ queryKey: ["company-features"] });
      toast({ title: "Feature atualizada" });
    },
    onError: (e: any) =>
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <Label className="text-base">Features ativas</Label>
        <p className="text-xs text-muted-foreground">
          Controlo da plataforma — só super-admin pode alterar.
        </p>
      </div>
      {ALL_FEATURE_KEYS.map((key) => {
        const meta = FEATURE_LABELS[key];
        const row = byKey.get(key);
        const enabled = !!row?.enabled;
        return (
          <div
            key={key}
            className="flex items-start justify-between gap-3 rounded-md border p-3"
          >
            <div className="flex-1">
              <div className="text-sm font-medium">{meta.label}</div>
              <div className="text-xs text-muted-foreground">{meta.description}</div>
              {row?.enabled_at && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Última alteração: {new Date(row.enabled_at).toLocaleString("pt-PT")}
                </div>
              )}
            </div>
            <Switch
              checked={enabled}
              disabled={!isPlatformAdmin || toggleMut.isPending}
              onCheckedChange={(checked) => toggleMut.mutate({ key, enabled: checked })}
            />
          </div>
        );
      })}
    </div>
  );
}

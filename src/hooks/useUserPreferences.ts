import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface UserPreferences {
  consolidate_refunds_view: boolean;
}

const DEFAULTS: UserPreferences = {
  consolidate_refunds_view: false,
};

export function useUserPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["user_preferences", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<UserPreferences> => {
      if (!userId) return DEFAULTS;
      const { data, error } = await supabase
        .from("user_preferences" as any)
        .select("consolidate_refunds_view")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULTS;
      return {
        consolidate_refunds_view: !!(data as any).consolidate_refunds_view,
      };
    },
  });

  const setConsolidateRefundsMutation = useMutation({
    mutationFn: async (value: boolean) => {
      if (!userId) throw new Error("Sem utilizador autenticado");
      const { error } = await supabase
        .from("user_preferences" as any)
        .upsert(
          { user_id: userId, consolidate_refunds_view: value, updated_at: new Date().toISOString() } as any,
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey: ["user_preferences", userId] });
      const previous = qc.getQueryData<UserPreferences>(["user_preferences", userId]);
      qc.setQueryData<UserPreferences>(["user_preferences", userId], {
        ...(previous ?? DEFAULTS),
        consolidate_refunds_view: value,
      });
      return { previous };
    },
    onError: (_err, _value, ctx) => {
      if (ctx?.previous) qc.setQueryData(["user_preferences", userId], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["user_preferences", userId] });
    },
  });

  const prefs = query.data ?? DEFAULTS;

  return {
    isLoading: query.isLoading,
    consolidateRefunds: prefs.consolidate_refunds_view,
    setConsolidateRefunds: (v: boolean) => setConsolidateRefundsMutation.mutate(v),
  };
}

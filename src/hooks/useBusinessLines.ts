import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

export interface BusinessLine {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

/** Catálogo da empresa activa; a edição também precisa das linhas inactivas. */
export function useBusinessLines(activeOnly = false) {
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["business-lines", companyId, user?.id, activeOnly],
    enabled: !!companyId,
    queryFn: async (): Promise<BusinessLine[]> => {
      if (!companyId) throw new Error("Empresa não identificada.");
      let query = supabase.from("business_lines" as any).select("*")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await fetchAllPagedQuery<BusinessLine>(query);
      if (error) throw error;
      return data ?? [];
    },
  });
}

type BusinessLineChange =
  | { kind: "create"; name: string; sort_order: number }
  | { kind: "update"; id: string; values: Partial<Pick<BusinessLine, "name" | "is_active">> }
  | { kind: "reorder"; rows: Pick<BusinessLine, "id" | "sort_order">[] };

export function useSaveBusinessLine() {
  const { companyId } = useCompany();
  const { isAdmin, isManager } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: BusinessLineChange) => {
      if (!companyId || !(isAdmin || isManager)) throw new Error("Sem permissão para gerir linhas de negócio.");
      const update = async (id: string, values: object) => {
        const { data, error } = await supabase.from("business_lines" as any)
          .update(values as any).eq("company_id", companyId).eq("id", id).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Linha não gravada (sem permissão ou inexistente).");
      };
      if (change.kind === "create") {
        const { data, error } = await supabase.from("business_lines" as any).insert({
          company_id: companyId, name: change.name.trim(), sort_order: change.sort_order,
        } as any).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Linha não criada.");
      } else if (change.kind === "update") {
        await update(change.id, {
          ...change.values,
          ...(change.values.name !== undefined ? { name: change.values.name.trim() } : {}),
        });
      } else {
        // Escreve só a ordem, sem repor nomes/estado a partir de um snapshot do cliente.
        for (const row of change.rows) await update(row.id, { sort_order: row.sort_order });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["business-lines"] }),
    onError: (error: Error & { code?: string }) => toast({
      title: "Erro ao gravar linha de negócio",
      description: error.code === "23505"
        ? "Já existe uma linha de negócio com este nome nesta empresa."
        : error.message,
      variant: "destructive",
    }),
  });
}

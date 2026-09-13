/**
 * (g9c · P2-12) Ligação utilizador ↔ sócio.
 *
 * O Portal do Sócio só mostra o fechamento a quem resolve para um `supplier`
 * (via `profiles.linked_supplier_id`). Este campo faz essa ligação na ficha do
 * fornecedor/sócio, sem obrigar a mexer na base de dados.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const NONE = "__none__";

interface PartnerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  linked_supplier_id: string | null;
}

export function SupplierPortalUserLink({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["portal-partner-profiles"],
    queryFn: async (): Promise<PartnerProfile[]> => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "partner");
      if (rolesErr) throw rolesErr;
      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id as string)));
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, linked_supplier_id")
        .in("id", ids)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PartnerProfile[];
    },
  });

  const current = useMemo(
    () => profiles.find((p) => p.linked_supplier_id === supplierId) ?? null,
    [profiles, supplierId],
  );

  const link = useMutation({
    mutationFn: async (profileId: string | null) => {
      // Desliga quem estivesse ligado a este sócio (1 sócio ↔ 1 utilizador).
      if (current && current.id !== profileId) {
        const { error } = await supabase
          .from("profiles")
          .update({ linked_supplier_id: null })
          .eq("id", current.id);
        if (error) throw error;
      }
      if (profileId) {
        const { error } = await supabase
          .from("profiles")
          .update({ linked_supplier_id: supplierId })
          .eq("id", profileId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-partner-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Utilizador do Portal actualizado");
    },
    onError: (e: any) => toast.error("Não foi possível ligar o utilizador", { description: e?.message }),
  });

  return (
    <div className="grid gap-2">
      <Label htmlFor="sup-portal-user">Utilizador do Portal</Label>
      <Select
        value={current?.id ?? NONE}
        onValueChange={(v) => link.mutate(v === NONE ? null : v)}
        disabled={isLoading || link.isPending}
      >
        <SelectTrigger id="sup-portal-user">
          <SelectValue placeholder={isLoading ? "A carregar…" : "Sem utilizador ligado"} />
        </SelectTrigger>
        <SelectContent className="z-[70]">
          <SelectItem value={NONE}>Sem utilizador ligado</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name || p.email || p.id}
              {p.linked_supplier_id && p.linked_supplier_id !== supplierId ? " (já ligado a outro sócio)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Sem utilizador ligado, o Portal não mostra o acerto de contas deste sócio.
      </p>
    </div>
  );
}

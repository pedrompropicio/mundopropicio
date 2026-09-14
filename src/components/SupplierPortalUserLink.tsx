/**
 * (g9c · P2-12) Ligação utilizador ↔ sócio.
 *
 * O Portal do Sócio só mostra o fechamento a quem resolve para um `supplier`.
 * A escrita é feita EXCLUSIVAMENTE pela RPC `set_partner_portal_user` — o UPDATE
 * directo em `public.profiles` apanhava 0 linhas (RLS `id = auth.uid()`) e ainda
 * assim mostrava sucesso. A resolução real vem de `partner_portal_links()`.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const NONE = "__none__";

interface PortalLink {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  link_source: string | null;
}

export function SupplierPortalUserLink({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient();

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["partner-portal-links"],
    queryFn: async (): Promise<PortalLink[]> => {
      const { data, error } = await supabase.rpc("partner_portal_links");
      if (error) throw error;
      return (data ?? []) as PortalLink[];
    },
  });

  const current = useMemo(
    () => links.find((l) => l.supplier_id === supplierId) ?? null,
    [links, supplierId],
  );

  const link = useMutation({
    mutationFn: async (profileId: string | null) => {
      const { error } = await supabase.rpc("set_partner_portal_user", {
        _supplier_id: supplierId,
        _profile_id: profileId as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-partner-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["partner-portal-links"] });
      queryClient.invalidateQueries({ queryKey: ["partner_users"] });
      toast.success("Utilizador do Portal actualizado");
    },
    onError: (e: any) =>
      toast.error("Não foi possível ligar o utilizador", { description: e?.message ?? String(e) }),
  });

  return (
    <div className="grid gap-2">
      <Label htmlFor="sup-portal-user">Utilizador do Portal</Label>
      <Select
        value={current?.profile_id ?? NONE}
        onValueChange={(v) => link.mutate(v === NONE ? null : v)}
        disabled={isLoading || link.isPending}
      >
        <SelectTrigger id="sup-portal-user">
          <SelectValue placeholder={isLoading ? "A carregar…" : "Sem utilizador ligado"} />
        </SelectTrigger>
        <SelectContent className="z-[70]">
          <SelectItem value={NONE}>Sem utilizador ligado</SelectItem>
          {links.map((l) => (
            <SelectItem key={l.profile_id} value={l.profile_id}>
              {l.full_name || l.email || l.profile_id}
              {l.supplier_id && l.supplier_id !== supplierId
                ? ` (já ligado a ${l.supplier_name || "outro sócio"})`
                : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current?.link_source === "email" && (
        <p className="text-xs text-amber-600">
          Resolvido apenas por coincidência de email. Escolhe o utilizador para fixar a ligação.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Sem utilizador ligado, o Portal não mostra o acerto de contas deste sócio.
      </p>
    </div>
  );
}

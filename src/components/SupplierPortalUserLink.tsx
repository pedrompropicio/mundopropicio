/**
 * (g9c · P2-12) Representantes no Portal de um sócio.
 *
 * Um sócio é uma EMPRESA e pode ter N representantes: a relação é
 * N utilizadores → 1 sócio. Por isso isto é uma LISTA, não um seletor único.
 *
 * A escrita é feita EXCLUSIVAMENTE pelas RPC `set_partner_portal_user` (ligar) e
 * `unset_partner_portal_user` (desligar) — o UPDATE directo em `public.profiles`
 * apanhava 0 linhas (RLS `id = auth.uid()`) e ainda assim mostrava sucesso. A
 * resolução real vem de `partner_portal_links()`, que devolve também ligações
 * resolvidas por coincidência de email — essas não se removem porque não existem.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { X } from "lucide-react";

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

  const representatives = useMemo(
    () => links.filter((l) => l.supplier_id === supplierId),
    [links, supplierId],
  );
  const available = useMemo(
    () => links.filter((l) => l.supplier_id !== supplierId),
    [links, supplierId],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["portal-partner-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["partner-portal-links"] });
    queryClient.invalidateQueries({ queryKey: ["partner_users"] });
  };

  const add = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.rpc("set_partner_portal_user", {
        _supplier_id: supplierId,
        _profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Representante acrescentado");
    },
    onError: (e: any) =>
      toast.error("Não foi possível ligar o utilizador", { description: e?.message ?? String(e) }),
  });

  const remove = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.rpc("unset_partner_portal_user", { _profile_id: profileId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Representante removido");
    },
    onError: (e: any) =>
      toast.error("Não foi possível remover o utilizador", { description: e?.message ?? String(e) }),
  });

  const busy = isLoading || add.isPending || remove.isPending;

  return (
    <div className="grid gap-2">
      <Label htmlFor="sup-portal-user">Representantes no Portal</Label>

      {representatives.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum representante ligado.</p>
      ) : (
        <ul className="space-y-1">
          {representatives.map((r) => (
            <li
              key={r.profile_id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{r.full_name || r.email || r.profile_id}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.email || "sem email"} ·{" "}
                  {r.link_source === "email" ? "resolvido por coincidência de email" : "ligação registada"}
                </p>
              </div>
              {r.link_source === "email" ? (
                <span className="text-[11px] text-amber-600">sem ligação para remover</span>
              ) : (
                <button
                  type="button"
                  onClick={() => remove.mutate(r.profile_id)}
                  disabled={busy}
                  aria-label="Remover representante"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Select value="" onValueChange={(v) => add.mutate(v)} disabled={busy}>
        <SelectTrigger id="sup-portal-user">
          <SelectValue placeholder={isLoading ? "A carregar…" : "Acrescentar representante"} />
        </SelectTrigger>
        <SelectContent className="z-[70]">
          {available.map((l) => (
            <SelectItem key={l.profile_id} value={l.profile_id}>
              {l.full_name || l.email || l.profile_id}
              {l.supplier_id ? ` (representa ${l.supplier_name || "outro sócio"})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-xs text-muted-foreground">
        Sem nenhum representante ligado, o Portal não mostra o acerto de contas deste sócio.
      </p>
    </div>
  );
}

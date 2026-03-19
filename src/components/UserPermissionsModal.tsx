import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type AppRole, ALL_PERMISSIONS } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userRole: AppRole;
}

export default function UserPermissionsModal({ open, onOpenChange, userId, userName, userRole }: Props) {
  const queryClient = useQueryClient();

  // Get role-level defaults
  const { data: rolePerms = [] } = useQuery({
    queryKey: ["role-permissions", userRole],
    queryFn: async () => {
      const { data } = await supabase
        .from("role_permissions")
        .select("permission")
        .eq("role", userRole);
      return data?.map((r) => r.permission) ?? [];
    },
    enabled: open,
  });

  // Get user-level overrides
  const { data: userOverrides = [], isLoading } = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_permissions")
        .select("permission, granted")
        .eq("user_id", userId);
      return data ?? [];
    },
    enabled: open,
  });

  // Local state for toggle changes
  const [localOverrides, setLocalOverrides] = useState<Record<string, boolean | undefined>>({});

  useEffect(() => {
    const map: Record<string, boolean | undefined> = {};
    for (const o of userOverrides) {
      map[o.permission] = o.granted;
    }
    setLocalOverrides(map);
  }, [userOverrides]);

  const isPermGranted = (permKey: string) => {
    if (localOverrides[permKey] !== undefined) return localOverrides[permKey];
    return rolePerms.includes(permKey);
  };

  const isOverridden = (permKey: string) => localOverrides[permKey] !== undefined;

  const togglePerm = (permKey: string) => {
    const roleDefault = rolePerms.includes(permKey);
    const currentValue = isPermGranted(permKey);
    const newValue = !currentValue;

    if (newValue === roleDefault) {
      // Remove override - back to default
      setLocalOverrides((prev) => {
        const next = { ...prev };
        delete next[permKey];
        return next;
      });
    } else {
      setLocalOverrides((prev) => ({ ...prev, [permKey]: newValue }));
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Delete all existing overrides for this user
      await supabase.from("user_permissions").delete().eq("user_id", userId);

      // Insert new overrides
      const inserts = Object.entries(localOverrides)
        .filter(([_, v]) => v !== undefined)
        .map(([permission, granted]) => ({
          user_id: userId,
          permission,
          granted: granted!,
        }));

      if (inserts.length > 0) {
        const { error } = await supabase.from("user_permissions").insert(inserts);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
      toast({ title: "Permissões guardadas!" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" });
    },
  });

  const groups = [...new Set(ALL_PERMISSIONS.map((p) => p.group))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissões de {userName}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Toggle para ativar/desativar. Itens com fundo destacado têm override individual.
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group}</h4>
                <div className="space-y-1">
                  {ALL_PERMISSIONS.filter((p) => p.group === group).map((perm) => {
                    const granted = isPermGranted(perm.key);
                    const overridden = isOverridden(perm.key);
                    return (
                      <button
                        key={perm.key}
                        type="button"
                        onClick={() => togglePerm(perm.key)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                          overridden
                            ? "bg-primary/10 border border-primary/20"
                            : "hover:bg-secondary/50"
                        }`}
                      >
                        <span className={granted ? "text-foreground" : "text-muted-foreground line-through"}>
                          {perm.label}
                        </span>
                        <div className="flex items-center gap-2">
                          {overridden && (
                            <span className="text-[10px] font-medium text-primary">CUSTOM</span>
                          )}
                          <div
                            className={`h-5 w-9 rounded-full transition-colors flex items-center px-0.5 ${
                              granted ? "bg-primary" : "bg-muted"
                            }`}
                          >
                            <div
                              className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                granted ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

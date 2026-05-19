import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, HardHat, Send, Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import { NewStaffDialog } from "@/components/operacao/NewStaffDialog";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

type Filter = "active" | "pending" | "archived";

export default function StaffList() {
  const { hasPermission, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canManage = isAdmin || hasPermission("manage_operacao_staff");
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<Filter>("active");

  const { data: staff } = useQuery({
    queryKey: ["op-staff-list", filter],
    enabled: canManage,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, email, phone, archived_at, created_at, operacao_staff_invites(id, status, sent_at, expires_at)")
        .eq("profile_type", "field_staff")
        .order("created_at", { ascending: false });
      if (filter === "archived") q = q.not("archived_at", "is", null);
      else q = q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (filter === "pending") {
        return rows.filter((p: any) =>
          (p.operacao_staff_invites ?? []).some((i: any) => i.status === "pending"),
        );
      }
      if (filter === "active") {
        return rows.filter((p: any) =>
          (p.operacao_staff_invites ?? []).some((i: any) => i.status === "accepted") ||
          (p.operacao_staff_invites ?? []).length === 0,
        );
      }
      return rows;
    },
  });

  const resend = async (profileId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-staff-invite", { body: { profile_id: profileId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Convite reenviado" });
      qc.invalidateQueries({ queryKey: ["op-staff-list"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const toggleArchive = async (profileId: string, currentlyArchived: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ archived_at: currentlyArchived ? null : new Date().toISOString() })
      .eq("id", profileId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: currentlyArchived ? "Restaurado" : "Arquivado" });
    qc.invalidateQueries({ queryKey: ["op-staff-list"] });
  };

  if (!canManage) {
    return <div className="p-6 text-sm text-muted-foreground">Sem permissão para gerir Staff.</div>;
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HardHat className="h-6 w-6" /> Staff de Campo
          </h1>
          <p className="text-sm text-muted-foreground">Produtores e auxiliares com login restrito à Operação.</p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="active">Ativos</TabsTrigger>
          <TabsTrigger value="pending">Convite pendente</TabsTrigger>
          <TabsTrigger value="archived">Arquivados</TabsTrigger>
        </TabsList>
      </Tabs>

      {!staff || staff.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {filter === "active" ? "Sem staff cadastrado. Toca em + para começar." : "Sem registos."}
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map((p: any) => {
            const pendingInvite = (p.operacao_staff_invites ?? []).find((i: any) => i.status === "pending");
            const archived = !!p.archived_at;
            return (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded border bg-card">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{initials(p.full_name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{p.full_name || "—"}</p>
                    {pendingInvite && <Badge variant="outline" className="text-[10px]">Convite pendente</Badge>}
                    {archived && <Badge variant="secondary" className="text-[10px]">Arquivado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.phone ?? "sem telefone"}{p.email && !p.email.endsWith("@noemail.local") ? ` · ${p.email}` : ""}
                  </p>
                  {pendingInvite?.sent_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Enviado {new Date(pendingInvite.sent_at).toLocaleDateString("pt-PT")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {pendingInvite && (
                    <Button size="sm" variant="ghost" onClick={() => resend(p.id)} title="Reenviar convite">
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => toggleArchive(p.id, archived)}>
                    {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewStaffDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}

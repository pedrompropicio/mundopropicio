import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FrenteCard, type LastActivity } from "@/components/operacao/FrenteCard";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { Card } from "@/components/ui/card";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPushSupported, getPushPermission } from "@/lib/push-notifications";
import { useMyLeadFrenteIds } from "@/hooks/useMyLeadFrenteIds";

export default function MyFrentes() {
  const { user, hasPermission, isAdmin } = useAuth();
  const canView = isAdmin || hasPermission("view_operacao");
  const { leadFrenteIdSet } = useMyLeadFrenteIds();
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user || !canView) return;
      if (!isPushSupported()) return;
      if (localStorage.getItem("op_push_prompt_dismissed") === "1") return;
      const perm = await getPushPermission();
      if (perm === "granted") {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) return;
      }
      setShowPushPrompt(true);
    })();
  }, [user, canView]);

  const { data: frentes, isLoading } = useQuery({
    queryKey: ["op-my-frentes", user?.id],
    enabled: !!user && canView,
    queryFn: async () => {
      const { data: team } = await supabase
        .from("operacao_frente_team")
        .select("frente_id")
        .eq("profile_id", user!.id)
        .eq("active", true);
      const ids = Array.from(new Set((team ?? []).map((t: any) => t.frente_id)));
      if (ids.length === 0) return [];
      const { data: fr } = await supabase
        .from("operacao_frentes")
        .select("id,name,color,status,current_lead_id,event_id, events(name)")
        .in("id", ids)
        .order("display_order");
      return fr ?? [];
    },
  });

  const frenteIds = useMemo(() => (frentes ?? []).map((f: any) => f.id), [frentes]);

  const { data: counts } = useQuery({
    queryKey: ["op-frentes-counts", frenteIds],
    enabled: frenteIds.length > 0,
    queryFn: async () => {
      const [{ data: etapas }, { data: regs }] = await Promise.all([
        supabase.from("operacao_etapas").select("frente_id,status").in("frente_id", frenteIds),
        supabase.from("operacao_registros").select("frente_id,status,kind").in("frente_id", frenteIds).eq("kind", "chamado"),
      ]);
      const out: Record<string, any> = {};
      for (const id of frenteIds) out[id] = { etapas_pending: 0, etapas_in_progress: 0, etapas_done: 0, chamados_open: 0, chamados_in_progress: 0 };
      (etapas ?? []).forEach((e: any) => {
        if (e.status === "pending") out[e.frente_id].etapas_pending++;
        else if (e.status === "in_progress") out[e.frente_id].etapas_in_progress++;
        else if (e.status === "done") out[e.frente_id].etapas_done++;
      });
      (regs ?? []).forEach((r: any) => {
        if (r.status === "open") out[r.frente_id].chamados_open++;
        else if (r.status === "in_progress") out[r.frente_id].chamados_in_progress++;
      });
      return out;
    },
  });

  // Última atividade (kind != chamado) por frente
  const { data: lastActivityMap } = useQuery({
    queryKey: ["op-frentes-last-activity", frenteIds],
    enabled: frenteIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registros")
        .select("frente_id,kind,text,created_at,author:profiles!operacao_registros_author_profile_id_fkey(full_name)")
        .in("frente_id", frenteIds)
        .neq("kind", "chamado")
        .order("created_at", { ascending: false })
        .limit(100);
      const out: Record<string, LastActivity> = {};
      for (const r of data ?? []) {
        if (!out[(r as any).frente_id]) {
          out[(r as any).frente_id] = {
            kind: (r as any).kind,
            text: (r as any).text,
            created_at: (r as any).created_at,
            author_name: (r as any).author?.full_name ?? null,
          };
        }
      }
      return out;
    },
  });

  if (!canView) return <div className="p-6">Sem permissão.</div>;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      <header className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">Minhas Zonas/Serviços</h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/operacao/atividade" className="hover:text-foreground underline">Atividade</Link>
          <span>·</span>
          <Link to="/operacao/minhas-tarefas" className="hover:text-foreground underline">Minhas tarefas</Link>
          {(isAdmin || hasPermission("manage_operacao_staff")) && (
            <>
              <span>·</span>
              <Link to="/operacao/staff" className="hover:text-foreground underline">Staff</Link>
            </>
          )}
        </div>
      </header>

      {showPushPrompt && (
        <Card className="p-3 flex items-center gap-3 bg-primary/10 border-primary/30">
          <Bell className="h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Ativa as notificações</p>
            <p className="text-muted-foreground text-xs">Receberás avisos de chamados e escalações em tempo real.</p>
          </div>
          <PushNotificationToggle />
          <Button size="icon" variant="ghost" onClick={() => { localStorage.setItem("op_push_prompt_dismissed", "1"); setShowPushPrompt(false); }}>
            <X className="h-4 w-4" />
          </Button>
        </Card>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">A carregar...</div>}
      {frentes && frentes.length === 0 && (
        <Card className="text-center py-12 px-6">
          <div className="text-4xl mb-3">👋</div>
          <h3 className="font-medium mb-2">Ainda não fazes parte de nenhuma frente</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            O coordenador precisa de te adicionar a uma zona ou serviço. Confirma com ele que recebeste a atribuição.
          </p>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            <Button variant="outline" onClick={() => window.location.reload()}>
              🔄 Atualizar
            </Button>
          </div>
        </Card>
      )}
      <div className="space-y-2">
        {(frentes ?? []).map((f: any) => (
          <FrenteCard
            key={f.id}
            frente={f}
            counts={counts?.[f.id] ?? { etapas_pending: 0, etapas_in_progress: 0, etapas_done: 0, chamados_open: 0, chamados_in_progress: 0 }}
            lastActivity={lastActivityMap?.[f.id] ?? null}
            isLead={f.current_lead_id === user?.id}
          />
        ))}
      </div>
    </div>
  );
}

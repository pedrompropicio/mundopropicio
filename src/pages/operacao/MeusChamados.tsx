import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { PriorityBadge } from "@/components/operacao/PriorityBadge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function MeusChamados() {
  const { user } = useAuth();
  const [tab, setTab] = useState("open");

  const { data, isLoading } = useQuery({
    queryKey: ["op-meus-chamados", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: team } = await supabase
        .from("operacao_frente_team").select("frente_id").eq("profile_id", user!.id).eq("active", true);
      const teamFrenteIds = (team ?? []).map((t: any) => t.frente_id);
      const { data: leadFrentes } = await supabase
        .from("operacao_frentes").select("id").eq("current_lead_id", user!.id);
      const leadIds = (leadFrentes ?? []).map((f: any) => f.id);
      const allFrenteIds = Array.from(new Set([...teamFrenteIds, ...leadIds]));

      // chamados in those frentes OR authored by user
      const { data: byFrente } = allFrenteIds.length > 0
        ? await supabase.from("operacao_registros")
            .select("*, frente:operacao_frentes(name,color)")
            .eq("kind", "chamado").in("frente_id", allFrenteIds)
            .order("sla_due_at", { ascending: true })
        : { data: [] };
      const { data: authored } = await supabase
        .from("operacao_registros")
        .select("*, frente:operacao_frentes(name,color)")
        .eq("kind", "chamado").eq("author_profile_id", user!.id);
      const map = new Map<string, any>();
      [...(byFrente ?? []), ...(authored ?? [])].forEach((c: any) => map.set(c.id, c));
      return Array.from(map.values());
    },
  });

  const filtered = useMemo(() => {
    const arr = data ?? [];
    if (tab === "open") return arr.filter((c) => c.status === "open").sort((a, b) => (a.sla_due_at ?? "") > (b.sla_due_at ?? "") ? 1 : -1);
    if (tab === "in_progress") return arr.filter((c) => c.status === "in_progress");
    return arr.filter((c) => c.status === "resolved" || c.status === "closed");
  }, [data, tab]);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Meus Chamados</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="open">Abertos</TabsTrigger>
          <TabsTrigger value="in_progress">Em curso</TabsTrigger>
          <TabsTrigger value="resolved">Resolvidos</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading && <div className="text-sm text-muted-foreground">A carregar...</div>}
      {!isLoading && filtered.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">Sem chamados.</Card>
      )}
      <div className="space-y-2">
        {filtered.map((c: any) => (
          <Link key={c.id} to={`/operacao/chamado/${c.id}`}>
            <Card className="p-3 space-y-1">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={c.priority} />
                <span className="text-xs ml-auto text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
              <p className="text-sm">{c.text}</p>
              <p className="text-xs text-muted-foreground">{c.frente?.name}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

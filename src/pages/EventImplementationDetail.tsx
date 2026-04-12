import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { toast } from "sonner";
import { ImplBPTab } from "@/components/implementation/ImplBPTab";
import { ImplTicketsTab } from "@/components/implementation/ImplTicketsTab";
import { ImplApportionmentTab } from "@/components/implementation/ImplApportionmentTab";

export default function EventImplementationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("bp");

  const { data: impl, isLoading } = useQuery({
    queryKey: ["event-implementation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_implementations")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: event } = useQuery({
    queryKey: ["event-for-impl", impl?.event_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, event_type, parent_event_id, status")
        .eq("id", impl!.event_id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!impl?.event_id,
  });

  // For master events, fetch splits
  const { data: splitEvents = [] } = useQuery({
    queryKey: ["split-events-impl", event?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, event_type, parent_event_id, status")
        .eq("parent_event_id", event!.id)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!event && event.event_type === "master",
  });

  const handleDownloadRef = async () => {
    if (!impl?.reference_file_url) return;
    const { data, error } = await supabase.storage
      .from("implementation-files")
      .createSignedUrl(impl.reference_file_url, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Erro ao gerar link de download");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">A carregar…</div>;
  }

  if (!impl) {
    return <div className="p-6 text-destructive">Implantação não encontrada</div>;
  }

  const allEvents = event ? (event.event_type === "master" ? [event, ...splitEvents] : [event]) : [];
  const isMaster = event?.event_type === "master";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/implantacao")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">
              {event?.name || "Implantação"}
            </h1>
            <Badge variant={impl.status === "in_progress" ? "default" : "secondary"}>
              {impl.status === "in_progress" ? "Em Progresso" : impl.status === "completed" ? "Concluído" : "Pendente"}
            </Badge>
          </div>
          <div className="ml-10 flex items-center gap-4 text-xs text-muted-foreground">
            {event && <span>{format(new Date(event.date), "dd/MM/yyyy")}</span>}
            {isMaster && <span>Turnê ({splitEvents.length} sub-eventos)</span>}
            <span>Atualizado em {format(new Date(impl.updated_at), "dd/MM/yyyy HH:mm", { locale: pt })}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {impl.reference_file_url && (
            <Button variant="outline" size="sm" onClick={handleDownloadRef}>
              <Download className="h-4 w-4 mr-1" /> {impl.reference_file_name || "Ficheiro"}
            </Button>
          )}
        </div>
      </div>

      {/* Instructions banner */}
      {impl.import_instructions && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <span className="font-medium text-primary">Instruções:</span>{" "}
          <span className="text-foreground">{impl.import_instructions}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bp">BP / Despesas</TabsTrigger>
          <TabsTrigger value="tickets">Vendas / Bilhetes</TabsTrigger>
          {isMaster && <TabsTrigger value="apportionment">Análise de Rateio</TabsTrigger>}
        </TabsList>

        <TabsContent value="bp" className="mt-4">
          <ImplBPTab
            implementation={impl}
            event={event}
            allEvents={allEvents}
          />
        </TabsContent>

        <TabsContent value="tickets" className="mt-4">
          <ImplTicketsTab
            implementation={impl}
            event={event}
            allEvents={allEvents}
          />
        </TabsContent>

        {isMaster && (
          <TabsContent value="apportionment" className="mt-4">
            <ImplApportionmentTab
              implementation={impl}
              masterEvent={event!}
              splitEvents={splitEvents}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

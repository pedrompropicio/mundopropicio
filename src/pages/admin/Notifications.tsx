import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

const statusTone: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  rejected: "bg-destructive/15 text-destructive",
  paused: "bg-muted text-muted-foreground",
  disabled: "bg-muted text-muted-foreground",
  queued: "bg-amber-500/15 text-amber-600",
  sending: "bg-blue-500/15 text-blue-600",
  sent: "bg-blue-500/15 text-blue-600",
  delivered: "bg-emerald-500/15 text-emerald-600",
  read: "bg-emerald-700/15 text-emerald-700",
  failed: "bg-destructive/15 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

export default function Notifications() {
  const { role } = useAuth();
  const isAuthorized = role === "admin" || role === ("platform_admin" as any);
  const [tab, setTab] = useState("templates");

  if (!isAuthorized) return <Navigate to="/admin" replace />;

  const templates = useQuery({
    queryKey: ["notification_templates"],
    queryFn: async () => {
      const { data } = await supabase.from("notification_templates").select("*").order("template_name");
      return data ?? [];
    },
  });

  const queue = useQuery({
    queryKey: ["notification_queue_recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_queue")
        .select("id, status, attempts, recipient_phone, sent_at, read_at, created_at, params, template:notification_templates(template_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const optin = useQuery({
    queryKey: ["notification_optin_all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_optin")
        .select("id, phone_number, opted_in_at, opted_out_at, source, profile:profiles(full_name, email)")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  // Métricas 24h
  const last24 = (queue.data ?? []).filter((q: any) => new Date(q.created_at) > new Date(Date.now() - 86400000));
  const sent24 = last24.filter((q: any) => ["sent", "delivered", "read"].includes(q.status)).length;
  const delivered24 = last24.filter((q: any) => ["delivered", "read"].includes(q.status)).length;
  const read24 = last24.filter((q: any) => q.status === "read").length;
  const failed24 = last24.filter((q: any) => q.status === "failed").length;
  const deliveryRate = sent24 ? Math.round((delivered24 / sent24) * 100) : 0;
  const readRate = sent24 ? Math.round((read24 / sent24) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Notificações WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Gestão de templates, fila de envios e opt-ins.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="queue">Fila &amp; Histórico</TabsTrigger>
          <TabsTrigger value="optin">Opt-in</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <Card>
            <CardHeader><CardTitle>Templates Meta ({templates.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {templates.isLoading ? <Loader2 className="animate-spin" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Idioma</TableHead>
                      <TableHead className="text-right">Params</TableHead>
                      <TableHead>Criado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.data?.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.template_name}</TableCell>
                        <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                        <TableCell><Badge className={statusTone[t.status]}>{t.status}</Badge></TableCell>
                        <TableCell>{t.language_code}</TableCell>
                        <TableCell className="text-right">{t.param_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-PT")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Enviados 24h</div><div className="text-2xl font-bold">{sent24}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Taxa entrega</div><div className="text-2xl font-bold">{deliveryRate}%</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Taxa leitura</div><div className="text-2xl font-bold">{readRate}%</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Falhas 24h</div><div className="text-2xl font-bold text-destructive">{failed24}</div></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Últimos 100 envios</CardTitle></CardHeader>
            <CardContent>
              {queue.isLoading ? <Loader2 className="animate-spin" /> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Destinatário</TableHead><TableHead>Template</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Tentat.</TableHead><TableHead>Enviado</TableHead><TableHead>Lido</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {queue.data?.map((q: any) => (
                      <TableRow key={q.id}>
                        <TableCell className="font-mono text-xs">{q.recipient_phone}</TableCell>
                        <TableCell className="text-xs">{q.template?.template_name ?? "—"}</TableCell>
                        <TableCell><Badge className={statusTone[q.status]}>{q.status}</Badge></TableCell>
                        <TableCell className="text-right">{q.attempts}</TableCell>
                        <TableCell className="text-xs">{q.sent_at ? new Date(q.sent_at).toLocaleString("pt-PT") : "—"}</TableCell>
                        <TableCell className="text-xs">{q.read_at ? new Date(q.read_at).toLocaleString("pt-PT") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optin">
          <Card>
            <CardHeader><CardTitle>Opt-ins ({optin.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {optin.isLoading ? <Loader2 className="animate-spin" /> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Utilizador</TableHead><TableHead>Telefone</TableHead><TableHead>Status</TableHead><TableHead>Fonte</TableHead><TableHead>Desde</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {optin.data?.map((o: any) => {
                      const active = o.opted_in_at && !o.opted_out_at;
                      return (
                        <TableRow key={o.id}>
                          <TableCell>{o.profile?.full_name ?? "—"} <span className="text-xs text-muted-foreground">({o.profile?.email})</span></TableCell>
                          <TableCell className="font-mono text-xs">{o.phone_number}</TableCell>
                          <TableCell><Badge className={active ? statusTone.approved : statusTone.disabled}>{active ? "opt-in" : "opt-out"}</Badge></TableCell>
                          <TableCell className="text-xs">{o.source ?? "—"}</TableCell>
                          <TableCell className="text-xs">{o.opted_in_at ? new Date(o.opted_in_at).toLocaleDateString("pt-PT") : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

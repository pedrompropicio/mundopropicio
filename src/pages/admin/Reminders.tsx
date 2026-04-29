import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Bell, Check, Send, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

interface ReminderRow {
  id: string;
  key: string;
  title: string;
  message: string;
  due_date: string;
  frequency: "once" | "daily" | "weekly";
  whatsapp_recipient: string | null;
  twilio_from: string | null;
  link_url: string | null;
  is_active: boolean;
  last_sent_at: string | null;
  send_count: number;
  completed_at: string | null;
}

interface SettingsRow {
  id: number;
  default_whatsapp_recipient: string | null;
  default_twilio_from: string | null;
  daily_send_hour_lisbon: number;
}

export default function Reminders() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAuthorized = role === "admin" || role === ("platform_admin" as any);

  const [recipient, setRecipient] = useState("");
  const [twilioFrom, setTwilioFrom] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["system-reminder-settings"],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_reminder_settings" as any)
        .select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      const row = data as unknown as SettingsRow;
      setRecipient(row?.default_whatsapp_recipient ?? "");
      setTwilioFrom(row?.default_twilio_from ?? "+14155238886");
      return row;
    },
  });

  const { data: reminders, isLoading } = useQuery({
    queryKey: ["system-reminders"],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_reminders" as any)
        .select("*")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ReminderRow[];
    },
  });

  if (!isAuthorized) return <Navigate to="/admin" replace />;

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase.from("system_reminder_settings" as any)
      .update({
        default_whatsapp_recipient: recipient || null,
        default_twilio_from: twilioFrom || null,
      })
      .eq("id", 1);
    setSavingSettings(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Definições guardadas" });
    qc.invalidateQueries({ queryKey: ["system-reminder-settings"] });
  };

  const markComplete = async (r: ReminderRow) => {
    const { error } = await supabase.from("system_reminders" as any)
      .update({
        completed_at: new Date().toISOString(),
        completed_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq("id", r.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lembrete marcado como concluído" });
    qc.invalidateQueries({ queryKey: ["system-reminders"] });
    qc.invalidateQueries({ queryKey: ["system-reminders-active"] });
  };

  const reactivate = async (r: ReminderRow) => {
    const { error } = await supabase.from("system_reminders" as any)
      .update({ completed_at: null, completed_by: null })
      .eq("id", r.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["system-reminders"] });
    qc.invalidateQueries({ queryKey: ["system-reminders-active"] });
  };

  const sendNow = async () => {
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-system-reminders", { body: {} });
      if (error) throw error;
      toast({
        title: "Execução manual concluída",
        description: `Processados: ${(data as any)?.processed?.length ?? 0}. Vê detalhes na consola.`,
      });
      console.log("[send-system-reminders]", data);
      qc.invalidateQueries({ queryKey: ["system-reminders"] });
    } catch (err: any) {
      toast({ title: "Erro a executar", description: err.message, variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" /> Lembretes da Plataforma
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lembretes automáticos enviados por WhatsApp + banner no painel de administração.
          </p>
        </div>
        <Button onClick={sendNow} disabled={sendingTest} variant="outline">
          {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Executar agora
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Definições gerais</CardTitle>
          <CardDescription>
            Destinatário e remetente Twilio usados por defeito. Cada lembrete pode ainda ter o seu próprio destinatário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recipient">WhatsApp destino (default)</Label>
              <Input
                id="recipient"
                placeholder="+351912345678"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Formato E.164 com prefixo internacional. Ex: +351912345678
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">Twilio From</Label>
              <Input
                id="from"
                placeholder="+14155238886"
                value={twilioFrom}
                onChange={(e) => setTwilioFrom(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Default: sandbox Twilio (+14155238886). Requer opt-in prévio do destinatário.
              </p>
            </div>
          </div>
          <Button onClick={saveSettings} disabled={savingSettings}>
            {savingSettings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar definições
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Lembretes</h2>
        {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
        {!isLoading && (reminders ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum lembrete configurado.</p>
        )}
        {(reminders ?? []).map((r) => {
          const overdue = !r.completed_at && r.due_date <= today;
          return (
            <Card key={r.id} className={overdue ? "border-amber-500/50" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {r.title}
                      {r.completed_at ? (
                        <Badge variant="secondary">Concluído</Badge>
                      ) : overdue ? (
                        <Badge className="bg-amber-500 text-white">Pendente</Badge>
                      ) : (
                        <Badge variant="outline">Agendado</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{r.frequency}</Badge>
                    </CardTitle>
                    <CardDescription className="whitespace-pre-line">{r.message}</CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {r.completed_at ? (
                      <Button size="sm" variant="outline" onClick={() => reactivate(r)}>Reativar</Button>
                    ) : (
                      <Button size="sm" onClick={() => markComplete(r)}>
                        <Check className="h-4 w-4 mr-1" /> Concluir
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div>Prevista para: <strong>{format(parseISO(r.due_date), "dd 'de' MMMM 'de' yyyy", { locale: pt })}</strong></div>
                {r.last_sent_at && (
                  <div>Último envio: {format(parseISO(r.last_sent_at), "dd/MM/yyyy HH:mm")} ({r.send_count} envio{r.send_count !== 1 ? "s" : ""})</div>
                )}
                {r.completed_at && (
                  <div className="text-emerald-600">Concluído em {format(parseISO(r.completed_at), "dd/MM/yyyy HH:mm")}</div>
                )}
                {r.link_url && <div>Link: <code className="bg-muted px-1 rounded">{r.link_url}</code></div>}
                {r.whatsapp_recipient && <div>Destinatário próprio: {r.whatsapp_recipient}</div>}
                <div className="text-[10px] opacity-60">key: {r.key}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

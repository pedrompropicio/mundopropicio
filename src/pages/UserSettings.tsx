// Página de preferências pessoais — opt-in WhatsApp do MP Gestão Eventos.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const E164 = /^\+[1-9]\d{6,14}$/;

export default function UserSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: optin, isLoading } = useQuery({
    queryKey: ["my_notification_optin", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("notification_optin")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (optin) {
      setPhone(optin.phone_number || "");
      setOptedIn(!!optin.opted_in_at && !optin.opted_out_at);
    }
  }, [optin]);

  async function save() {
    if (!user?.id) return;
    if (phone && !E164.test(phone)) {
      toast({ title: "Telefone inválido", description: "Usa formato internacional (+351912345678).", variant: "destructive" });
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const payload: any = {
      profile_id: user.id,
      phone_number: phone,
      source: "self_service",
      user_agent: navigator.userAgent,
      updated_at: now,
    };
    if (optedIn) { payload.opted_in_at = now; payload.opted_out_at = null; }
    else { payload.opted_out_at = now; }

    const { error } = await supabase
      .from("notification_optin")
      .upsert(payload, { onConflict: "profile_id" });

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Preferências guardadas" });
      qc.invalidateQueries({ queryKey: ["my_notification_optin"] });
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Preferências</h1>
        <p className="text-sm text-muted-foreground">Configurações da tua conta no MP Gestão Eventos.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notificações WhatsApp</CardTitle>
          <CardDescription>Recebe alertas operacionais sobre eventos, zonas/serviços e etapas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Número WhatsApp</Label>
            <Input
              id="phone"
              placeholder="+351912345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value.trim())}
              disabled={isLoading || saving}
            />
            <p className="text-xs text-muted-foreground">Formato internacional (E.164). Ex.: +351912345678 ou +5511987654321.</p>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="optin"
              checked={optedIn}
              onCheckedChange={(v) => setOptedIn(!!v)}
              disabled={isLoading || saving}
            />
            <label htmlFor="optin" className="text-sm leading-snug cursor-pointer">
              Aceito receber notificações operacionais do MP Gestão Eventos via WhatsApp neste número.
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Podes cancelar a qualquer momento respondendo <b>PARAR</b> no WhatsApp ou desmarcando aqui.
          </p>

          <div>
            <Button onClick={save} disabled={isLoading || saving || !phone}>
              {saving ? "A guardar…" : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

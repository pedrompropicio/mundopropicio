import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCompany } from "@/hooks/useCompany";
import { toSlug } from "../lib/slug";

type Mgmt = "own" | "partner_managed";
type Status = "planning" | "active" | "confirmed" | "completed" | "cancelled" | "archived";

export default function NewEventoPage() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<Status>("planning");
  const [mgmt, setMgmt] = useState<Mgmt>("own");
  const [partnerName, setPartnerName] = useState("");
  const [location, setLocation] = useState("");
  const [slug, setSlug] = useState("");
  const [ticketingUrl, setTicketingUrl] = useState("");
  const [ticketingProvider, setTicketingProvider] = useState("");
  const [portalVisible, setPortalVisible] = useState(true);
  const [portalFeatured, setPortalFeatured] = useState(false);

  const finalSlug = useMemo(() => (slug.trim() ? toSlug(slug) : toSlug(name)), [slug, name]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome é obrigatório.");
      if (!date) throw new Error("Data é obrigatória.");
      const payload: any = {
        company_id: companyId,
        name: name.trim(),
        date,
        status,
        management_type: mgmt,
        partner_name: mgmt === "partner_managed" ? partnerName.trim() || null : null,
        location: location.trim() || null,
        slug: finalSlug || null,
        ticketing_url: ticketingUrl.trim() || null,
        ticketing_provider: ticketingProvider.trim() || null,
        portal_visible: portalVisible,
        portal_featured: portalFeatured,
      };
      const { data, error } = await (supabase as any)
        .from("events")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Evento criado.");
      navigate(`/crm/eventos/${id}`);
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  return (
    <div className="space-y-4 pb-24">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/crm/eventos">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Novo evento próprio</h1>
        <p className="text-sm text-muted-foreground">
          Cria um evento da MP — depois preenches o marketing no editor.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Data *">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Estado">
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Gestão">
            <RadioGroup value={mgmt} onValueChange={(v) => setMgmt(v as Mgmt)} className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="own" id="mgmt-own" />
                <span>Própria (MP gere tudo)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="partner_managed" id="mgmt-partner" />
                <span>Parceria (sócio externo gere)</span>
              </label>
            </RadioGroup>
          </Field>
        </div>

        {mgmt === "partner_managed" && (
          <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <Field label="Nome do parceiro">
              <Input
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="ex.: Pulsetto Productions"
              />
            </Field>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Este evento aparecerá no portal mundopropicio.com mas NÃO em BP/TX/Operação/Audience.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Localização">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Cidade ou venue genérico"
            />
          </Field>
          <Field label="Slug" hint={!slug && name ? `auto: ${finalSlug}` : undefined}>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-gerado se vazio"
            />
          </Field>
          <Field label="Ticketing URL">
            <Input
              type="url"
              value={ticketingUrl}
              onChange={(e) => setTicketingUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Ticketing provider">
            <Input
              value={ticketingProvider}
              onChange={(e) => setTicketingProvider(e.target.value)}
              placeholder="ticketline, bol, fnac, eventbrite, partner-custom…"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={portalVisible} onCheckedChange={setPortalVisible} />
            Visível no portal
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={portalFeatured} onCheckedChange={setPortalFeatured} />
            Destacado na homepage
          </label>
        </div>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:pl-72">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate("/crm/eventos")}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Criar evento
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

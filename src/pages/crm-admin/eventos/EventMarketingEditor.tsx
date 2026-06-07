import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { ImageUploader } from "../components/ImageUploader";
import { MultiImageUploader } from "../components/MultiImageUploader";
import { MP_COMPANY_ID } from "../constants";
import type { EventMarketingRow, EventRow, TicketExperience } from "../types";
import { Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";

type FormState = Omit<
  EventMarketingRow,
  "created_at" | "updated_at" | "created_by" | "updated_by"
>;

const emptyForm = (eventId: string): FormState => ({
  event_id: eventId,
  company_id: MP_COMPANY_ID,
  status: "drafted",
  published_at: null,
  hook_pt: null,
  hook_en: null,
  description_long_pt: null,
  description_long_en: null,
  meta_description_pt: null,
  meta_description_en: null,
  hero_image_url: null,
  og_image_url: null,
  poster_vertical_url: null,
  gallery_urls: [],
  press_quote_pt: null,
  press_quote_en: null,
  press_quote_source: null,
  cta_primary_label_pt: null,
  cta_primary_label_en: null,
  urgency_message_pt: null,
  urgency_message_en: null,
  performer_name: null,
  performer_url: null,
  offer_price_min: null,
  offer_price_max: null,
  offer_currency: "EUR",
  offer_availability: "InStock",
  hero_video_url: null,
  music_embed_url: null,
  ticket_experiences: [],
});

export default function EventMarketingEditor() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const eventQuery = useQuery({
    queryKey: ["crm-event", eventId],
    queryFn: async (): Promise<any> => {
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id, name, slug, status, date, company_id, management_type, partner_name, location, ticketing_url, ticketing_provider, portal_visible, portal_featured")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const mkQuery = useQuery({
    queryKey: ["crm-event-marketing", eventId],
    queryFn: async (): Promise<EventMarketingRow | null> => {
      const { data, error } = await (supabase as any)
        .from("event_marketing")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!eventId) return;
    if (mkQuery.data === undefined) return;
    if (mkQuery.data) {
      const { created_at, updated_at, created_by, updated_by, ...rest } = mkQuery.data;
      setForm({ ...rest, gallery_urls: rest.gallery_urls ?? [], ticket_experiences: (rest.ticket_experiences as TicketExperience[] | null) ?? [] });
    } else {
      setForm(emptyForm(eventId));
    }
  }, [mkQuery.data, eventId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveMutation = useMutation({
    mutationFn: async (next: FormState) => {
      const payload: any = {
        ...next,
        updated_by: user?.id ?? null,
      };
      if (!mkQuery.data) payload.created_by = user?.id ?? null;
      const { error } = await (supabase as any)
        .from("event_marketing")
        .upsert(payload, { onConflict: "event_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marketing guardado.");
      qc.invalidateQueries({ queryKey: ["crm-event-marketing", eventId] });
      qc.invalidateQueries({ queryKey: ["crm-eventos-list"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const togglePublish = () => {
    if (!form) return;
    const next: FormState =
      form.status === "published"
        ? { ...form, status: "drafted" }
        : { ...form, status: "published", published_at: form.published_at ?? new Date().toISOString() };
    setForm(next);
    saveMutation.mutate(next);
  };

  const loading = eventQuery.isLoading || mkQuery.isLoading || !form;

  const headerStatus = useMemo(() => {
    if (!form) return null;
    return form.status === "published" ? (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
        Publicado
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
        Rascunho
      </span>
    );
  }, [form]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…
      </div>
    );
  }
  if (!eventQuery.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/crm/eventos">
            <ArrowLeft className="h-4 w-4" /> Voltar à lista
          </Link>
        </Button>
        <Card className="p-6 text-sm text-muted-foreground">Evento não encontrado.</Card>
      </div>
    );
  }

  const ev = eventQuery.data as any;
  const isForeign = ev && ev.company_id !== MP_COMPANY_ID;
  const isPartnerManaged = ev && ev.management_type === "partner_managed";

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/crm/eventos">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{ev?.name}</h1>
            {isPartnerManaged && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-sm text-amber-600">
                🤝 Parceria{ev.partner_name ? ` com ${ev.partner_name}` : ""} — não entra em BP/TX/Operação/Audience
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Slug ERP: {ev?.slug ?? "—"} · Data: {ev?.date ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {headerStatus}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={togglePublish}
            disabled={saveMutation.isPending || isForeign}
          >
            {form!.status === "published" ? "Despublicar" : "Publicar"}
          </Button>
        </div>
      </div>

      {isForeign && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Este evento pertence a outra empresa e não pode ser editado aqui. Volta à lista e
          abre via tab Endossados.
          <Button asChild variant="outline" size="sm" className="ml-3">
            <Link to="/crm/eventos">Voltar</Link>
          </Button>
        </Card>
      )}

      <Tabs defaultValue={isForeign ? "hero" : "gestao"}>
        <TabsList className="flex w-full flex-wrap h-auto">
          <TabsTrigger value="gestao">Gestão</TabsTrigger>
          <TabsTrigger value="hero">Hero</TabsTrigger>
          <TabsTrigger value="imagens">Média</TabsTrigger>
          <TabsTrigger value="experiencias">Experiências</TabsTrigger>
          <TabsTrigger value="cta">CTA &amp; Urgência</TabsTrigger>
          <TabsTrigger value="imprensa">Imprensa &amp; Performer</TabsTrigger>
          <TabsTrigger value="oferta">Oferta</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="gestao">
          <GestaoTab eventId={eventId} ev={ev} disabled={!!isForeign} />
        </TabsContent>

        <TabsContent value="hero">
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hook (PT)">
                <Textarea
                  value={form!.hook_pt ?? ""}
                  onChange={(e) => set("hook_pt", e.target.value || null)}
                  rows={2}
                />
              </Field>
              <Field label="Hook (EN)">
                <Textarea
                  value={form!.hook_en ?? ""}
                  onChange={(e) => set("hook_en", e.target.value || null)}
                  rows={2}
                />
              </Field>
              <Field label="Descrição longa (PT)">
                <Textarea
                  value={form!.description_long_pt ?? ""}
                  onChange={(e) => set("description_long_pt", e.target.value || null)}
                  rows={8}
                />
              </Field>
              <Field label="Descrição longa (EN)">
                <Textarea
                  value={form!.description_long_en ?? ""}
                  onChange={(e) => set("description_long_en", e.target.value || null)}
                  rows={8}
                />
              </Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="imagens">
          <Card className="space-y-6 p-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <ImageUploader
                label="Hero (16:9)"
                value={form!.hero_image_url}
                onChange={(v) => set("hero_image_url", v)}
                aspectRatio="16/9"
              />
              <ImageUploader
                label="OG image (1.91:1)"
                value={form!.og_image_url}
                onChange={(v) => set("og_image_url", v)}
                aspectRatio="1200/630"
              />
              <ImageUploader
                label="Poster vertical (2:3)"
                value={form!.poster_vertical_url}
                onChange={(v) => set("poster_vertical_url", v)}
                aspectRatio="2/3"
              />
            </div>
            <MultiImageUploader
              label="Galeria"
              value={form!.gallery_urls ?? []}
              onChange={(v) => set("gallery_urls", v)}
              hint="Arrasta para reordenar não disponível — remove e volta a adicionar"
            />
          </Card>
        </TabsContent>

        <TabsContent value="cta">
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="CTA primário (PT)">
                <Input
                  value={form!.cta_primary_label_pt ?? ""}
                  onChange={(e) => set("cta_primary_label_pt", e.target.value || null)}
                />
              </Field>
              <Field label="CTA primário (EN)">
                <Input
                  value={form!.cta_primary_label_en ?? ""}
                  onChange={(e) => set("cta_primary_label_en", e.target.value || null)}
                />
              </Field>
              <Field label="Mensagem de urgência (PT)">
                <Textarea
                  value={form!.urgency_message_pt ?? ""}
                  onChange={(e) => set("urgency_message_pt", e.target.value || null)}
                  rows={2}
                />
              </Field>
              <Field label="Mensagem de urgência (EN)">
                <Textarea
                  value={form!.urgency_message_en ?? ""}
                  onChange={(e) => set("urgency_message_en", e.target.value || null)}
                  rows={2}
                />
              </Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="imprensa">
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Citação de imprensa (PT)">
                <Textarea
                  value={form!.press_quote_pt ?? ""}
                  onChange={(e) => set("press_quote_pt", e.target.value || null)}
                  rows={3}
                />
              </Field>
              <Field label="Citação de imprensa (EN)">
                <Textarea
                  value={form!.press_quote_en ?? ""}
                  onChange={(e) => set("press_quote_en", e.target.value || null)}
                  rows={3}
                />
              </Field>
              <Field label="Fonte da citação">
                <Input
                  value={form!.press_quote_source ?? ""}
                  onChange={(e) => set("press_quote_source", e.target.value || null)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Performer (nome)">
                <Input
                  value={form!.performer_name ?? ""}
                  onChange={(e) => set("performer_name", e.target.value || null)}
                />
              </Field>
              <Field label="Performer (URL)">
                <Input
                  type="url"
                  value={form!.performer_url ?? ""}
                  onChange={(e) => set("performer_url", e.target.value || null)}
                  placeholder="https://…"
                />
              </Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="oferta">
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Preço mínimo">
                <Input
                  type="number"
                  step="0.01"
                  value={form!.offer_price_min ?? ""}
                  onChange={(e) =>
                    set("offer_price_min", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Preço máximo">
                <Input
                  type="number"
                  step="0.01"
                  value={form!.offer_price_max ?? ""}
                  onChange={(e) =>
                    set("offer_price_max", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Moeda">
                <Select
                  value={form!.offer_currency ?? "EUR"}
                  onValueChange={(v) => set("offer_currency", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="BRL">BRL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Disponibilidade">
                <Select
                  value={form!.offer_availability ?? "InStock"}
                  onValueChange={(v) => set("offer_availability", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="InStock">InStock</SelectItem>
                    <SelectItem value="OutOfStock">OutOfStock</SelectItem>
                    <SelectItem value="SoldOut">SoldOut</SelectItem>
                    <SelectItem value="PreOrder">PreOrder</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="seo">
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Meta description (PT)"
                hint={`${(form!.meta_description_pt ?? "").length}/160`}
              >
                <Textarea
                  rows={3}
                  maxLength={200}
                  value={form!.meta_description_pt ?? ""}
                  onChange={(e) => set("meta_description_pt", e.target.value || null)}
                />
              </Field>
              <Field
                label="Meta description (EN)"
                hint={`${(form!.meta_description_en ?? "").length}/160`}
              >
                <Textarea
                  rows={3}
                  maxLength={200}
                  value={form!.meta_description_en ?? ""}
                  onChange={(e) => set("meta_description_en", e.target.value || null)}
                />
              </Field>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:pl-72">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2">
          <Button
            type="button"
            onClick={() => form && saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
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

import { Switch } from "@/components/ui/switch";

function GestaoTab({
  eventId,
  ev,
  disabled,
}: {
  eventId: string;
  ev: any;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const [mgmt, setMgmt] = useState<string>(ev?.management_type ?? "own");
  const [partnerName, setPartnerName] = useState<string>(ev?.partner_name ?? "");
  const [location, setLocation] = useState<string>(ev?.location ?? "");
  const [ticketingUrl, setTicketingUrl] = useState<string>(ev?.ticketing_url ?? "");
  const [ticketingProvider, setTicketingProvider] = useState<string>(ev?.ticketing_provider ?? "");
  const [portalVisible, setPortalVisible] = useState<boolean>(!!ev?.portal_visible);
  const [portalFeatured, setPortalFeatured] = useState<boolean>(!!ev?.portal_featured);

  useEffect(() => {
    setMgmt(ev?.management_type ?? "own");
    setPartnerName(ev?.partner_name ?? "");
    setLocation(ev?.location ?? "");
    setTicketingUrl(ev?.ticketing_url ?? "");
    setTicketingProvider(ev?.ticketing_provider ?? "");
    setPortalVisible(!!ev?.portal_visible);
    setPortalFeatured(!!ev?.portal_featured);
  }, [ev]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("events")
        .update({
          management_type: mgmt,
          partner_name: mgmt === "partner_managed" ? (partnerName.trim() || null) : null,
          location: location.trim() || null,
          ticketing_url: ticketingUrl.trim() || null,
          ticketing_provider: ticketingProvider.trim() || null,
          portal_visible: portalVisible,
          portal_featured: portalFeatured,
        })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gestão guardada.");
      qc.invalidateQueries({ queryKey: ["crm-event", eventId] });
      qc.invalidateQueries({ queryKey: ["crm-eventos-list"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  return (
    <Card className="space-y-4 p-4">
      <Field label="Tipo de gestão">
        <Select value={mgmt} onValueChange={setMgmt} disabled={disabled}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="own">Própria (MP gere tudo)</SelectItem>
            <SelectItem value="partner_managed">Parceria (sócio externo gere)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {mgmt === "partner_managed" && (
        <Field label="Nome do parceiro">
          <Input
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="ex.: Pulsetto Productions"
            disabled={disabled}
          />
        </Field>
      )}

      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
        Mudar para Parceria esconde imediatamente o evento de BP, TX, Operação e Audience.
        Mudar de Parceria para Própria volta a mostrá-lo nesses módulos.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Localização">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} disabled={disabled} />
        </Field>
        <Field label="Ticketing URL">
          <Input type="url" value={ticketingUrl} onChange={(e) => setTicketingUrl(e.target.value)} disabled={disabled} />
        </Field>
        <Field label="Ticketing provider">
          <Input value={ticketingProvider} onChange={(e) => setTicketingProvider(e.target.value)} disabled={disabled} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6 pt-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={portalVisible} onCheckedChange={setPortalVisible} disabled={disabled} />
          Visível no portal
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={portalFeatured} onCheckedChange={setPortalFeatured} disabled={disabled} />
          Destacado na homepage
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={disabled || save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar gestão
        </Button>
      </div>
    </Card>
  );
}

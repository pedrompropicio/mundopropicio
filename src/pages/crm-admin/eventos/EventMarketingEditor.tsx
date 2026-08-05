import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, ExternalLink } from "lucide-react";
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
import { useCompany } from "@/hooks/useCompany";
import type { EventMarketingRow, EventRow, TicketExperience } from "../types";
import { Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { FaqsTab } from "./FaqsTab";
import { LineupTab } from "./LineupTab";
import { MetaAudienceCard } from "./MetaAudienceCard";
import PurchaseAudienceCard from "@/components/crm/PurchaseAudienceCard";
import { MP_COMPANY_ID } from "../constants";
import { CopyTourContentDialog } from "./CopyTourContentDialog";
import { TourCreativesAudit } from "./TourCreativesAudit";


type FormState = Omit<
  EventMarketingRow,
  "created_at" | "updated_at" | "created_by" | "updated_by"
>;

const emptyForm = (eventId: string, companyId: string): FormState => ({
  event_id: eventId,
  company_id: companyId,
  status: "draft",
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
  const { companyId } = useCompany();

  const eventQuery = useQuery({
    queryKey: ["crm-event", eventId],
    queryFn: async (): Promise<any> => {
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id, name, slug, status, date, company_id, management_type, partner_name, location, ticketing_url, ticketing_provider, portal_visible, portal_featured, vip_coupon_code, vip_coupon_discount_label, vip_coupon_valid_until, venue_map_url, venue_directions_url, meta_pixel_id, meta_audience_id, meta_audience_name, ad_destination_url, event_type, parent_event_id")
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

  const parentEventId: string | null = (eventQuery.data as any)?.parent_event_id ?? null;

  const motherQuery = useQuery({
    queryKey: ["crm-event-marketing-mother", parentEventId],
    enabled: !!parentEventId,
    queryFn: async () => {
      const [{ data: mkData }, { data: evData }] = await Promise.all([
        (supabase as any).from("event_marketing").select("*").eq("event_id", parentEventId).maybeSingle(),
        (supabase as any).from("events").select("id, name, slug").eq("id", parentEventId).maybeSingle(),
      ]);
      return { marketing: mkData as EventMarketingRow | null, event: evData as { id: string; name: string; slug: string | null } | null };
    },
  });

  const inherited = motherQuery.data?.marketing ?? null;
  const motherEvent = motherQuery.data?.event ?? null;

  const ph = (val: unknown, fallback = "") => {
    if (val === null || val === undefined || val === "") return fallback;
    const s = String(val);
    return `Herdado: ${s.length > 80 ? s.slice(0, 77) + "…" : s}`;
  };

  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!eventId) return;
    if (mkQuery.data === undefined) return;
    if (mkQuery.data) {
      const { created_at, updated_at, created_by, updated_by, ...rest } = mkQuery.data;
      setForm({ ...rest, gallery_urls: rest.gallery_urls ?? [], ticket_experiences: (rest.ticket_experiences as TicketExperience[] | null) ?? [] });
    } else {
      setForm(emptyForm(eventId, (eventQuery.data as any)?.company_id ?? companyId ?? ""));
    }
  }, [mkQuery.data, eventId, companyId, eventQuery.data]);

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
      if (payload.status !== "draft" && payload.status !== "published") {
        payload.status = "draft";
      }
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
        ? { ...form, status: "draft" }
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
  const isForeign = ev && !!companyId && ev.company_id !== companyId;
  // Modo enxuto: eventos de empresas que não a MP não usam o modelo de página do portal MP
  const isLean = !!ev && ev.company_id !== MP_COMPANY_ID;
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
          <CopyTourContentDialog
            eventId={eventId}
            eventName={ev?.name ?? ""}
            eventDate={ev?.date ?? null}
            parentEventId={ev?.parent_event_id ?? null}
            eventType={ev?.event_type ?? null}
            disabled={isForeign}
          />
          <TourCreativesAudit
            eventId={eventId}
            parentEventId={ev?.parent_event_id ?? null}
            eventType={ev?.event_type ?? null}
          />
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

      {parentEventId && (
        <Card className="border-blue-500/30 bg-blue-500/5 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Conteúdo herdado do tour «<strong>{motherEvent?.name ?? "…"}</strong>». Preenche aqui só o que for diferente desta cidade; o que deixares vazio usa o da mãe.
            </span>
            <Link
              to={`/crm/eventos/${parentEventId}`}
              className="ml-auto inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              Editar a mãe <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      )}

      <Tabs defaultValue={isForeign && !isLean ? "hero" : "gestao"}>
        <TabsList className="flex w-full flex-wrap h-auto">
          <TabsTrigger value="gestao">Gestão</TabsTrigger>
          {!isLean && (
            <>
              <TabsTrigger value="hero">Hero</TabsTrigger>
              <TabsTrigger value="imagens">Média</TabsTrigger>
              <TabsTrigger value="experiencias">Experiências</TabsTrigger>
              <TabsTrigger value="cta">CTA &amp; Urgência</TabsTrigger>
              <TabsTrigger value="imprensa">Imprensa &amp; Performer</TabsTrigger>
              <TabsTrigger value="faq">FAQ</TabsTrigger>
              <TabsTrigger value="lineup">Line-up</TabsTrigger>
              <TabsTrigger value="oferta">Oferta</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="gestao">
          <GestaoTab eventId={eventId} ev={ev} disabled={!!isForeign} lean={isLean} />
        </TabsContent>

        <TabsContent value="hero">
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hook (PT)">
                <Textarea
                  value={form!.hook_pt ?? ""}
                  onChange={(e) => set("hook_pt", e.target.value || null)}
                  rows={2}
                  placeholder={ph(inherited?.hook_pt)}
                />
              </Field>
              <Field label="Hook (EN)">
                <Textarea
                  value={form!.hook_en ?? ""}
                  onChange={(e) => set("hook_en", e.target.value || null)}
                  rows={2}
                  placeholder={ph(inherited?.hook_en)}
                />
              </Field>
              <Field label="Descrição longa (PT)">
                <Textarea
                  value={form!.description_long_pt ?? ""}
                  onChange={(e) => set("description_long_pt", e.target.value || null)}
                  rows={8}
                  placeholder={ph(inherited?.description_long_pt)}
                />
              </Field>
              <Field label="Descrição longa (EN)">
                <Textarea
                  value={form!.description_long_en ?? ""}
                  onChange={(e) => set("description_long_en", e.target.value || null)}
                  rows={8}
                  placeholder={ph(inherited?.description_long_en)}
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
                hint={!form!.hero_image_url && inherited?.hero_image_url ? "Herdado da mãe" : undefined}
              />
              <ImageUploader
                label="OG image (1.91:1)"
                value={form!.og_image_url}
                onChange={(v) => set("og_image_url", v)}
                aspectRatio="1200/630"
                hint={!form!.og_image_url && inherited?.og_image_url ? "Herdado da mãe" : undefined}
              />
              <ImageUploader
                label="Poster vertical (2:3)"
                value={form!.poster_vertical_url}
                onChange={(v) => set("poster_vertical_url", v)}
                aspectRatio="2/3"
                hint={!form!.poster_vertical_url && inherited?.poster_vertical_url ? "Herdado da mãe" : undefined}
              />
            </div>
            <MultiImageUploader
              label="Galeria"
              value={form!.gallery_urls ?? []}
              onChange={(v) => set("gallery_urls", v)}
              hint={
                (form!.gallery_urls ?? []).length === 0 && (inherited?.gallery_urls ?? []).length > 0
                  ? `Herdado da mãe: ${(inherited?.gallery_urls ?? []).length} imagem(ns)`
                  : "Arrasta para reordenar não disponível — remove e volta a adicionar"
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 border-t border-border pt-4">
              <Field label="Vídeo / Trailer (URL)" hint="YouTube ou Vimeo · opcional">
                <Input
                  type="url"
                  value={form!.hero_video_url ?? ""}
                  onChange={(e) => set("hero_video_url", e.target.value || null)}
                  placeholder={ph(inherited?.hero_video_url, "https://youtu.be/… ou https://vimeo.com/…")}
                />
              </Field>
              <Field label="Música (Spotify ou YouTube)" hint="Link de partilha do artista/álbum/playlist · opcional">
                <Input
                  type="url"
                  value={form!.music_embed_url ?? ""}
                  onChange={(e) => set("music_embed_url", e.target.value || null)}
                  placeholder="https://open.spotify.com/… ou https://youtube.com/…"
                />
              </Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="experiencias">
          <Card className="space-y-4 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Experiências de bilhete</h3>
              <p className="text-xs text-muted-foreground">
                Conteúdo de marketing curado — o que cada tipo de bilhete inclui (ex.: "VIP — Acesso antecipado e meet &amp; greet"). <strong>Não leva preço</strong>: o preço vive na bilheteira.
              </p>
            </div>
            <TicketExperiencesEditor
              value={form!.ticket_experiences ?? []}
              onChange={(v) => set("ticket_experiences", v)}
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
                  placeholder={ph(inherited?.cta_primary_label_pt)}
                />
              </Field>
              <Field label="CTA primário (EN)">
                <Input
                  value={form!.cta_primary_label_en ?? ""}
                  onChange={(e) => set("cta_primary_label_en", e.target.value || null)}
                  placeholder={ph(inherited?.cta_primary_label_en)}
                />
              </Field>
              <Field label="Mensagem de urgência (PT)">
                <Textarea
                  value={form!.urgency_message_pt ?? ""}
                  onChange={(e) => set("urgency_message_pt", e.target.value || null)}
                  rows={2}
                  placeholder={ph(inherited?.urgency_message_pt)}
                />
              </Field>
              <Field label="Mensagem de urgência (EN)">
                <Textarea
                  value={form!.urgency_message_en ?? ""}
                  onChange={(e) => set("urgency_message_en", e.target.value || null)}
                  rows={2}
                  placeholder={ph(inherited?.urgency_message_en)}
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
                  placeholder={ph(inherited?.press_quote_pt)}
                />
              </Field>
              <Field label="Citação de imprensa (EN)">
                <Textarea
                  value={form!.press_quote_en ?? ""}
                  onChange={(e) => set("press_quote_en", e.target.value || null)}
                  rows={3}
                  placeholder={ph(inherited?.press_quote_en)}
                />
              </Field>
              <Field label="Fonte da citação">
                <Input
                  value={form!.press_quote_source ?? ""}
                  onChange={(e) => set("press_quote_source", e.target.value || null)}
                  placeholder={ph(inherited?.press_quote_source)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Performer (nome)">
                <Input
                  value={form!.performer_name ?? ""}
                  onChange={(e) => set("performer_name", e.target.value || null)}
                  placeholder={ph(inherited?.performer_name)}
                />
              </Field>
              <Field label="Performer (URL)">
                <Input
                  type="url"
                  value={form!.performer_url ?? ""}
                  onChange={(e) => set("performer_url", e.target.value || null)}
                  placeholder={ph(inherited?.performer_url, "https://…")}
                />
              </Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="faq">
          <FaqsTab eventId={eventId} companyId={ev.company_id} disabled={!!isForeign} />
        </TabsContent>

        <TabsContent value="lineup">
          <LineupTab eventId={eventId} companyId={ev.company_id} disabled={!!isForeign} />
        </TabsContent>

        <TabsContent value="oferta">
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Preço mínimo" hint={inherited?.offer_price_min != null && form!.offer_price_min == null ? `Herdado: ${inherited.offer_price_min}` : undefined}>
                <Input
                  type="number"
                  step="0.01"
                  value={form!.offer_price_min ?? ""}
                  onChange={(e) =>
                    set("offer_price_min", e.target.value === "" ? null : Number(e.target.value))
                  }
                  placeholder={inherited?.offer_price_min != null ? String(inherited.offer_price_min) : ""}
                />
              </Field>
              <Field label="Preço máximo" hint={inherited?.offer_price_max != null && form!.offer_price_max == null ? `Herdado: ${inherited.offer_price_max}` : undefined}>
                <Input
                  type="number"
                  step="0.01"
                  value={form!.offer_price_max ?? ""}
                  onChange={(e) =>
                    set("offer_price_max", e.target.value === "" ? null : Number(e.target.value))
                  }
                  placeholder={inherited?.offer_price_max != null ? String(inherited.offer_price_max) : ""}
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
                  placeholder={ph(inherited?.meta_description_pt)}
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
                  placeholder={ph(inherited?.meta_description_en)}
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

function TicketExperiencesEditor({
  value,
  onChange,
}: {
  value: TicketExperience[];
  onChange: (next: TicketExperience[]) => void;
}) {
  const update = (idx: number, patch: Partial<TicketExperience>) => {
    onChange(value.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const add = () =>
    onChange([...value, { title_pt: "", title_en: "", description_pt: "", description_en: "" }]);

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Sem experiências. Adiciona a primeira abaixo.
        </p>
      )}
      {value.map((it, idx) => (
        <div key={idx} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">#{idx + 1}</span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Mover para cima">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => move(idx, 1)} disabled={idx === value.length - 1} aria-label="Mover para baixo">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)} aria-label="Remover">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título (PT)">
              <Input value={it.title_pt} onChange={(e) => update(idx, { title_pt: e.target.value })} placeholder="ex.: VIP" />
            </Field>
            <Field label="Title (EN)">
              <Input value={it.title_en} onChange={(e) => update(idx, { title_en: e.target.value })} placeholder="e.g.: VIP" />
            </Field>
            <Field label="Descrição (PT)">
              <Textarea rows={3} value={it.description_pt} onChange={(e) => update(idx, { description_pt: e.target.value })} placeholder="O que inclui — sem preço" />
            </Field>
            <Field label="Description (EN)">
              <Textarea rows={3} value={it.description_en} onChange={(e) => update(idx, { description_en: e.target.value })} placeholder="What it includes — no price" />
            </Field>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" /> Adicionar experiência
      </Button>
    </div>
  );
}

import { Switch } from "@/components/ui/switch";

function GestaoTab({
  eventId,
  ev,
  disabled,
  lean = false,
}: {
  eventId: string;
  ev: any;
  disabled: boolean;
  lean?: boolean;
}) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const [mgmt, setMgmt] = useState<string>(ev?.management_type ?? "own");
  const [partnerName, setPartnerName] = useState<string>(ev?.partner_name ?? "");
  const [location, setLocation] = useState<string>(ev?.location ?? "");
  const [ticketingUrl, setTicketingUrl] = useState<string>(ev?.ticketing_url ?? "");
  const [adDestinationUrl, setAdDestinationUrl] = useState<string>(ev?.ad_destination_url ?? "");
  const [ticketingProvider, setTicketingProvider] = useState<string>(ev?.ticketing_provider ?? "");
  const [portalVisible, setPortalVisible] = useState<boolean>(!!ev?.portal_visible);
  const [portalFeatured, setPortalFeatured] = useState<boolean>(!!ev?.portal_featured);
  const [vipCode, setVipCode] = useState<string>(ev?.vip_coupon_code ?? "");
  const [vipLabel, setVipLabel] = useState<string>(ev?.vip_coupon_discount_label ?? "");
  const [venueMapUrl, setVenueMapUrl] = useState<string>(ev?.venue_map_url ?? "");
  const [venueDirectionsUrl, setVenueDirectionsUrl] = useState<string>(ev?.venue_directions_url ?? "");
  // Guardamos como YYYY-MM-DD (input date). Convertemos para timestamptz no save.
  const [vipValidUntil, setVipValidUntil] = useState<string>(
    ev?.vip_coupon_valid_until ? String(ev.vip_coupon_valid_until).slice(0, 10) : "",
  );

  useEffect(() => {
    setMgmt(ev?.management_type ?? "own");
    setPartnerName(ev?.partner_name ?? "");
    setLocation(ev?.location ?? "");
    setTicketingUrl(ev?.ticketing_url ?? "");
    setAdDestinationUrl(ev?.ad_destination_url ?? "");
    setTicketingProvider(ev?.ticketing_provider ?? "");
    setPortalVisible(!!ev?.portal_visible);
    setPortalFeatured(!!ev?.portal_featured);
    setVipCode(ev?.vip_coupon_code ?? "");
    setVipLabel(ev?.vip_coupon_discount_label ?? "");
    setVipValidUntil(
      ev?.vip_coupon_valid_until ? String(ev.vip_coupon_valid_until).slice(0, 10) : "",
    );
    setVenueMapUrl(ev?.venue_map_url ?? "");
    setVenueDirectionsUrl(ev?.venue_directions_url ?? "");
  }, [ev]);

  // Pré-preenche validade com hoje+7 quando o utilizador começa a preencher o código
  // (apenas se ainda não há validade definida).
  const onVipCodeChange = (v: string) => {
    setVipCode(v);
    if (v.trim() && !vipValidUntil) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setVipValidUntil(d.toISOString().slice(0, 10));
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("events")
        .update({
          management_type: mgmt,
          partner_name: mgmt === "partner_managed" ? (partnerName.trim() || null) : null,
          location: location.trim() || null,
          ticketing_url: ticketingUrl.trim() || null,
          ad_destination_url: adDestinationUrl.trim() || null,
          ticketing_provider: ticketingProvider.trim() || null,
          // portal_visible é gerido pelo toggle via RPC publish/unpublish_event_to_portal
          portal_featured: portalFeatured,
          vip_coupon_code: vipCode.trim() || null,
          vip_coupon_discount_label: vipLabel.trim() || null,
          vip_coupon_valid_until: vipValidUntil ? `${vipValidUntil}T23:59:59Z` : null,
          venue_map_url: venueMapUrl.trim() || null,
          venue_directions_url: venueDirectionsUrl.trim() || null,
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

  const publishToggle = useMutation({
    mutationFn: async (nextVisible: boolean) => {
      const rpcName = nextVisible ? "publish_event_to_portal" : "unpublish_event_from_portal";
      const { data, error } = await (supabase as any).rpc(rpcName, { p_event_id: eventId });
      if (error) throw error;
      return { nextVisible, rows: (data ?? []) as Array<{ id: string; name: string; slug?: string | null; portal_visible: boolean }> };
    },
    onSuccess: ({ nextVisible, rows }) => {
      const root = rows.find((r) => r.id === eventId) ?? rows[0];
      const childCount = Math.max(0, rows.length - 1);
      const isTour = ev?.event_type === "multi_day";
      if (nextVisible) {
        const slug = root?.slug ?? ev?.slug ?? null;
        const url = slug ? `https://www.mundopropicio.com/pt/eventos/${slug}` : null;
        toast.success(
          isTour && childCount > 0
            ? `Publicado no portal (+${childCount} cidade${childCount === 1 ? "" : "s"}).`
            : "Publicado no portal.",
          url
            ? {
                description: url,
                action: {
                  label: "Abrir",
                  onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
                },
              }
            : undefined,
        );
      } else {
        toast.success(
          isTour && childCount > 0
            ? `Despublicado do portal (+${childCount} cidade${childCount === 1 ? "" : "s"}).`
            : "Despublicado do portal.",
        );
      }
      setPortalVisible(nextVisible);
      qc.invalidateQueries({ queryKey: ["crm-event", eventId] });
      qc.invalidateQueries({ queryKey: ["crm-event-marketing", eventId] });
      qc.invalidateQueries({ queryKey: ["crm-eventos-list"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  return (
    <Card className="space-y-4 p-4">
      {!lean && (
        <MetaAudienceCard
          eventId={eventId}
          eventName={ev?.name ?? ""}
          companyId={ev?.company_id ?? companyId ?? ""}
          metaPixelId={ev?.meta_pixel_id ?? null}
          metaAudienceId={ev?.meta_audience_id ?? null}
          metaAudienceName={ev?.meta_audience_name ?? null}
          disabled={disabled}
        />
      )}

      {!lean && (
        <PurchaseAudienceCard
          eventId={eventId}
          companyId={ev?.company_id ?? companyId ?? ""}
          metaPixelId={ev?.meta_pixel_id ?? null}
          variant="card"
        />
      )}

      {!lean && (
        <>
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
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Localização">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} disabled={disabled} />
        </Field>
        <Field label="Ticketing URL">
          <Input type="url" value={ticketingUrl} onChange={(e) => setTicketingUrl(e.target.value)} disabled={disabled} />
        </Field>
        {!lean && (
          <Field label="Ticketing provider">
            <Input value={ticketingProvider} onChange={(e) => setTicketingProvider(e.target.value)} disabled={disabled} />
          </Field>
        )}
        {!lean && (
          <Field label="Link de destino do anúncio (portal)">
            <Input
              type="url"
              value={adDestinationUrl}
              onChange={(e) => setAdDestinationUrl(e.target.value)}
              disabled={disabled}
              placeholder="https://www.mundopropicio.com/pt/eventos/<slug>"
            />
            <p className="text-xs text-muted-foreground">
              Para onde o anúncio leva o utilizador (página do portal com o pixel). Se vazio, usa o Ticketing URL.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-fit"
              disabled={disabled || !ev?.slug}
              onClick={() => setAdDestinationUrl(`https://www.mundopropicio.com/pt/eventos/${ev?.slug}`)}
            >
              Preencher a partir do slug
            </Button>
            {!ev?.slug && (
              <p className="text-xs text-muted-foreground">Evento sem slug.</p>
            )}
          </Field>
        )}
      </div>


      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Local &amp; Direções</h3>
          <p className="text-xs text-muted-foreground">
            Cole aqui os links do Google Maps (localização e direções). Ambos opcionais.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Link do mapa">
            <Input
              type="url"
              value={venueMapUrl}
              onChange={(e) => setVenueMapUrl(e.target.value)}
              placeholder="https://maps.google.com/…"
              disabled={disabled}
            />
          </Field>
          <Field label="Link de direções / como chegar">
            <Input
              type="url"
              value={venueDirectionsUrl}
              onChange={(e) => setVenueDirectionsUrl(e.target.value)}
              placeholder="https://maps.app.goo.gl/…"
              disabled={disabled}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch
              checked={portalVisible}
              onCheckedChange={(v) => publishToggle.mutate(v)}
              disabled={disabled || publishToggle.isPending}
            />
            Visível no portal
          </label>
          {publishToggle.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {portalVisible && ev?.slug && (
            <a
              href={`https://www.mundopropicio.com/pt/eventos/${ev.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
            >
              Ver no portal <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Ligar/desligar aplica-se imediatamente via RPC. Em turnês (multi_day) faz cascata para as cidades-filhas.
          O slug é gerado automaticamente se estiver vazio; nunca é sobrescrito.
        </p>
        <label className="flex items-center gap-2 text-sm pt-1">
          <Switch checked={portalFeatured} onCheckedChange={setPortalFeatured} disabled={disabled} />
          Destacado na homepage
        </label>
      </div>


      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Cupão VIP</h3>
          <p className="text-xs text-muted-foreground">
            Cupão específico deste evento. Se preenchido, tem precedência sobre o cupão VIP global do portal.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Código">
            <Input
              value={vipCode}
              onChange={(e) => onVipCodeChange(e.target.value)}
              placeholder="ex.: VIP-ANITTA"
              disabled={disabled}
            />
          </Field>
          <Field label="Label de desconto" hint="ex.: 5%, 10€">
            <Input
              value={vipLabel}
              onChange={(e) => setVipLabel(e.target.value)}
              placeholder="ex.: 5%"
              disabled={disabled}
            />
          </Field>
          <Field label="Validade" hint="Por defeito: hoje + 7 dias">
            <Input
              type="date"
              value={vipValidUntil}
              onChange={(e) => setVipValidUntil(e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
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

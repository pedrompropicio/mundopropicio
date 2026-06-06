import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImageUploader } from "../components/ImageUploader";
import { MP_COMPANY_ID } from "../constants";

export default function EndorsementEditor() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["crm-endorsement", eventId, MP_COMPANY_ID],
    queryFn: async () => {
      const { data: end, error } = await (supabase as any)
        .from("event_portal_endorsements")
        .select("*")
        .eq("event_id", eventId)
        .eq("portal_company_id", MP_COMPANY_ID)
        .maybeSingle();
      if (error) throw error;
      if (!end) return null;
      const { data: ev } = await (supabase as any)
        .from("events")
        .select("id, name, date, status, company_id, hero_image_url, location, description_pt")
        .eq("id", eventId)
        .maybeSingle();
      let company = null;
      if (ev?.company_id) {
        const { data: c } = await (supabase as any)
          .from("companies")
          .select("id, display_name, legal_name")
          .eq("id", ev.company_id)
          .maybeSingle();
        company = c;
      }
      return { endorsement: end, event: ev, company };
    },
    enabled: !!eventId,
  });

  const [partnerLabel, setPartnerLabel] = useState("");
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [featured, setFeatured] = useState(false);
  const [overrideHero, setOverrideHero] = useState<string | null>(null);

  useEffect(() => {
    if (data?.endorsement) {
      setPartnerLabel(data.endorsement.partner_label ?? "");
      setDisplayOrder(data.endorsement.display_order ?? 0);
      setFeatured(!!data.endorsement.featured);
      setOverrideHero(data.endorsement.override_hero_image_url ?? null);
    }
  }, [data?.endorsement]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("event_portal_endorsements")
        .update({
          partner_label: partnerLabel.trim() || null,
          display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
          featured,
          override_hero_image_url: overrideHero,
        })
        .eq("event_id", eventId)
        .eq("portal_company_id", MP_COMPANY_ID);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Endosso actualizado.");
      qc.invalidateQueries({ queryKey: ["crm-eventos-endorsements"] });
      qc.invalidateQueries({ queryKey: ["crm-endorsement", eventId] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("event_portal_endorsements")
        .delete()
        .eq("event_id", eventId)
        .eq("portal_company_id", MP_COMPANY_ID);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Endosso removido.");
      qc.invalidateQueries({ queryKey: ["crm-eventos-endorsements"] });
      navigate("/crm/eventos");
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…
      </div>
    );
  }
  if (!data || !data.endorsement) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/crm/eventos"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
        <Card className="p-6 text-sm text-muted-foreground">Endosso não encontrado.</Card>
      </div>
    );
  }

  const companyName = data.company?.display_name ?? data.company?.legal_name ?? "outra empresa";

  return (
    <div className="space-y-4 pb-24">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/crm/eventos"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">{data.event?.name}</h1>
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
            Endossado
          </span>
        </div>
      </div>

      {/* Preview read-only */}
      <Card className="space-y-2 p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Evento original (read-only)</p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Empresa dona:</span> {companyName}</div>
          <div><span className="text-muted-foreground">Data:</span> {data.event?.date ?? "—"}</div>
          <div><span className="text-muted-foreground">Local:</span> {data.event?.location ?? "—"}</div>
          <div><span className="text-muted-foreground">Estado:</span> {data.event?.status ?? "—"}</div>
        </div>
        {data.event?.hero_image_url && (
          <img src={data.event.hero_image_url} alt="" className="mt-2 max-h-40 w-full rounded object-cover" />
        )}
        {data.event?.description_pt && (
          <p className="text-xs text-muted-foreground line-clamp-3">{data.event.description_pt}</p>
        )}
        <p className="text-xs text-muted-foreground italic">
          Este evento pertence a {companyName} e só pode ser editado por essa empresa.
        </p>
      </Card>

      {/* Form */}
      <Card className="space-y-4 p-4">
        <Field label="Partner label">
          <Input
            value={partnerLabel}
            onChange={(e) => setPartnerLabel(e.target.value)}
            placeholder="ex.: Co-promoção com Cloudscape"
          />
        </Field>
        <Field label="Ordem de exibição">
          <Input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={featured} onCheckedChange={setFeatured} />
          Destacar na homepage
        </label>
        <ImageUploader
          label="Hero override (opcional)"
          value={overrideHero}
          onChange={setOverrideHero}
          aspectRatio="16/9"
        />
      </Card>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:pl-72">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4" /> Remover endosso
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover endosso?</AlertDialogTitle>
                <AlertDialogDescription>
                  O evento deixará de aparecer no portal mundopropicio.com. O evento original
                  não é afectado.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar alterações
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

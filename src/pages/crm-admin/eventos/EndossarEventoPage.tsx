import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Search, Check } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { ImageUploader } from "../components/ImageUploader";
import { MP_COMPANY_ID } from "../constants";

type EndorsableEvent = {
  id: string;
  name: string;
  date: string | null;
  status: string | null;
  company_id: string;
  hero_image_url: string | null;
  company_display_name: string | null;
  company_legal_name: string | null;
};

type EndorsableCompany = {
  id: string;
  display_name: string | null;
  legal_name: string | null;
};

export default function EndossarEventoPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [hidePast, setHidePast] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [partnerLabel, setPartnerLabel] = useState("");
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [featured, setFeatured] = useState(false);
  const [overrideHero, setOverrideHero] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: companies } = useQuery({
    queryKey: ["crm-endossar-companies", MP_COMPANY_ID],
    queryFn: async (): Promise<EndorsableCompany[]> => {
      const { data, error } = await (supabase as any).rpc("list_endorsable_companies", {
        p_portal_company_id: MP_COMPANY_ID,
      });
      if (error) throw error;
      return (data ?? []) as EndorsableCompany[];
    },
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["crm-endossar-events", MP_COMPANY_ID, debouncedSearch, companyFilter, hidePast],
    queryFn: async (): Promise<EndorsableEvent[]> => {
      const { data, error } = await (supabase as any).rpc("list_endorsable_events", {
        p_portal_company_id: MP_COMPANY_ID,
        p_search: debouncedSearch || null,
        p_company_filter: companyFilter === "all" ? null : companyFilter,
        p_hide_past: hidePast,
        p_limit: 500,
      });
      if (error) throw error;
      return (data ?? []) as EndorsableEvent[];
    },
  });

  const selected = useMemo(
    () => (events ?? []).find((e) => e.id === selectedId) ?? null,
    [events, selectedId]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Selecciona um evento.");
      const payload: any = {
        event_id: selectedId,
        portal_company_id: MP_COMPANY_ID,
        partner_label: partnerLabel.trim() || null,
        display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
        featured,
        override_hero_image_url: overrideHero,
        added_by: user?.id ?? null,
      };
      const { error } = await (supabase as any).from("event_portal_endorsements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento endossado.");
      qc.invalidateQueries({ queryKey: ["crm-eventos-endorsements"] });
      navigate("/crm/eventos");
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
        <h1 className="text-2xl font-bold text-foreground">Endossar evento</h1>
        <p className="text-sm text-muted-foreground">
          Escolhe um evento de outra empresa para aparecer no portal mundopropicio.com.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Picker */}
        <Card className="space-y-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar evento…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {(companies ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.display_name ?? c.legal_name ?? c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={hidePast} onCheckedChange={setHidePast} />
            Ocultar passados
          </label>

          <div className="max-h-[500px] space-y-1 overflow-y-auto">
            {isLoading && <p className="p-4 text-sm text-muted-foreground">A carregar…</p>}
            {!isLoading && (events ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Sem eventos disponíveis.</p>
            )}
            {(events ?? []).map((e) => {
              const isActive = e.id === selectedId;
              const companyName = e.company_display_name ?? e.company_legal_name ?? "—";
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {companyName} · {e.date ?? "—"}
                    </p>
                  </div>
                  {isActive && <Check className="h-4 w-4 text-emerald-500" />}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Form */}
        <Card className="space-y-4 p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Selecciona um evento à esquerda.</p>
          ) : (
            <>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selected.company_display_name ?? selected.company_legal_name ?? "—")} · {selected.date ?? "—"}
                </p>
                {selected.hero_image_url && (
                  <img
                    src={selected.hero_image_url}
                    alt=""
                    className="mt-2 max-h-32 w-full rounded object-cover"
                  />
                )}
              </div>

              <Field label="Partner label" hint="aparece como subtítulo no portal">
                <Input
                  value={partnerLabel}
                  onChange={(e) => setPartnerLabel(e.target.value)}
                  placeholder="ex.: Co-promoção com Cloudscape"
                />
              </Field>

              <Field label="Ordem de exibição" hint="números mais baixos aparecem primeiro">
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
                hint="só se quiseres uma imagem diferente da original"
              />
            </>
          )}
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:pl-72">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate("/crm/eventos")}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!selectedId || saveMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Endossar evento
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

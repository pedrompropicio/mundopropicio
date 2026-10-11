// D-ERP248 — Cartão "Trackers" do evento: pixel Meta, conversão Google e pixel TikTok
// (public.event_trackers), mais a ligação manual das campanhas TikTok ao evento.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackerRowsToForm, type TrackerPlatform } from "@/lib/crm/event-trackers";

interface Props {
  eventId: string;
  disabled?: boolean;
}

const FIELDS: Array<{ platform: TrackerPlatform; label: string; hint: string }> = [
  { platform: "meta", label: "Pixel Meta", hint: "ID do pixel (também usado pela CAPI do portal)" },
  { platform: "google", label: "Conversão Google", hint: "ID da ação de conversão (AW-…/label)" },
  { platform: "tiktok", label: "Pixel TikTok", hint: "pixel_code" },
];

export function EventTrackersCard({ eventId, disabled }: Props) {
  const qc = useQueryClient();
  const db = supabase as any;
  const [form, setForm] = useState<Record<TrackerPlatform, string>>({ meta: "", google: "", tiktok: "" });

  const trackers = useQuery({
    queryKey: ["event-trackers", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await db.from("event_trackers").select("id, platform, tracker_id, updated_at").eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; platform: TrackerPlatform; tracker_id: string; updated_at: string }>;
    },
  });
  useEffect(() => { if (trackers.data) setForm(trackerRowsToForm(trackers.data)); }, [trackers.data]);

  const tiktok = useQuery({
    queryKey: ["tiktok-linkable-campaigns"],
    queryFn: async () => {
      const { data, error } = await db.rpc("tiktok_linkable_campaigns");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; status: string | null; linked_event_id: string | null }>;
    },
  });

  const save = useMutation({
    mutationFn: async (platform: TrackerPlatform) => {
      const value = form[platform].trim();
      if (platform === "meta") {
        // events.meta_pixel_id continua a ser a coluna lida pelo portal; o trigger espelha em event_trackers.
        const { error } = await db.from("events").update({ meta_pixel_id: value || null }).eq("id", eventId);
        if (error) throw error;
        return;
      }
      const { error: de } = await db.from("event_trackers").delete().eq("event_id", eventId).eq("platform", platform);
      if (de) throw de;
      if (value) {
        const { error } = await db.from("event_trackers").insert({ event_id: eventId, platform, tracker_id: value });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Tracker gravado."); qc.invalidateQueries({ queryKey: ["event-trackers", eventId] }); qc.invalidateQueries({ queryKey: ["crm-event", eventId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const link = useMutation({
    mutationFn: async (v: { campaignId: string; eventId: string | null }) => {
      const { error } = await db.rpc("tiktok_set_campaign_event", { p_campaign_id: v.campaignId, p_event_id: v.eventId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campanha TikTok atualizada."); qc.invalidateQueries({ queryKey: ["tiktok-linkable-campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const camps = tiktok.data ?? [];
  const mine = camps.filter((c) => c.linked_event_id === eventId);
  const free = camps.filter((c) => !c.linked_event_id);

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="text-sm font-semibold">Trackers</div>
      {FIELDS.map((f) => (
        <div key={f.platform} className="grid gap-1">
          <Label className="text-xs">{f.label}</Label>
          <div className="flex gap-2">
            <Input
              value={form[f.platform]}
              placeholder={f.hint}
              disabled={disabled}
              onChange={(e) => setForm((s) => ({ ...s, [f.platform]: e.target.value }))}
            />
            <Button type="button" size="sm" variant="outline" disabled={disabled || save.isPending} onClick={() => save.mutate(f.platform)}>
              Gravar
            </Button>
          </div>
        </div>
      ))}

      <div className="pt-2 text-sm font-semibold">Campanhas TikTok deste evento</div>
      {mine.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma campanha TikTok ligada.</p>}
      {mine.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{c.name}</span>
          <Button type="button" size="sm" variant="ghost" disabled={disabled || link.isPending} onClick={() => link.mutate({ campaignId: c.id, eventId: null })}>
            Desligar
          </Button>
        </div>
      ))}
      {free.length > 0 && (
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
          disabled={disabled || link.isPending}
          value=""
          onChange={(e) => e.target.value && link.mutate({ campaignId: e.target.value, eventId })}
        >
          <option value="">Ligar campanha TikTok sem evento…</option>
          {free.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.status ? ` (${c.status})` : ""}</option>
          ))}
        </select>
      )}
    </div>
  );
}

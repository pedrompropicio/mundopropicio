import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface LineupRow {
  id: string;
  company_id: string;
  event_id: string;
  artist_name: string;
  artist_image_url: string | null;
  artist_bio_pt: string | null;
  artist_bio_en: string | null;
  stage: string | null;
  performance_date: string | null;
  performance_time: string | null;
  display_order: number | null;
}

type Draft = {
  artist_name: string;
  artist_image_url: string;
  artist_bio_pt: string;
  artist_bio_en: string;
  stage: string;
  performance_date: string;
  performance_time: string;
  display_order: number;
};

const emptyDraft = (order: number): Draft => ({
  artist_name: "",
  artist_image_url: "",
  artist_bio_pt: "",
  artist_bio_en: "",
  stage: "",
  performance_date: "",
  performance_time: "",
  display_order: order,
});

export function LineupTab({
  eventId,
  companyId,
  disabled,
}: {
  eventId: string;
  companyId: string;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const queryKey = ["crm-event-lineup", eventId];

  const q = useQuery({
    queryKey,
    queryFn: async (): Promise<LineupRow[]> => {
      const { data, error } = await (supabase as any)
        .from("event_lineups")
        .select("*")
        .eq("event_id", eventId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });

  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft(0));
  const [editing, setEditing] = useState<Record<string, Draft>>({});

  const startEdit = (r: LineupRow) => {
    setEditing((s) => ({
      ...s,
      [r.id]: {
        artist_name: r.artist_name ?? "",
        artist_image_url: r.artist_image_url ?? "",
        artist_bio_pt: r.artist_bio_pt ?? "",
        artist_bio_en: r.artist_bio_en ?? "",
        stage: r.stage ?? "",
        performance_date: r.performance_date ?? "",
        performance_time: r.performance_time ? String(r.performance_time).slice(0, 5) : "",
        display_order: r.display_order ?? 0,
      },
    }));
  };
  const cancelEdit = (id: string) =>
    setEditing((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });

  const buildPayload = (d: Draft) => ({
    artist_name: d.artist_name.trim(),
    artist_image_url: d.artist_image_url.trim() || null,
    artist_bio_pt: d.artist_bio_pt.trim() || null,
    artist_bio_en: d.artist_bio_en.trim() || null,
    stage: d.stage.trim() || null,
    performance_date: d.performance_date || null,
    performance_time: d.performance_time || null,
    display_order: Number.isFinite(d.display_order) ? d.display_order : 0,
  });

  const createMut = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.artist_name.trim()) throw new Error("Nome do artista é obrigatório.");
      const { error } = await (supabase as any).from("event_lineups").insert({
        company_id: companyId,
        event_id: eventId,
        ...buildPayload(d),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Artista adicionado.");
      const next = q.data?.length ?? 0;
      setNewDraft(emptyDraft(next));
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: Draft }) => {
      if (!d.artist_name.trim()) throw new Error("Nome do artista é obrigatório.");
      const { error } = await (supabase as any)
        .from("event_lineups")
        .update(buildPayload(d))
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Artista guardado.");
      cancelEdit(vars.id);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("event_lineups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Artista removido.");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Line-up do evento</h3>
        <p className="text-xs text-muted-foreground">
          Artistas mostrados na página pública. Ordem crescente por "Ordem".
        </p>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center p-6 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).length === 0 && (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Sem artistas. Adiciona o primeiro em baixo.
            </p>
          )}
          {(q.data ?? []).map((r, idx) => {
            const edit = editing[r.id];
            const isEditing = !!edit;
            return (
              <div key={r.id} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    #{idx + 1} · ordem {r.display_order ?? 0}
                  </span>
                  <div className="flex items-center gap-1">
                    {!isEditing && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(r)} disabled={disabled}>
                        Editar
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Remover ${r.artist_name}?`)) deleteMut.mutate(r.id);
                      }}
                      disabled={disabled || deleteMut.isPending}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isEditing ? (
                  <LineupForm
                    draft={edit}
                    onChange={(d) => setEditing((s) => ({ ...s, [r.id]: d }))}
                    disabled={disabled}
                  />
                ) : (
                  <div className="flex flex-wrap items-start gap-3 text-sm">
                    {r.artist_image_url && (
                      <img
                        src={r.artist_image_url}
                        alt={r.artist_name}
                        className="h-16 w-16 rounded-md object-cover"
                      />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-foreground">{r.artist_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[r.stage, r.performance_date, r.performance_time ? String(r.performance_time).slice(0, 5) : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {r.artist_bio_pt && (
                        <p className="whitespace-pre-wrap text-muted-foreground">{r.artist_bio_pt}</p>
                      )}
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => cancelEdit(r.id)}>
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => updateMut.mutate({ id: r.id, d: edit })}
                      disabled={disabled || updateMut.isPending}
                    >
                      {updateMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Guardar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-3 rounded-md border border-dashed border-border p-3">
        <h4 className="text-sm font-semibold">Novo artista</h4>
        <LineupForm draft={newDraft} onChange={setNewDraft} disabled={disabled} />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => createMut.mutate(newDraft)}
            disabled={disabled || createMut.isPending}
          >
            {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function LineupForm({
  draft,
  onChange,
  disabled,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  disabled: boolean;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Nome *</Label>
        <Input value={draft.artist_name} onChange={(e) => set("artist_name", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">URL da imagem</Label>
        <Input
          type="url"
          value={draft.artist_image_url}
          onChange={(e) => set("artist_image_url", e.target.value)}
          placeholder="https://…"
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Bio (PT)</Label>
        <Textarea rows={3} value={draft.artist_bio_pt} onChange={(e) => set("artist_bio_pt", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Bio (EN)</Label>
        <Textarea rows={3} value={draft.artist_bio_en} onChange={(e) => set("artist_bio_en", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Palco / Stage</Label>
        <Input value={draft.stage} onChange={(e) => set("stage", e.target.value)} disabled={disabled} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Data</Label>
          <Input
            type="date"
            value={draft.performance_date}
            onChange={(e) => set("performance_date", e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Hora</Label>
          <Input
            type="time"
            value={draft.performance_time}
            onChange={(e) => set("performance_time", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="space-y-1.5 sm:max-w-[160px]">
        <Label className="text-sm font-medium">Ordem</Label>
        <Input
          type="number"
          value={draft.display_order}
          onChange={(e) => set("display_order", e.target.value === "" ? 0 : Number(e.target.value))}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

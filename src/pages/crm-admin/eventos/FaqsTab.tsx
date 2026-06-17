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

interface FaqRow {
  id: string;
  company_id: string;
  event_id: string;
  question_pt: string | null;
  question_en: string | null;
  answer_pt: string | null;
  answer_en: string | null;
  category: string | null;
  display_order: number | null;
}

type Draft = {
  question_pt: string;
  question_en: string;
  answer_pt: string;
  answer_en: string;
  display_order: number;
};

const emptyDraft = (order: number): Draft => ({
  question_pt: "",
  question_en: "",
  answer_pt: "",
  answer_en: "",
  display_order: order,
});

export function FaqsTab({
  eventId,
  companyId,
  disabled,
}: {
  eventId: string;
  companyId: string;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const queryKey = ["crm-event-faqs", eventId];

  const faqsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<FaqRow[]> => {
      const { data, error } = await (supabase as any)
        .from("event_faqs")
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

  const startEdit = (f: FaqRow) => {
    setEditing((s) => ({
      ...s,
      [f.id]: {
        question_pt: f.question_pt ?? "",
        question_en: f.question_en ?? "",
        answer_pt: f.answer_pt ?? "",
        answer_en: f.answer_en ?? "",
        display_order: f.display_order ?? 0,
      },
    }));
  };
  const cancelEdit = (id: string) =>
    setEditing((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });

  const createMut = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.question_pt.trim() || !d.answer_pt.trim()) {
        throw new Error("Pergunta (PT) e Resposta (PT) são obrigatórias.");
      }
      const { error } = await (supabase as any).from("event_faqs").insert({
        company_id: companyId,
        event_id: eventId,
        question_pt: d.question_pt.trim(),
        question_en: d.question_en.trim() || null,
        answer_pt: d.answer_pt.trim(),
        answer_en: d.answer_en.trim() || null,
        display_order: Number.isFinite(d.display_order) ? d.display_order : 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("FAQ adicionada.");
      const next = (faqsQuery.data?.length ?? 0);
      setNewDraft(emptyDraft(next));
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: Draft }) => {
      if (!d.question_pt.trim() || !d.answer_pt.trim()) {
        throw new Error("Pergunta (PT) e Resposta (PT) são obrigatórias.");
      }
      const { error } = await (supabase as any)
        .from("event_faqs")
        .update({
          question_pt: d.question_pt.trim(),
          question_en: d.question_en.trim() || null,
          answer_pt: d.answer_pt.trim(),
          answer_en: d.answer_en.trim() || null,
          display_order: Number.isFinite(d.display_order) ? d.display_order : 0,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("FAQ guardada.");
      cancelEdit(vars.id);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("event_faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("FAQ removida.");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">FAQ do evento</h3>
        <p className="text-xs text-muted-foreground">
          Perguntas e respostas mostradas na página pública. Ordem crescente por "Ordem".
        </p>
      </div>

      {faqsQuery.isLoading ? (
        <div className="flex items-center justify-center p-6 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <div className="space-y-3">
          {(faqsQuery.data ?? []).length === 0 && (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Sem FAQs. Adiciona a primeira em baixo.
            </p>
          )}
          {(faqsQuery.data ?? []).map((f, idx) => {
            const edit = editing[f.id];
            const isEditing = !!edit;
            return (
              <div key={f.id} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    #{idx + 1} · ordem {f.display_order ?? 0}
                  </span>
                  <div className="flex items-center gap-1">
                    {!isEditing && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(f)} disabled={disabled}>
                        Editar
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Remover esta FAQ?")) deleteMut.mutate(f.id);
                      }}
                      disabled={disabled || deleteMut.isPending}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isEditing ? (
                  <FaqForm
                    draft={edit}
                    onChange={(d) => setEditing((s) => ({ ...s, [f.id]: d }))}
                    disabled={disabled}
                  />
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-foreground">{f.question_pt}</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{f.answer_pt}</p>
                    {(f.question_en || f.answer_en) && (
                      <div className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
                        <p className="font-medium">{f.question_en}</p>
                        <p className="whitespace-pre-wrap">{f.answer_en}</p>
                      </div>
                    )}
                  </div>
                )}

                {isEditing && (
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => cancelEdit(f.id)}>
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => updateMut.mutate({ id: f.id, d: edit })}
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
        <h4 className="text-sm font-semibold">Nova FAQ</h4>
        <FaqForm draft={newDraft} onChange={setNewDraft} disabled={disabled} />
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

function FaqForm({
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
        <Label className="text-sm font-medium">Pergunta (PT) *</Label>
        <Input value={draft.question_pt} onChange={(e) => set("question_pt", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Pergunta (EN)</Label>
        <Input value={draft.question_en} onChange={(e) => set("question_en", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Resposta (PT) *</Label>
        <Textarea rows={3} value={draft.answer_pt} onChange={(e) => set("answer_pt", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Resposta (EN)</Label>
        <Textarea rows={3} value={draft.answer_en} onChange={(e) => set("answer_en", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5 sm:col-span-2 sm:max-w-[160px]">
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

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  DOC_STATUS_LABELS,
  PRIORITY_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
  isClosedStage,
  type SponsorshipDocStatus,
  type SponsorshipPipelineRow,
  type SponsorshipStage,
} from "@/lib/sponsorship-pipeline";
import {
  useAddSponsorNote,
  useSponsorshipActivities,
  useUpdateSponsor,
} from "@/hooks/useSponsorshipPipeline";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Send } from "lucide-react";

interface Props {
  row: SponsorshipPipelineRow;
  eventId: string;
  companyId: string | null;
  canEdit: boolean;
  onClose: () => void;
}

export function SponsorDetailDrawer({ row, eventId, companyId, canEdit, onClose }: Props) {
  const update = useUpdateSponsor(eventId);
  const { data: activities = [] } = useSponsorshipActivities(row.id);
  const addNote = useAddSponsorNote(row.id, companyId);

  const [draft, setDraft] = useState<SponsorshipPipelineRow>(row);
  const [note, setNote] = useState("");

  useEffect(() => setDraft(row), [row.id, row.updated_at]);

  function patch<K extends keyof SponsorshipPipelineRow>(key: K, value: SponsorshipPipelineRow[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    const diff: Partial<SponsorshipPipelineRow> = {};
    (Object.keys(draft) as (keyof SponsorshipPipelineRow)[]).forEach((k) => {
      if (draft[k] !== row[k]) (diff as never as Record<string, unknown>)[k as string] = draft[k];
    });
    if (Object.keys(diff).length > 0) {
      await update.mutateAsync({ id: row.id, patch: diff });
    }
    onClose();
  }

  async function submitNote() {
    const v = note.trim();
    if (!v) return;
    await addNote.mutateAsync(v);
    setNote("");
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row.supplier_name}</SheetTitle>
          <SheetDescription>
            <Badge variant="outline">{STAGE_LABELS[row.stage]}</Badge>
            {row.linked_transaction_id && (
              <Badge variant="outline" className="ml-2 border-primary/40 text-primary">
                Vinculado ao BP
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label>Nome</Label>
            <Input
              value={draft.supplier_name}
              onChange={(e) => patch("supplier_name", e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Estado</Label>
              <Select
                value={draft.stage}
                onValueChange={(v) => patch("stage", v as SponsorshipStage)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select
                value={draft.priority}
                onValueChange={(v) => patch("priority", v as "low" | "medium" | "high")}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABELS) as (keyof typeof PRIORITY_LABELS)[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isClosedStage(draft.stage) && (
            <div>
              <Label>Estado documental</Label>
              <Select
                value={draft.doc_status ?? ""}
                onValueChange={(v) => patch("doc_status", v as SponsorshipDocStatus)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOC_STATUS_LABELS) as SponsorshipDocStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {DOC_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor proposto</Label>
              <MoneyInput
                value={Number(draft.proposed_amount) || 0}
                currency={draft.currency || "EUR"}
                onChange={(v) => patch("proposed_amount", v)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Valor confirmado</Label>
              <MoneyInput
                value={Number(draft.confirmed_amount) || 0}
                currency={draft.currency || "EUR"}
                onChange={(v) => patch("confirmed_amount", v)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Moeda</Label>
              <Select
                value={draft.currency}
                onValueChange={(v) => patch("currency", v)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="BRL">BRL</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>IVA</Label>
              <MoneyInput
                value={Number(draft.iva_rate) || 0}
                onChange={(v) => patch("iva_rate", v)}
                disabled={!canEdit}
                percent
              />
            </div>
            <div className="flex items-center gap-2 pt-7">
              <Switch
                checked={draft.is_barter}
                onCheckedChange={(v) => patch("is_barter", v)}
                disabled={!canEdit}
              />
              <span className="text-sm">Permuta</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contacto</Label>
              <Input
                value={draft.contact_name ?? ""}
                onChange={(e) => patch("contact_name", e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Próximo follow-up</Label>
              <Input
                type="date"
                value={draft.next_followup_date ?? ""}
                onChange={(e) => patch("next_followup_date", e.target.value || null)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={draft.contact_email ?? ""}
                onChange={(e) => patch("contact_email", e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={draft.contact_phone ?? ""}
                onChange={(e) => patch("contact_phone", e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea
              rows={3}
              value={draft.notes ?? ""}
              onChange={(e) => patch("notes", e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center gap-2 rounded-md border p-3">
            <Switch
              checked={draft.auto_sync_bp}
              onCheckedChange={(v) => patch("auto_sync_bp", v)}
              disabled={!canEdit}
            />
            <div className="text-sm">
              <p className="font-medium">Sincronização automática com BP</p>
              <p className="text-xs text-muted-foreground">
                Quando ativo, ao mover para Fechado a linha será promovida ao BP. Desliga para gerir manualmente.
              </p>
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end gap-2 sticky bottom-0 bg-background py-2">
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
              <Button onClick={save} disabled={update.isPending}>
                Guardar
              </Button>
            </div>
          )}

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-2">Atividade</h4>
            {canEdit && (
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Adicionar nota…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNote()}
                />
                <Button size="icon" onClick={submitNote} disabled={!note.trim() || addNote.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {activities.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem atividade registada.</p>
              )}
              {activities.map((a) => (
                <div key={a.id} className="rounded border p-2 text-xs">
                  <div className="flex justify-between text-muted-foreground mb-1">
                    <span className="uppercase tracking-wide">{a.kind.replace("_", " ")}</span>
                    <span>{format(new Date(a.occurred_at), "dd MMM HH:mm", { locale: pt })}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

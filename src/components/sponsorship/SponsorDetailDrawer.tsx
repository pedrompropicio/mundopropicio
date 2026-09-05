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
  useSyncSponsorBP,
  useUpdateSponsor,
} from "@/hooks/useSponsorshipPipeline";
import { isLinkedTransactionPaid } from "@/lib/sponsorship-bp-sync";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Send, RefreshCw, Plus as PlusIcon, Lock } from "lucide-react";

interface Props {
  row: SponsorshipPipelineRow;
  eventId: string;
  companyId: string | null;
  canEdit: boolean;
  onClose: () => void;
}

export function SponsorDetailDrawer({ row, eventId, companyId, canEdit, onClose }: Props) {
  const update = useUpdateSponsor(eventId);
  const sync = useSyncSponsorBP(eventId);
  const { data: activities = [] } = useSponsorshipActivities(row.id);
  const addNote = useAddSponsorNote(row.id, companyId);

  const [draft, setDraft] = useState<SponsorshipPipelineRow>(row);
  const [note, setNote] = useState("");
  const [confirmAmount, setConfirmAmount] = useState<{
    oldAmount: number;
    newAmount: number;
  } | null>(null);
  const [isLinkedPaid, setIsLinkedPaid] = useState(false);

  useEffect(() => setDraft(row), [row.id, row.updated_at]);

  // Detecta se a TX vinculada já está paga (bloqueia edição de valor).
  useEffect(() => {
    let active = true;
    if (row.linked_transaction_id) {
      isLinkedTransactionPaid(row.linked_transaction_id).then((p) => {
        if (active) setIsLinkedPaid(p);
      });
    } else {
      setIsLinkedPaid(false);
    }
    return () => {
      active = false;
    };
  }, [row.linked_transaction_id, row.updated_at]);

  const hasLink = !!(row.linked_transaction_id && row.linked_forecast_id);

  function patch<K extends keyof SponsorshipPipelineRow>(key: K, value: SponsorshipPipelineRow[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function persistDiff(extraDiff: Record<string, unknown> = {}) {
    const READONLY: (keyof SponsorshipPipelineRow)[] = [
      "id", "company_id", "event_id", "created_at", "updated_at",
      "created_by", "linked_forecast_id", "linked_transaction_id", "closed_at",
      "sort_order",
    ];
    const diff: Record<string, unknown> = { ...extraDiff };
    (Object.keys(draft) as (keyof SponsorshipPipelineRow)[]).forEach((k) => {
      if (READONLY.includes(k)) return;
      if (draft[k] !== row[k]) diff[k as string] = draft[k];
    });
    if (Object.keys(diff).length > 0) {
      await update.mutateAsync({ id: row.id, patch: diff as Partial<SponsorshipPipelineRow> });
    }
  }

  async function save() {
    const oldAmount = Number(row.confirmed_amount) || 0;
    const newAmount = Number(draft.confirmed_amount) || 0;

    // Se já existe BP+TX vinculados e o valor confirmado mudou, pede confirmação
    // antes de propagar a alteração ao BP e à transação.
    if (hasLink && oldAmount !== newAmount) {
      setConfirmAmount({ oldAmount, newAmount });
      return;
    }

    await persistDiff();
    onClose();
  }

  // Confirma alteração de valor: grava o card + sincroniza BP+TX com o novo valor.
  async function confirmAmountChange() {
    if (!confirmAmount) return;
    setConfirmAmount(null);
    await persistDiff();
    // Re-fetch implícito via invalidate; usa o draft atualizado para sincronizar.
    await sync.mutateAsync({ ...row, ...draft });
    onClose();
  }

  async function handleManualSync() {
    await persistDiff();
    await sync.mutateAsync({ ...row, ...draft });
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
              <Label className="flex items-center gap-1">
                Valor confirmado
                {isLinkedPaid && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <MoneyInput
                value={Number(draft.confirmed_amount) || 0}
                currency={draft.currency || "EUR"}
                onChange={(v) => patch("confirmed_amount", v)}
                disabled={!canEdit || isLinkedPaid}
              />
              {isLinkedPaid && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Transação já liquidada — para alterar o valor, desfaz primeiro a liquidação.
                </p>
              )}
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

          <div className="rounded-md border p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Business Plan & Transação</p>
                <p className="text-xs text-muted-foreground">
                  {hasLink
                    ? "Este patrocínio já tem linha no BP e transação aprovada."
                    : draft.is_barter
                      ? "Permutas ficam só no pipeline — não geram BP nem transação."
                      : "Ainda não foi gerada linha no BP. Cria abaixo quando o valor estiver confirmado."}
                </p>
              </div>
              {hasLink && (
                <Badge variant="outline" className="border-primary/40 text-primary shrink-0">
                  Vinculado
                </Badge>
              )}
            </div>
            {canEdit && !draft.is_barter && (
              <Button
                size="sm"
                variant={hasLink ? "outline" : "default"}
                onClick={handleManualSync}
                disabled={
                  sync.isPending ||
                  update.isPending ||
                  Number(draft.confirmed_amount) <= 0 ||
                  isLinkedPaid ||
                  isHalfLinked
                }
                className="w-full"
              >
                {hasLink ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar BP + Transação
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Gerar BP + Transação
                  </>
                )}
              </Button>
            )}
            {isHalfLinked && (
              <p className="text-[11px] text-amber-500">
                Vínculo incompleto: só existe {row.linked_transaction_id ? "a transação" : "a linha do BP"}.
                Corrige o vínculo antes de gerar, para não duplicar.
              </p>
            )}
            {Number(draft.confirmed_amount) <= 0 && !draft.is_barter && (
              <p className="text-[11px] text-amber-500">
                Define um valor confirmado &gt; 0 para gerar.
              </p>
            )}

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
              {activities.map((a) => {
                const kindLabel =
                  ({
                    note: "Nota",
                    stage_change: "Mudança de estado",
                    doc_status_change: "Estado documental",
                    sync: "Sincronização",
                    system: "Sistema",
                  } as Record<string, string>)[a.kind] ?? a.kind.replace("_", " ");
                let body = a.body ?? "";
                if (a.kind === "stage_change") {
                  body = body.replace(
                    /\b(lead|contacted|proposal_sent|negotiating|closed|barter|lost)\b/g,
                    (m) => STAGE_LABELS[m as SponsorshipStage] ?? m,
                  );
                }
                return (
                  <div key={a.id} className="rounded border p-2 text-xs">
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span className="uppercase tracking-wide">{kindLabel}</span>
                      <span>{format(new Date(a.occurred_at), "dd MMM HH:mm", { locale: pt })}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={!!confirmAmount} onOpenChange={(o) => !o && setConfirmAmount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar valor confirmado?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAmount && (
                <>
                  Vais alterar o valor confirmado de{" "}
                  <strong>
                    {new Intl.NumberFormat("pt-PT", {
                      style: "currency",
                      currency: row.currency || "EUR",
                    }).format(confirmAmount.oldAmount)}
                  </strong>{" "}
                  para{" "}
                  <strong>
                    {new Intl.NumberFormat("pt-PT", {
                      style: "currency",
                      currency: row.currency || "EUR",
                    }).format(confirmAmount.newAmount)}
                  </strong>
                  . Esta alteração será propagada para a linha do BP e para a
                  transação aprovada vinculadas a este patrocínio.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAmountChange}>
              Confirmar e atualizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

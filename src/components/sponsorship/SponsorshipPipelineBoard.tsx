import { useMemo, useState } from "react";
import { Plus, Calendar, User, AlertCircle, Trash2, ExternalLink, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  STAGE_COLORS,
  STAGE_LABELS,
  STAGE_ORDER,
  effectiveAmount,
  type SponsorshipPipelineRow,
  type SponsorshipStage,
} from "@/lib/sponsorship-pipeline";
import {
  useChangeStage,
  useCreateSponsor,
  useDeleteSponsor,
  useSponsorshipPipeline,
} from "@/hooks/useSponsorshipPipeline";
import { SponsorDetailDrawer } from "./SponsorDetailDrawer";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { SponsorshipPipelineImportModal } from "./SponsorshipPipelineImportModal";

interface Props {
  eventId: string;
  eventName?: string;
  eventDate?: string;
  companyId: string | null;
  canEdit: boolean;
}

const fmtMoney = (n: number, ccy = "EUR") =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n || 0);

export function SponsorshipPipelineBoard({ eventId, eventName, eventDate, companyId, canEdit }: Props) {
  const { data: rows = [], isLoading } = useSponsorshipPipeline(eventId);
  const create = useCreateSponsor(eventId, companyId);
  const remove = useDeleteSponsor(eventId);
  const changeStage = useChangeStage(eventId);

  const [openNew, setOpenNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(STAGE_ORDER.map((s) => [s, [] as SponsorshipPipelineRow[]]));
    for (const r of rows) (map[r.stage] ??= []).push(r);
    return map as Record<SponsorshipStage, SponsorshipPipelineRow[]>;
  }, [rows]);

  const kpis = useMemo(() => {
    let confirmed = 0;
    let pipelineVal = 0;
    let barter = 0;
    let lost = 0;
    for (const r of rows) {
      const v = effectiveAmount(r);
      if (r.stage === "closed") confirmed += v;
      else if (r.stage === "barter") barter += v;
      else if (r.stage === "lost") lost += Number(r.proposed_amount || 0);
      else pipelineVal += Number(r.proposed_amount || 0);
    }
    return { confirmed, pipelineVal, barter, lost, total: rows.length };
  }, [rows]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    await create.mutateAsync({ supplier_name: name });
    setNewName("");
    setOpenNew(false);
  }

  function handleDrop(stage: SponsorshipStage) {
    if (!draggingId) return;
    const row = rows.find((r) => r.id === draggingId);
    if (!row || row.stage === stage) {
      setDraggingId(null);
      return;
    }
    changeStage(draggingId, stage);
    setDraggingId(null);
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="Total no pipeline" value={String(kpis.total)} />
        <KpiTile label="Confirmado real" value={fmtMoney(kpis.confirmed)} highlight />
        <KpiTile label="Pipeline (proposto)" value={fmtMoney(kpis.pipelineVal)} muted />
        <KpiTile label="Permutas" value={fmtMoney(kpis.barter)} />
        <KpiTile label="Perdidos" value={fmtMoney(kpis.lost)} muted />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Novo patrocinador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar patrocinador ao pipeline</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Nome do patrocinador</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="Ex.: Super Bock, NOS, Coca-Cola..."
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenNew(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={!newName.trim() || create.isPending}>
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1" />
            Importar do Excel
          </Button>
        )}
        <p className="text-xs text-muted-foreground ml-auto">
          Arrasta os cards entre colunas para mudar o estado.
        </p>
      </div>

      {/* Kanban */}
      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-3 min-w-max">
          {STAGE_ORDER.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              rows={grouped[stage]}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage)}
            >
              {grouped[stage].map((row) => (
                <SponsorCard
                  key={row.id}
                  row={row}
                  canEdit={canEdit}
                  onClick={() => setSelectedId(row.id)}
                  onDelete={() => remove.mutate(row.id)}
                  draggable={canEdit}
                  onDragStart={() => setDraggingId(row.id)}
                  onDragEnd={() => setDraggingId(null)}
                />
              ))}
              {grouped[stage].length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Vazio</p>
              )}
            </Column>
          ))}
        </div>
      </ScrollArea>

      {isLoading && (
        <div className="text-center text-sm text-muted-foreground py-4">A carregar pipeline…</div>
      )}

      {selected && (
        <SponsorDetailDrawer
          row={selected}
          eventId={eventId}
          companyId={companyId}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}

      {importOpen && (
        <SponsorsImportModal
          open={importOpen}
          onOpenChange={setImportOpen}
          eventId={eventId}
          eventName={eventName ?? ""}
          eventDate={eventDate ?? ""}
        />
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  highlight,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <Card className={cn(highlight && "border-primary/40 bg-primary/5")}>
      <CardContent className="p-3">
        <p className={cn("text-[11px] uppercase tracking-wide", muted ? "text-muted-foreground" : "text-muted-foreground")}>
          {label}
        </p>
        <p className={cn("text-lg font-bold mt-1", highlight && "text-primary")}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Column({
  stage,
  rows,
  children,
  onDragOver,
  onDrop,
}: {
  stage: SponsorshipStage;
  rows: SponsorshipPipelineRow[];
  children: React.ReactNode;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const sum = rows.reduce((a, r) => a + effectiveAmount(r), 0);
  return (
    <div
      className="w-72 flex-shrink-0 rounded-lg border bg-card/40"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={cn("px-3 py-2 border-b flex items-center justify-between rounded-t-lg", STAGE_COLORS[stage])}>
        <span className="text-xs font-semibold uppercase tracking-wide">{STAGE_LABELS[stage]}</span>
        <span className="text-xs font-bold">{rows.length}</span>
      </div>
      <div className="px-3 py-1 text-[11px] text-muted-foreground border-b">
        {fmtMoney(sum)}
      </div>
      <div className="p-2 space-y-2 min-h-[120px]">{children}</div>
    </div>
  );
}

function SponsorCard({
  row,
  canEdit,
  onClick,
  onDelete,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  row: SponsorshipPipelineRow;
  canEdit: boolean;
  onClick: () => void;
  onDelete: () => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const v = effectiveAmount(row);
  const overdue =
    row.next_followup_date && new Date(row.next_followup_date) < new Date(new Date().toDateString());
  return (
    <Card
      className="cursor-pointer hover:border-primary/40 transition-colors"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm leading-tight">{row.supplier_name}</p>
          {row.linked_transaction_id && (
            <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
              <ExternalLink className="h-3 w-3" />
              BP
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold tabular-nums">{fmtMoney(v, row.currency)}</span>
          {row.priority === "high" && (
            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400">
              Alta
            </Badge>
          )}
        </div>
        {(row.contact_name || row.next_followup_date) && (
          <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            {row.contact_name && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {row.contact_name}
              </span>
            )}
            {row.next_followup_date && (
              <span className={cn("flex items-center gap-1", overdue && "text-amber-400 font-medium")}>
                <Calendar className="h-3 w-3" />
                {format(new Date(row.next_followup_date), "dd MMM", { locale: pt })}
                {overdue && <AlertCircle className="h-3 w-3" />}
              </span>
            )}
          </div>
        )}
        {canEdit && (
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Remover ${row.supplier_name} do pipeline?`)) onDelete();
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

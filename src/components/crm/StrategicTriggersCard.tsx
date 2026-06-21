import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  Plus,
  Trash2,
  History,
  ChevronDown,
  Loader2,
  Save,
  X,
  Pencil,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tipos ──────────────────────────────────────────────────────────────────
type TriggerTipo = "escassez" | "antecipacao" | "narrativa" | "calendario";
type ActiveEstado = "activo" | "expirado";

interface CatalogTrigger {
  id: string;
  company_id: string;
  chave: string;
  nome: string;
  tipo: TriggerTipo;
  descricao: string | null;
  carrega_afirmacao_factual: boolean;
  is_seed: boolean;
}

interface ActiveTrigger {
  id: string;
  company_id: string;
  event_id: string;
  trigger_id: string;
  estado: ActiveEstado;
  validade: string | null;
  detalhe: string | null;
  activated_at: string;
  updated_at: string;
}

interface LogEntry {
  id: string;
  active_trigger_id: string | null;
  trigger_id: string;
  changed_by: string | null;
  changed_at: string;
  action: "insert" | "update" | "delete";
  old_state: any;
  new_state: any;
}

interface Props {
  eventId: string | null;
  companyId: string | null;
}

// ─── Utils ──────────────────────────────────────────────────────────────────
const TIPO_LABEL: Record<TriggerTipo, string> = {
  escassez: "Escassez",
  antecipacao: "Antecipação",
  narrativa: "Narrativa",
  calendario: "Calendário",
};

function tipoBadgeClass(tipo: TriggerTipo): string {
  switch (tipo) {
    case "escassez":
      return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
    case "antecipacao":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
    case "narrativa":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
    case "calendario":
      return "bg-muted text-muted-foreground border-border";
  }
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

// ─── Componente ─────────────────────────────────────────────────────────────
export function StrategicTriggersCard({ eventId, companyId }: Props) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Estado vazio: sem evento associado ────────────────────────────────────
  if (!eventId || !companyId) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Target className="h-4 w-4" /> Gatilhos Estratégicos do Evento
        </h2>
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Campanha sem evento associado — associe um evento para definir gatilhos estratégicos.</p>
        </div>
      </Card>
    );
  }

  // ── Catálogo (por company) ────────────────────────────────────────────────
  const catalogQ = useQuery({
    queryKey: ["strategic-trigger-catalog", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("strategic_trigger_catalog")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CatalogTrigger[];
    },
  });

  // ── Activos no evento ─────────────────────────────────────────────────────
  const activeQ = useQuery({
    queryKey: ["event-active-triggers", eventId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("event_active_triggers")
        .select("*")
        .eq("event_id", eventId)
        .order("activated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ActiveTrigger[];
    },
  });

  // ── Log (últimas 10) ──────────────────────────────────────────────────────
  const logQ = useQuery({
    queryKey: ["event-active-triggers-log", eventId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("event_active_triggers_log")
        .select("*")
        .eq("event_id", eventId)
        .order("changed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as LogEntry[];
    },
  });

  const catalogById = useMemo(() => {
    const m = new Map<string, CatalogTrigger>();
    (catalogQ.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [catalogQ.data]);

  const availableToAdd = useMemo(() => {
    const activeIds = new Set((activeQ.data ?? []).map((a) => a.trigger_id));
    return (catalogQ.data ?? []).filter((c) => !activeIds.has(c.id));
  }, [catalogQ.data, activeQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event-active-triggers", eventId] });
    qc.invalidateQueries({ queryKey: ["event-active-triggers-log", eventId] });
  };

  const handleAdd = async (triggerId: string) => {
    const { error } = await (supabase as any)
      .schema("crm")
      .from("event_active_triggers")
      .insert({
        company_id: companyId,
        event_id: eventId,
        trigger_id: triggerId,
        estado: "activo",
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
    if (error) {
      toast.error("Erro ao activar gatilho: " + error.message);
      return;
    }
    toast.success("Gatilho activado");
    setAddOpen(false);
    invalidate();
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remover este gatilho do evento?")) return;
    const { error } = await (supabase as any)
      .schema("crm")
      .from("event_active_triggers")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }
    toast.success("Gatilho removido");
    invalidate();
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-4 w-4" /> Gatilhos Estratégicos do Evento
        </h2>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar gatilho
        </Button>
      </div>

      {/* Lista de activos */}
      {activeQ.isLoading || catalogQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (activeQ.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum gatilho activo para este evento. Use "Adicionar gatilho" para começar.
        </p>
      ) : (
        <div className="space-y-2">
          {(activeQ.data ?? []).map((at) => {
            const cat = catalogById.get(at.trigger_id);
            if (!cat) return null;
            return (
              <ActiveTriggerRow
                key={at.id}
                active={at}
                catalog={cat}
                isEditing={editingId === at.id}
                onEdit={() => setEditingId(at.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  invalidate();
                }}
                onRemove={() => handleRemove(at.id)}
              />
            );
          })}
        </div>
      )}

      {/* Histórico */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 -ml-2">
            <History className="h-4 w-4" />
            Histórico
            <ChevronDown className="h-3 w-3" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {logQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (logQ.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem alterações registadas.</p>
          ) : (
            <ol className="space-y-2 text-xs">
              {(logQ.data ?? []).map((e) => {
                const cat = catalogById.get(e.trigger_id);
                const diff = computeDiff(e.old_state, e.new_state);
                return (
                  <li key={e.id} className="border-l-2 border-border pl-3 py-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {e.action === "insert"
                          ? "criado"
                          : e.action === "update"
                          ? "editado"
                          : "removido"}
                      </Badge>
                      <span className="font-medium">{cat?.nome ?? "(gatilho)"}</span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(e.changed_at), {
                          addSuffix: true,
                          locale: pt,
                        })}
                      </span>
                    </div>
                    {diff.length > 0 && (
                      <ul className="mt-1 text-muted-foreground space-y-0.5">
                        {diff.map((d, i) => (
                          <li key={i}>
                            <span className="font-mono">{d.field}</span>:{" "}
                            <span className="line-through opacity-60">{d.from}</span>{" "}
                            → <span>{d.to}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Dialog: Adicionar gatilho */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar gatilho ao evento</DialogTitle>
            <DialogDescription>
              Escolha um gatilho do catálogo ou crie um novo.
            </DialogDescription>
          </DialogHeader>
          {availableToAdd.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todos os gatilhos do catálogo já estão activos neste evento.
            </p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {availableToAdd.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleAdd(c.id)}
                  className="w-full text-left p-3 rounded-md border hover:bg-accent transition"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{c.nome}</span>
                    <Badge variant="outline" className={cn("text-[10px]", tipoBadgeClass(c.tipo))}>
                      {TIPO_LABEL[c.tipo]}
                    </Badge>
                    {c.carrega_afirmacao_factual && (
                      <Badge variant="outline" className="text-[10px]">
                        factual
                      </Badge>
                    )}
                  </div>
                  {c.descricao && (
                    <p className="text-xs text-muted-foreground">{c.descricao}</p>
                  )}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                setAddOpen(false);
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Criar novo gatilho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Criar novo gatilho no catálogo */}
      <CreateCatalogDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["strategic-trigger-catalog", companyId] });
          setCreateOpen(false);
          // activa logo no evento
          handleAdd(id);
        }}
      />
    </Card>
  );
}

// ─── Linha de gatilho activo ────────────────────────────────────────────────
function ActiveTriggerRow({
  active,
  catalog,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaved,
  onRemove,
}: {
  active: ActiveTrigger;
  catalog: CatalogTrigger;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onRemove: () => void;
}) {
  const [estado, setEstado] = useState<ActiveEstado>(active.estado);
  const [validade, setValidade] = useState(active.validade ?? "");
  const [detalhe, setDetalhe] = useState(active.detalhe ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .schema("crm")
      .from("event_active_triggers")
      .update({
        estado,
        validade: validade || null,
        detalhe: detalhe || null,
      })
      .eq("id", active.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao guardar: " + error.message);
      return;
    }
    toast.success("Gatilho actualizado");
    onSaved();
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{catalog.nome}</span>
          <Badge variant="outline" className={cn("text-[10px]", tipoBadgeClass(catalog.tipo))}>
            {TIPO_LABEL[catalog.tipo]}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              active.estado === "expirado" && "opacity-60 line-through",
            )}
          >
            {active.estado === "activo" ? "activo" : "expirado"}
          </Badge>
          {catalog.carrega_afirmacao_factual && (
            <Badge variant="outline" className="text-[10px]">
              factual
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <>
              <Button size="icon" variant="ghost" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={onRemove}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>

      {!isEditing ? (
        <div className="text-sm text-muted-foreground space-y-1">
          {active.validade && (
            <div>
              Válido até{" "}
              <span className="font-medium text-foreground">
                {format(new Date(active.validade), "dd/MM/yyyy")}
              </span>
            </div>
          )}
          {active.detalhe && <p>{active.detalhe}</p>}
          {catalog.descricao && !active.detalhe && (
            <p className="text-xs italic">{catalog.descricao}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={estado} onValueChange={(v) => setEstado(v as ActiveEstado)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="expirado">Expirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Validade (opcional)</Label>
              <Input
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Detalhe</Label>
            <Textarea
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              placeholder="Ex.: OPEN BAR, virada sexta"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onCancelEdit} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dialog: criar gatilho no catálogo ──────────────────────────────────────
function CreateCatalogDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  onCreated: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TriggerTipo>("escassez");
  const [descricao, setDescricao] = useState("");
  const [factual, setFactual] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNome("");
    setTipo("escassez");
    setDescricao("");
    setFactual(false);
  };

  const handleCreate = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      toast.error("Nome obrigatório");
      return;
    }
    const chave = slugify(nomeTrim);
    if (!chave) {
      toast.error("Nome inválido");
      return;
    }
    setSaving(true);
    const { data, error } = await (supabase as any)
      .schema("crm")
      .from("strategic_trigger_catalog")
      .insert({
        company_id: companyId,
        chave,
        nome: nomeTrim,
        tipo,
        descricao: descricao.trim() || null,
        carrega_afirmacao_factual: factual,
        is_seed: false,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error("Erro ao criar: " + error.message);
      return;
    }
    toast.success("Gatilho criado no catálogo");
    reset();
    onCreated(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar novo gatilho no catálogo</DialogTitle>
          <DialogDescription>
            Os gatilhos do catálogo ficam disponíveis para qualquer evento da empresa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Final da pré-venda VIP"
            />
            {nome.trim() && (
              <p className="text-xs text-muted-foreground mt-1">
                chave: <code>{slugify(nome.trim())}</code>
              </p>
            )}
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TriggerTipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="escassez">Escassez</SelectItem>
                <SelectItem value="antecipacao">Antecipação</SelectItem>
                <SelectItem value="narrativa">Narrativa</SelectItem>
                <SelectItem value="calendario">Calendário</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label>Carrega afirmação factual</Label>
              <p className="text-xs text-muted-foreground">
                Activa quando o gatilho faz uma alegação verificável (ex.: "lote vai virar").
              </p>
            </div>
            <Switch checked={factual} onCheckedChange={setFactual} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Criar e activar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diff helper ────────────────────────────────────────────────────────────
function computeDiff(oldS: any, newS: any): { field: string; from: string; to: string }[] {
  if (!oldS || !newS) return [];
  const fields = ["estado", "validade", "detalhe"];
  const out: { field: string; from: string; to: string }[] = [];
  for (const f of fields) {
    const a = oldS?.[f] ?? "—";
    const b = newS?.[f] ?? "—";
    if (String(a) !== String(b)) out.push({ field: f, from: String(a), to: String(b) });
  }
  return out;
}

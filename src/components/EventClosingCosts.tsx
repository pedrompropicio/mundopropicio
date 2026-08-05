import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket } from "@/lib/storage";
import { formatCurrency } from "@/lib/mock-data";
import { calcIvaAmount, calcTotalWithIva } from "@/lib/iva";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Pencil, X, Check, Paperclip, FileText, ExternalLink, Info, TrendingUp, TrendingDown, AlertTriangle, Link2, Unlink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEventScenario } from "@/contexts/EventScenarioContext";
import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";

interface Props {
  eventId: string;
  eventStatus: string;
}

/**
 * Rateios de Overhead — custos partilhados da empresa (assessoria, jurídico,
 * equipa de estrutura) rateados em eventos com sócios. Persistidos em
 * event_forecasts com is_overhead=true e status=approved (já nascem aprovados,
 * não geram transação). Aparecem inline no BP com badge "Overhead" (read-only)
 * e em cidades/splits com fatia ÷N como "via Master".
 */
export function EventClosingCosts({ eventId, eventStatus }: Props) {
  // Taxas de IVA do país da cidade do evento (PT por defeito).
  const { rates: ivaRates } = useEventIvaCountry(eventId);
  const queryClient = useQueryClient();
  const { selectedVersionId, isScenarioMode } = useEventScenario();
  const isEventLocked = eventStatus === "completed";
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [ivaRate, setIvaRate] = useState<string>("23");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [bpForecastId, setBpForecastId] = useState<string>("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["event-overhead-forecasts", eventId, selectedVersionId ?? "active"],
    queryFn: async () => {
      let query = supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name, type), master:master_forecast_id(id, description, amount, account_categories(code, name))")
        .eq("event_id", eventId)
        .eq("is_overhead", true);
      query = selectedVersionId
        ? query.eq("version_id", selectedVersionId)
        : query.is("version_id", null);
      const { data, error } = await query.order("type").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*").eq("is_active", true).order("code");
      if (error) throw error;
      return data;
    },
  });

  // Descobre se este evento é split de uma turnê (tem parent_event_id)
  const { data: eventInfo } = useQuery({
    queryKey: ["event-parent-info", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, parent_event_id").eq("id", eventId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // BP existente (local + Master, se houver) — para detetar conflito de categoria
  const { data: existingBpCategoryIds = [] } = useQuery({
    queryKey: ["bp-categories-for-overhead-check", eventId, eventInfo?.parent_event_id, selectedVersionId ?? "active"],
    enabled: !!eventInfo,
    queryFn: async () => {
      const ids = [eventId];
      if (eventInfo?.parent_event_id) ids.push(eventInfo.parent_event_id);
      let q = supabase
        .from("event_forecasts")
        .select("category_id, event_id")
        .in("event_id", ids)
        .eq("is_overhead", false)
        .not("category_id", "is", null);
      q = selectedVersionId ? q.eq("version_id", selectedVersionId) : q.is("version_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({ category_id: r.category_id, scope: r.event_id === eventId ? "local" : "master" }));
    },
  });

  // Linhas de previsão de Overhead disponíveis no BP (deste evento + Master, se houver)
  // para vincular a despesa overhead a uma linha de planeamento existente.
  const { data: bpOverheadForecasts = [] } = useQuery({
    queryKey: ["bp-overhead-forecasts-for-link", eventId, eventInfo?.parent_event_id, selectedVersionId ?? "active"],
    enabled: !!eventInfo,
    queryFn: async () => {
      const ids = [eventId];
      if (eventInfo?.parent_event_id) ids.push(eventInfo.parent_event_id);
      let q = supabase
        .from("event_forecasts")
        .select("id, event_id, type, description, amount, iva_rate, account_categories(code, name)")
        .in("event_id", ids)
        .eq("is_overhead", true);
      q = selectedVersionId ? q.eq("version_id", selectedVersionId) : q.is("version_id", null);
      const { data, error } = await q.order("type").order("description");
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        scope: r.event_id === eventId ? "local" : "master",
      }));
    },
  });

  const filteredCategories = categories.filter((c: any) => c.type === type);

  // Previsões filtradas pelo tipo selecionado e que NÃO sejam a própria linha em edição
  const linkableForecasts = bpOverheadForecasts.filter(
    (f: any) => f.type === type && f.id !== editingId,
  );

  // Avisos de conflito quando a categoria escolhida já existe no BP
  const categoryConflict = (() => {
    if (!categoryId) return null;
    const matches = existingBpCategoryIds.filter((r: any) => r.category_id === categoryId);
    if (matches.length === 0) return null;
    const hasLocal = matches.some((r: any) => r.scope === "local");
    const hasMaster = matches.some((r: any) => r.scope === "master");
    return { hasLocal, hasMaster };
  })();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount) || 0;
      const iva = parseInt(ivaRate, 10) || 0;
      const payload = {
        event_id: eventId,
        description,
        amount: amt,
        category_id: categoryId || null,
        notes: notes || null,
        type,
        is_overhead: true,
        exclude_from_result: true,
        status: "approved",
        iva_rate: iva,
        formula_type: "fixed",
        formula_value: amt,
        master_forecast_id: bpForecastId || null,
        version_id: selectedVersionId || null,
      };
      let costId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from("event_forecasts")
          .update({
            description,
            amount: amt,
            category_id: categoryId || null,
            notes: notes || null,
            type,
            iva_rate: iva,
            formula_value: amt,
            master_forecast_id: bpForecastId || null,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("event_forecasts")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        costId = data.id;
      }
      if (costId && pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          await uploadToCompanyBucket(
            "closing-cost-documents",
            `${costId}/${file.name}`,
            file,
            { upsert: true },
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-overhead-forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["bp_overhead_via_master"] });
      queryClient.invalidateQueries({ queryKey: ["closing-costs-all"] });
      queryClient.invalidateQueries({ queryKey: ["ra_closing_costs"] });
      toast({ title: editingId ? "Linha de overhead atualizada" : "Linha de overhead adicionada" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Erro ao guardar", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: docs } = await supabase.storage.from("closing-cost-documents").list(`${id}`);
      if (docs && docs.length > 0) {
        await supabase.storage.from("closing-cost-documents").remove(docs.map((d) => `${id}/${d.name}`));
      }
      const { error } = await supabase.from("event_forecasts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-overhead-forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["bp_overhead_via_master"] });
      queryClient.invalidateQueries({ queryKey: ["closing-costs-all"] });
      queryClient.invalidateQueries({ queryKey: ["ra_closing_costs"] });
      toast({ title: "Linha de overhead removida" });
    },
  });

  async function handleFileUpload(costId: string, file: File) {
    const { error } = await uploadToCompanyBucket(
      "closing-cost-documents",
      `${costId}/${file.name}`,
      file,
      { upsert: true },
    );
    if (error) {
      toast({ title: "Erro ao anexar ficheiro", variant: "destructive" });
    } else {
      toast({ title: "Ficheiro anexado" });
      queryClient.invalidateQueries({ queryKey: ["closing-cost-docs", costId] });
    }
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setType("expense");
    setDescription("");
    setAmount("");
    setIvaRate("23");
    setCategoryId("");
    setNotes("");
    setBpForecastId("");
    setPendingFiles([]);
  }

  function startEdit(cost: any) {
    setEditingId(cost.id);
    setType((cost.type as "expense" | "income") || "expense");
    setDescription(cost.description);
    setAmount(String(cost.amount));
    setIvaRate(String(cost.iva_rate ?? 0));
    setCategoryId(cost.category_id || "");
    setNotes(cost.notes || "");
    setBpForecastId(cost.master_forecast_id || "");
    setShowForm(true);
  }

  const expenseCosts = costs.filter((c: any) => c.type === "expense");
  const incomeCosts = costs.filter((c: any) => c.type === "income");
  const totalExpenseBase = expenseCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalIncomeBase = incomeCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalExpenseGross = expenseCosts.reduce((s: number, c: any) => s + calcTotalWithIva(Number(c.amount), Number(c.iva_rate)), 0);
  const totalIncomeGross = incomeCosts.reduce((s: number, c: any) => s + calcTotalWithIva(Number(c.amount), Number(c.iva_rate)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Rateios de Overhead <HelpTooltip text={helpTexts.eventClosingTab} size={13} />
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Custos fixos da empresa (assessoria, jurídico, escritório) rateados ao evento. Aparecem inline no BP com badge <em>Overhead</em>, <strong>não impactam o resultado da empresa</strong> e contribuem proporcionalmente no acerto com sócios.
          </p>
        </div>
        {!isEventLocked && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <span>
          As linhas aqui criadas <strong>já nascem aprovadas</strong> e <strong>não geram transação</strong>. Aparecem em <strong>BP</strong> e <strong>DRE</strong> com badge <em>Overhead</em>, mas são excluídas do resultado da empresa. Em turnês, são distribuídas igualmente (÷N) pelos sub-eventos como "via Master".
        </span>
      </div>

      {showForm && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo *</Label>
              <select
                value={type}
                onChange={(e) => { setType(e.target.value as any); setCategoryId(""); }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Descrição *</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Rateio assessoria de imprensa" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor s/ IVA (€) *</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">IVA (%)</Label>
              <select
                value={ivaRate}
                onChange={(e) => setIvaRate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {ivaRates.map((r) => (<option key={r} value={String(r)}>{r}%</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <SearchableSelect
                options={filteredCategories.map((c: any) => ({ value: c.id, label: `${c.code} ${c.name}` }))}
                value={categoryId}
                onValueChange={setCategoryId}
                placeholder="Selecionar categoria…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações opcionais" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              Vincular a linha do BP de Overhead
              <span className="text-[10px] font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <SearchableSelect
              options={[
                { value: "", label: "— Sem vínculo (despesa sem previsão) —" },
                ...linkableForecasts.map((f: any) => ({
                  value: f.id,
                  label: `${f.scope === "master" ? "[Master] " : ""}${f.account_categories ? `${f.account_categories.code} · ` : ""}${f.description} — ${formatCurrency(Number(f.amount))}`,
                })),
              ]}
              value={bpForecastId}
              onValueChange={setBpForecastId}
              placeholder={linkableForecasts.length === 0 ? "Sem previsões de overhead no BP" : "Selecionar previsão do BP de overhead…"}
            />
            {!bpForecastId && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-[11px]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                <span className="text-muted-foreground">
                  Esta despesa <strong>não está vinculada</strong> a uma previsão do BP de overhead. Será tratada como despesa sem planeamento.
                </span>
              </div>
            )}
          </div>
          {amount && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 font-mono">
              <span>Base: {formatCurrency(parseFloat(amount) || 0)}</span>
              <span>IVA: {formatCurrency(calcIvaAmount(parseFloat(amount) || 0, parseInt(ivaRate, 10) || 0))}</span>
              <span className="font-semibold text-foreground">Total: {formatCurrency(calcTotalWithIva(parseFloat(amount) || 0, parseInt(ivaRate, 10) || 0))}</span>
            </div>
          )}
          {categoryConflict && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">Esta categoria já existe no BP {categoryConflict.hasMaster && categoryConflict.hasLocal ? "deste evento e do Master da turnê" : categoryConflict.hasMaster ? "do Master da turnê" : "deste evento"}.</p>
                <p className="text-muted-foreground">O overhead será <strong>somado</strong> ao valor já planeado da categoria. Confirma que pretendes acrescentar esta linha em vez de editar a existente.</p>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Anexos</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-secondary/80 transition-colors">
                <Paperclip className="h-3.5 w-3.5" /> Anexar ficheiro
                <input type="file" className="hidden" multiple onChange={(e) => {
                  if (e.target.files) setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                  e.target.value = "";
                }} />
              </label>
              {pendingFiles.map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
                  <FileText className="h-3 w-3" /> {f.name}
                  <button onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-0.5 text-destructive hover:text-destructive/80">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={resetForm}>
              <X className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!description || !amount || saveMutation.isPending}>
              <Check className="mr-1 h-3.5 w-3.5" /> {editingId ? "Atualizar" : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-4">A carregar…</p>
      ) : costs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma linha de overhead registada.</p>
      ) : (
        <div className="space-y-4">
          {expenseCosts.length > 0 && (
            <OverheadTable
              title="Despesas Overhead"
              icon={<TrendingDown className="h-3.5 w-3.5 text-destructive" />}
              costs={expenseCosts}
              totalBase={totalExpenseBase}
              totalGross={totalExpenseGross}
              colorClass="text-destructive"
              isEventLocked={isEventLocked}
              onEdit={startEdit}
              onDelete={(id) => { if (window.confirm("Remover esta linha?")) deleteMutation.mutate(id); }}
              onFileUpload={handleFileUpload}
            />
          )}
          {incomeCosts.length > 0 && (
            <OverheadTable
              title="Receitas Overhead"
              icon={<TrendingUp className="h-3.5 w-3.5 text-success" />}
              costs={incomeCosts}
              totalBase={totalIncomeBase}
              totalGross={totalIncomeGross}
              colorClass="text-success"
              isEventLocked={isEventLocked}
              onEdit={startEdit}
              onDelete={(id) => { if (window.confirm("Remover esta linha?")) deleteMutation.mutate(id); }}
              onFileUpload={handleFileUpload}
            />
          )}
        </div>
      )}
    </div>
  );
}

function OverheadTable({
  title, icon, costs, totalBase, totalGross, colorClass, isEventLocked, onEdit, onDelete, onFileUpload,
}: {
  title: string;
  icon: React.ReactNode;
  costs: any[];
  totalBase: number;
  totalGross: number;
  colorClass: string;
  isEventLocked: boolean;
  onEdit: (cost: any) => void;
  onDelete: (id: string) => void;
  onFileUpload: (costId: string, file: File) => void;
}) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-border/50 bg-muted/20 flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrição</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">IVA %</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">IVA (€)</TableHead>
            <TableHead className="text-right">Total c/ IVA</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {costs.map((c: any) => (
            <ClosingCostRow
              key={c.id}
              cost={c}
              colorClass={colorClass}
              isEventLocked={isEventLocked}
              onEdit={() => onEdit(c)}
              onDelete={() => onDelete(c.id)}
              onFileUpload={(file) => onFileUpload(c.id, file)}
            />
          ))}
          <TableRow className="border-t-2 border-border bg-muted/30">
            <TableCell colSpan={3} className="font-bold text-sm">TOTAL</TableCell>
            <TableCell className={`text-right font-mono font-bold ${colorClass}`}>{formatCurrency(totalBase)}</TableCell>
            <TableCell className="text-right font-mono font-bold text-muted-foreground">{formatCurrency(totalGross - totalBase)}</TableCell>
            <TableCell className={`text-right font-mono font-bold ${colorClass}`}>{formatCurrency(totalGross)}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function ClosingCostRow({ cost, colorClass, isEventLocked, onEdit, onDelete, onFileUpload }: {
  cost: any;
  colorClass: string;
  isEventLocked: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onFileUpload: (file: File) => void;
}) {
  const { data: docs = [] } = useQuery({
    queryKey: ["closing-cost-docs", cost.id],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("closing-cost-documents").list(cost.id);
      if (error) return [];
      return data || [];
    },
  });

  async function openDoc(name: string) {
    const { data } = await supabase.storage.from("closing-cost-documents").createSignedUrl(`${cost.id}/${name}`, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const base = Number(cost.amount);
  const ivaRate = Number(cost.iva_rate || 0);
  const ivaAmt = calcIvaAmount(base, ivaRate);
  const totalGross = calcTotalWithIva(base, ivaRate);

  return (
    <TableRow>
      <TableCell>
        <p className="text-sm font-medium">{cost.description}</p>
        {cost.notes && <p className="text-xs text-muted-foreground">{cost.notes}</p>}
        {cost.master ? (
          <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
            <Link2 className="h-2.5 w-2.5" />
            BP: {cost.master.account_categories ? `${cost.master.account_categories.code} · ` : ""}{cost.master.description}
          </div>
        ) : (
          <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-warning/10 text-warning px-1.5 py-0.5 text-[10px] font-medium">
            <Unlink className="h-2.5 w-2.5" />
            Sem previsão no BP
          </div>
        )}
        {docs.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {docs.map((doc: any) => (
              <button key={doc.name} onClick={() => openDoc(doc.name)} className="flex items-center gap-0.5 text-primary hover:underline text-[10px]">
                <FileText className="h-2.5 w-2.5" /> {doc.name}
                <ExternalLink className="h-2 w-2" />
              </button>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {cost.account_categories ? `${cost.account_categories.code} ${cost.account_categories.name}` : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-muted-foreground">{ivaRate}%</TableCell>
      <TableCell className={`text-right font-mono ${colorClass}`}>{formatCurrency(base)}</TableCell>
      <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatCurrency(ivaAmt)}</TableCell>
      <TableCell className={`text-right font-mono font-semibold ${colorClass}`}>{formatCurrency(totalGross)}</TableCell>
      <TableCell>
        {!isEventLocked && (
          <div className="flex gap-1">
            <label className="p-1 rounded hover:bg-secondary cursor-pointer transition-colors">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])} />
            </label>
            <button onClick={onEdit} className="p-1 rounded hover:bg-secondary transition-colors">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Handshake, Receipt, Clock, Calendar, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import {
  parseSponsorsXlsx,
  SPONSOR_KIND_LABEL,
  type ParsedSponsorRow,
  type SponsorImportKind,
  type SponsorsParseResult,
} from "@/lib/parse-sponsors-xlsx";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  eventName: string;
  /** Último dia do evento (YYYY-MM-DD) — usado para `pending_post_event`. */
  eventDate: string;
}

const SPONSORS_CATEGORY_CODE = "1.2.01"; // resolvido por empresa do evento em runtime

const KIND_ICON: Record<SponsorImportKind, React.ReactNode> = {
  paid: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  pending_invoiced: <Receipt className="h-3.5 w-3.5 text-blue-500" />,
  pending_post_event: <Calendar className="h-3.5 w-3.5 text-amber-500" />,
  barter: <Handshake className="h-3.5 w-3.5 text-purple-500" />,
  forecast_only: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
};

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SponsorsImportModal({ open, onOpenChange, eventId, eventName, eventDate }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<SponsorsParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [includeKinds, setIncludeKinds] = useState<Record<SponsorImportKind, boolean>>({
    paid: true,
    pending_invoiced: true,
    pending_post_event: true,
    barter: true,
    forecast_only: true,
  });
  const [accountId, setAccountId] = useState<string>("");
  const [createTransactions, setCreateTransactions] = useState(true);
  const [parsing, setParsing] = useState(false);

  // Contas (banco / caixa) visíveis e não-ocultas
  const { data: accounts = [] } = useQuery({
    queryKey: ["financial_accounts_for_sponsors_import"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, type, is_hidden")
        .eq("is_active", true)
        .in("type", ["bank", "cash"])
        .order("name");
      if (error) throw error;
      return (data || []).filter((a: any) => !a.is_hidden);
    },
  });

  function reset() {
    setParsed(null);
    setFileName("");
    setIncludeKinds({ paid: true, pending_invoiced: true, pending_post_event: true, barter: true, forecast_only: true });
    setAccountId("");
    setCreateTransactions(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const result = parseSponsorsXlsx(buf);
      setParsed(result);
      if (result.totals.countTotal === 0) {
        toast({ title: "Nada para importar", description: "A aba foi lida mas não foram encontradas linhas válidas.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro a ler ficheiro", description: err.message || String(err), variant: "destructive" });
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }

  const filteredRows: ParsedSponsorRow[] = (parsed?.rows || []).filter((r) => includeKinds[r.kind]);
  const needsAccount = filteredRows.some((r) => r.kind === "paid") && createTransactions;

  const importMutation = useMutation({
    mutationFn: async () => {
      if (filteredRows.length === 0) throw new Error("Nada selecionado para importar.");
      if (needsAccount && !accountId) throw new Error("Seleciona a conta de receita para os patrocínios já recebidos.");

      // 0) Resolver categoria Patrocínios (1.2.01) na empresa do evento (multi-tenant safe)
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("company_id")
        .eq("id", eventId)
        .single();
      if (evErr) throw evErr;
      const companyId = (ev as any)?.company_id;
      const catQuery = supabase
        .from("account_categories")
        .select("id")
        .eq("code", SPONSORS_CATEGORY_CODE);
      const { data: catRows, error: catErr } = companyId
        ? await catQuery.eq("company_id", companyId).limit(1)
        : await catQuery.is("company_id", null).limit(1);
      if (catErr) throw catErr;
      const SPONSORS_CATEGORY_ID = (catRows?.[0] as any)?.id;
      if (!SPONSORS_CATEGORY_ID) throw new Error(`Categoria 1.2.01 Patrocínios não encontrada para esta empresa.`);

      // 1) Resolver/criar suppliers por nome (procura case-insensitive na MESMA empresa).
      const uniqueNames = Array.from(new Set(filteredRows.map((r) => r.supplierName.trim())));
      const { data: existingSuppliers, error: supErr } = await supabase
        .from("suppliers")
        .select("id, name")
        .in("name", uniqueNames);
      if (supErr) throw supErr;
      const nameToId: Record<string, string> = {};
      for (const s of existingSuppliers || []) {
        nameToId[(s as any).name.toLowerCase()] = (s as any).id;
      }
      const toCreate = uniqueNames.filter((n) => !nameToId[n.toLowerCase()]);
      if (toCreate.length > 0) {
        const { data: created, error: createErr } = await supabase
          .from("suppliers")
          .insert(toCreate.map((name) => ({ name, is_active: true })))
          .select("id, name");
        if (createErr) throw createErr;
        for (const s of created || []) {
          nameToId[(s as any).name.toLowerCase()] = (s as any).id;
        }
      }

      // 2) Procurar forecasts existentes (idempotência por evento + descrição = nome)
      const { data: existingForecasts, error: fcErr } = await supabase
        .from("event_forecasts")
        .select("id, description, amount, type, transaction_id, is_transitory")
        .eq("event_id", eventId)
        .eq("category_id", SPONSORS_CATEGORY_ID);
      if (fcErr) throw fcErr;
      const fcByName: Record<string, any> = {};
      for (const f of existingForecasts || []) {
        fcByName[(f as any).description.trim().toLowerCase()] = f;
      }

      // 3) Procurar transações existentes (mesma empresa, evento, categoria)
      const { data: existingTx, error: txErr } = await supabase
        .from("transactions")
        .select("id, description, amount, status, supplier_id")
        .eq("event_id", eventId)
        .eq("category_id", SPONSORS_CATEGORY_ID)
        .eq("type", "income");
      if (txErr) throw txErr;
      const txByName: Record<string, any> = {};
      for (const t of existingTx || []) {
        txByName[(t as any).description.trim().toLowerCase()] = t;
      }

      let forecastsCreated = 0, forecastsUpdated = 0;
      let txCreated = 0, txSkipped = 0;
      const today = todayLocalISO();

      for (const row of filteredRows) {
        const supplierId = nameToId[row.supplierName.toLowerCase()];
        const isBarter = row.kind === "barter";

        // ---- Forecast (BP) ----
        const forecastPayload: any = {
          event_id: eventId,
          category_id: SPONSORS_CATEGORY_ID,
          type: "income",
          description: row.supplierName,
          amount: isBarter ? 0 : Number(row.effectiveAmount.toFixed(2)),
          iva_rate: 23,
          status: "pending",
          formula_type: "fixed",
          formula_value: isBarter ? 0 : Number(row.effectiveAmount.toFixed(2)),
          is_transitory: isBarter,
          notes: `Importado de ${fileName} • ${SPONSOR_KIND_LABEL[row.kind]}${row.rawStatus ? ` • estado original: "${row.rawStatus}"` : ""}`,
        };
        const existingFc = fcByName[row.supplierName.trim().toLowerCase()];
        let forecastId: string;
        if (existingFc) {
          const { error } = await supabase
            .from("event_forecasts")
            .update({
              amount: forecastPayload.amount,
              formula_value: forecastPayload.formula_value,
              is_transitory: forecastPayload.is_transitory,
              notes: forecastPayload.notes,
            })
            .eq("id", existingFc.id);
          if (error) throw error;
          forecastId = existingFc.id;
          forecastsUpdated++;
        } else {
          const { data, error } = await supabase
            .from("event_forecasts")
            .insert(forecastPayload)
            .select("id")
            .single();
          if (error) throw error;
          forecastId = (data as any).id;
          forecastsCreated++;
        }

        // ---- Transação ----
        if (!createTransactions) continue;
        if (row.kind === "barter" || row.kind === "forecast_only") continue; // sem TX
        if (txByName[row.supplierName.trim().toLowerCase()]) {
          txSkipped++;
          continue;
        }

        const txDate =
          row.kind === "paid" ? today :
          row.kind === "pending_invoiced" ? today :
          /* pending_post_event */ eventDate;

        const status = row.kind === "paid" ? "paid" : "pending";
        const payment_date = row.kind === "paid" ? today : null;
        const paid_amount = row.kind === "paid" ? Number(row.effectiveAmount.toFixed(2)) : 0;

        const txPayload: any = {
          event_id: eventId,
          type: "income",
          category_id: SPONSORS_CATEGORY_ID,
          description: row.supplierName,
          amount: Number(row.effectiveAmount.toFixed(2)),
          iva_rate: 23,
          date: txDate,
          status,
          supplier_id: supplierId,
          paid_amount,
          payment_date,
          account_id: status === "paid" ? accountId : null,
        };
        const { error: insTxErr } = await supabase.from("transactions").insert(txPayload);
        if (insTxErr) throw insTxErr;
        txCreated++;
      }

      return { forecastsCreated, forecastsUpdated, txCreated, txSkipped };
    },
    onSuccess: (res) => {
      toast({
        title: "Importação concluída",
        description: `BP: ${res.forecastsCreated} criadas, ${res.forecastsUpdated} atualizadas. Transações: ${res.txCreated} criadas${res.txSkipped ? `, ${res.txSkipped} ignoradas (já existiam)` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-active"] });
      onOpenChange(false);
      reset();
    },
    onError: (err: any) => {
      toast({ title: "Erro na importação", description: err.message || String(err), variant: "destructive" });
    },
  });

  const totals = parsed?.totals;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Patrocínios — {eventName}
          </DialogTitle>
          <DialogDescription>
            Lê a aba <span className="font-mono">Pipe</span> (ou equivalente) do BP e cria linhas de previsão e, opcionalmente, transações de receita.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
              <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Carrega o ficheiro <span className="font-mono">.xlsx</span> com a aba de patrocínios.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={handleFile}
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={parsing}>
                {parsing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> A ler…</>) : "Escolher ficheiro"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Como classificamos cada linha</strong> (coluna A do Excel):</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>"fatura emitida e recebida" → BP + transação <strong>paga</strong> hoje</li>
                <li>"fatura enviada *DD/MM*" → BP + transação <strong>pendente</strong></li>
                <li>"somente pós evento" → BP + transação pendente com data = último dia do evento</li>
                <li>"permuta" (no nome ou no valor) → linha BP <strong>transitória</strong>, sem transação</li>
                <li>vazio / "aguardando" → só linha BP</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(["paid", "pending_invoiced", "pending_post_event", "barter", "forecast_only"] as SponsorImportKind[]).map((k) => {
                const count =
                  k === "paid" ? totals!.countPaid :
                  k === "pending_invoiced" ? totals!.countPendingInvoiced :
                  k === "pending_post_event" ? totals!.countPendingPostEvent :
                  k === "barter" ? totals!.countBarter :
                  totals!.countForecastOnly;
                return (
                  <label key={k} className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 p-2 cursor-pointer hover:bg-secondary/40">
                    <Checkbox
                      checked={includeKinds[k]}
                      onCheckedChange={(v) => setIncludeKinds((s) => ({ ...s, [k]: !!v }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {KIND_ICON[k]}
                        <span className="truncate">{SPONSOR_KIND_LABEL[k]}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{count} linha{count === 1 ? "" : "s"}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Configurações */}
            <div className="rounded-lg border border-border p-3 space-y-3 bg-secondary/10">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={createTransactions}
                  onCheckedChange={(v) => setCreateTransactions(!!v)}
                />
                <span className="text-sm">Criar transações (além das linhas BP) para "pagas" e "pendentes"</span>
              </label>

              {needsAccount && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Conta de receita (para patrocínios já recebidos) *</Label>
                  <SearchableSelect
                    options={accounts.map((a: any) => ({ value: a.id, label: a.name }))}
                    value={accountId}
                    onValueChange={setAccountId}
                    placeholder="Selecionar conta…"
                  />
                </div>
              )}
            </div>

            {/* Pré-visualização */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between bg-secondary/30 px-3 py-2 text-xs font-medium">
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  Pré-visualização ({filteredRows.length} de {totals!.countTotal} linhas selecionadas)
                </div>
                <div className="text-muted-foreground">
                  Total selecionado: <strong className="text-foreground">{formatCurrency(filteredRows.reduce((s, r) => s + r.effectiveAmount, 0))}</strong>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Patrocinador</TableHead>
                      <TableHead>Estado original</TableHead>
                      <TableHead>Tratamento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.map((r) => {
                      const selected = includeKinds[r.kind];
                      return (
                        <TableRow key={r.rowIndex} className={selected ? "" : "opacity-40"}>
                          <TableCell>{KIND_ICON[r.kind]}</TableCell>
                          <TableCell className="font-medium">{r.supplierName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={r.rawStatus || ""}>
                            {r.rawStatus || <em>—</em>}
                          </TableCell>
                          <TableCell className="text-xs">{SPONSOR_KIND_LABEL[r.kind]}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {r.kind === "barter" ? <span className="text-muted-foreground">permuta</span> : formatCurrency(r.effectiveAmount)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {parsed.warnings.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-warning">
                  <AlertCircle className="h-3.5 w-3.5" /> Avisos ({parsed.warnings.length})
                </div>
                <ul className="list-disc pl-4 text-muted-foreground">
                  {parsed.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                  {parsed.warnings.length > 5 && <li>… e mais {parsed.warnings.length - 5}</li>}
                </ul>
              </div>
            )}

            <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
              <strong>Idempotente:</strong> linhas BP existentes neste evento com o mesmo nome de patrocinador serão <strong>atualizadas</strong>; transações de receita já existentes para o mesmo nome são <strong>ignoradas</strong>.
            </div>
          </div>
        )}

        <DialogFooter>
          {parsed && (
            <Button variant="ghost" onClick={reset}>Trocar ficheiro</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {parsed && (
            <Button
              onClick={() => importMutation.mutate()}
              disabled={
                filteredRows.length === 0 ||
                importMutation.isPending ||
                (needsAccount && !accountId)
              }
            >
              {importMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> A importar…</>) : `Importar ${filteredRows.length} linha${filteredRows.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

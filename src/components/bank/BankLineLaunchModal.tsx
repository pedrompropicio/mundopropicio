/**
 * Lançar uma (ou várias) linhas do banco.
 *
 * Princípio inviolável: NADA é criado sem confirmação humana. A regra
 * (`bank_line_rules`) apenas PRÉ-PREENCHE o formulário; quem confirma é a
 * pessoa. O valor e a data vêm do banco e não se editam — são factos externos.
 *
 * Três ações:
 *  · despesa / receita — uma transação `paid` na conta do extrato;
 *  · transferência — o PAR de transações da rubrica 10.3, com o mesmo mecanismo
 *    do `TransferFormModal` (saída na conta do extrato, entrada na conta de
 *    destino). É o caso do débito por limiar do Google Ads: entrega de dinheiro,
 *    não custo (D-ERP30).
 *
 * Várias linhas selecionadas dão UMA transação pela soma, e todas ficam ligadas
 * a ela por `created_transaction_id` — é o caso do TPA e das comissões de lote.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import {
  findMatchingRule,
  suggestPattern,
  type BankLineRule,
  type BankRuleAction,
} from "@/lib/bank-statement/rules";

const TRANSFER_CATEGORY_CODE = "10.3";
const IVA_RATES = [0, 6, 13, 23];

export interface LaunchableLine {
  id: string;
  description: string;
  amount: number;
  booking_date: string;
  value_date: string | null;
}

interface Props {
  lines: LaunchableLine[];
  accountId: string;
  accountName: string;
  rules: BankLineRule[];
  onClose: () => void;
  onDone: () => void;
}

export function BankLineLaunchModal({ lines, accountId, accountName, rules, onClose, onDone }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  // ---- Facto externo: valor e data vêm do banco e não se editam ------------
  const total = useMemo(
    () => Math.round(lines.reduce((acc, l) => acc + Number(l.amount ?? 0), 0) * 100) / 100,
    [lines],
  );
  const gross = Math.abs(total);
  /** Data-valor da última linha (é o dia em que o dinheiro mexeu de facto). */
  const paymentDate = useMemo(() => {
    const ds = lines
      .map((l) => String(l.value_date ?? l.booking_date ?? "").slice(0, 10))
      .filter(Boolean)
      .sort();
    return ds[ds.length - 1] ?? "";
  }, [lines]);

  const bankDescription = lines.length === 1 ? lines[0].description : `${lines.length} movimentos do banco`;

  // A regra que casa: com várias linhas usa-se a primeira, que é o padrão comum.
  const rule = useMemo(
    () => findMatchingRule(rules, { description: lines[0]?.description ?? "", amount: total }),
    [rules, lines, total],
  );

  const [action, setAction] = useState<BankRuleAction>(total < 0 ? "create_expense" : "create_income");
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [eventId, setEventId] = useState("");
  const [ivaRate, setIvaRate] = useState(0);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");

  // Aprender a regra: só se propõe quando NENHUMA regra casou.
  const [saveRule, setSaveRule] = useState(false);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleName, setRuleName] = useState("");

  useEffect(() => {
    setAction(rule?.action ?? (total < 0 ? "create_expense" : "create_income"));
    setSupplierId(rule?.supplier_id ?? "");
    setCategoryId(rule?.category_id ?? "");
    setEventId(rule?.event_id ?? "");
    setIvaRate(Number(rule?.iva_rate ?? 0));
    setDescription((rule?.description_template ?? "").trim() || bankDescription);
    setTargetAccountId(rule?.target_account_id ?? "");
    setSaveRule(!rule);
    setRulePattern(suggestPattern(lines[0]?.description ?? ""));
    setRuleName(suggestPattern(lines[0]?.description ?? "").slice(0, 60));
  }, [rule, total, bankDescription, lines]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["bank-launch-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["bank-launch-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, name, code, type, parent_id")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["bank-launch-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name")
        .in("status", ["planning", "confirmed", "active", "completed"])
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-launch-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  /** Só as folhas são selecionáveis (Core rule: apenas nós L3). */
  const categoryOptions = useMemo(() => {
    const withChildren = new Set((categories as any[]).map((c) => c.parent_id).filter(Boolean));
    return (categories as any[])
      .filter((c) => !withChildren.has(c.id))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }));
  }, [categories]);

  const isTransfer = action === "create_transfer";
  const base = Math.round((gross / (1 + ivaRate / 100)) * 100) / 100;

  async function confirm() {
    if (!description.trim()) return toast.error("A descrição é obrigatória.");
    if (!isTransfer && !categoryId) return toast.error("Escolhe a rubrica.");
    if (isTransfer && !targetAccountId) return toast.error("Escolhe a conta de destino.");
    if (gross <= 0) return toast.error("O movimento do banco não tem valor.");

    setSaving(true);
    try {
      let primaryTxId: string;

      if (isTransfer) {
        // Par de transferência, como no TransferFormModal: rubrica 10.3, IVA 0.
        const { data: cat, error: catErr } = await supabase
          .from("account_categories")
          .select("id")
          .eq("code", TRANSFER_CATEGORY_CODE)
          .maybeSingle();
        if (catErr) throw catErr;
        if (!cat) throw new Error("Rubrica 10.3 (Transferências Internas) não encontrada.");

        const target = (accounts as any[]).find((a) => a.id === targetAccountId);
        const label = `${description.trim()} (${accountName} → ${target?.name ?? "destino"})`;
        const common = {
          amount: gross,
          iva_rate: 0,
          category_id: cat.id,
          date: paymentDate,
          status: "paid",
          paid_amount: gross,
          payment_date: paymentDate,
          specification: note.trim() || null,
        };
        const { data: out, error: e1 } = await supabase
          .from("transactions")
          .insert({ ...common, description: label, type: "expense", account_id: accountId } as any)
          .select("id")
          .single();
        if (e1) throw e1;
        const { error: e2 } = await supabase
          .from("transactions")
          .insert({ ...common, description: label, type: "income", account_id: targetAccountId } as any)
          .select("id")
          .single();
        if (e2) throw e2;
        primaryTxId = out.id;
      } else {
        const { data: tx, error } = await supabase
          .from("transactions")
          .insert({
            description: description.trim(),
            type: action === "create_income" ? "income" : "expense",
            // `amount` é sempre o valor LÍQUIDO (Core rule); o banco moveu o bruto.
            amount: base,
            iva_rate: ivaRate,
            category_id: categoryId,
            supplier_id: supplierId || null,
            event_id: eventId || null,
            account_id: accountId,
            date: paymentDate,
            status: "paid",
            paid_amount: gross,
            payment_date: paymentDate,
            specification: note.trim() || null,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        primaryTxId = tx.id;
      }

      // As linhas do banco ficam ligadas à transação criada e conciliadas.
      const now = new Date().toISOString();
      const { error: eLines } = await supabase
        .from("bank_statement_lines")
        .update({
          status: "matched",
          created_transaction_id: primaryTxId,
          matched_transaction_id: primaryTxId,
          matched_by: `created:${user?.email ?? "sistema"}`,
          matched_at: now,
          note: note.trim() || null,
        })
        .in("id", lines.map((l) => l.id));
      if (eLines) throw eLines;

      // Aprender: guardar a regra para a próxima vez.
      if (saveRule && rulePattern.trim() && !isTransferMissingTarget()) {
        const { error: eRule } = await supabase.from("bank_line_rules").insert({
          name: ruleName.trim() || rulePattern.trim().slice(0, 60),
          pattern: rulePattern.trim(),
          match_type: "contains",
          direction: total < 0 ? "debit" : "credit",
          supplier_id: supplierId || null,
          category_id: isTransfer ? null : categoryId,
          event_id: eventId || null,
          iva_rate: isTransfer ? 0 : ivaRate,
          description_template: description.trim(),
          action,
          target_account_id: isTransfer ? targetAccountId : null,
          created_by: user?.email ?? "sistema",
        } as any);
        if (eRule) toast.warning("Transação criada, mas a regra não ficou guardada.");
        else toast.success("Regra guardada — da próxima vez vem preenchida.");
      }

      if (rule) {
        await supabase
          .from("bank_line_rules")
          .update({ hits: Number(rule.hits ?? 0) + 1, last_used_at: now })
          .eq("id", rule.id);
      }

      toast.success(
        lines.length === 1
          ? "Lançamento criado e linha conciliada."
          : `Lançamento criado pela soma de ${lines.length} linhas.`,
      );
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-line-rules"] });
      onDone();
    } catch (err: any) {
      toast.error("Erro ao lançar: " + (err?.message ?? "desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  function isTransferMissingTarget() {
    return isTransfer && !targetAccountId;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Lançar {lines.length === 1 ? "movimento do banco" : `${lines.length} movimentos pela soma`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Do banco (não editável)</p>
              {rule ? (
                <Badge variant="outline">Regra: {rule.name}</Badge>
              ) : (
                <Badge variant="secondary">Sem regra</Badge>
              )}
            </div>
            <p className="mt-1 font-semibold">
              {formatCurrency(total)} · {formatDatePT(paymentDate)}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {lines.map((l) => (
                <li key={l.id} className="truncate">
                  {formatDatePT(l.booking_date)} · {l.description} · {formatCurrency(Number(l.amount))}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>O que é</Label>
              <Select value={action} onValueChange={(v) => setAction(v as BankRuleAction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_expense">Despesa</SelectItem>
                  <SelectItem value="create_income">Receita</SelectItem>
                  <SelectItem value="create_transfer">Transferência entre contas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isTransfer ? (
              <div>
                <Label>Conta de destino</Label>
                <SearchableSelect
                  options={(accounts as any[]).filter((a) => a.id !== accountId).map((a) => ({ value: a.id, label: a.name }))}
                  value={targetAccountId}
                  onValueChange={setTargetAccountId}
                  placeholder="Escolher conta…"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Cria o par: saída de {accountName}, entrada na conta de destino, rubrica 10.3.
                </p>
              </div>
            ) : (
              <div>
                <Label>Rubrica</Label>
                <SearchableSelect
                  options={categoryOptions}
                  value={categoryId}
                  onValueChange={setCategoryId}
                  placeholder="Escolher rubrica…"
                />
              </div>
            )}
          </div>

          {!isTransfer && (
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Fornecedor</Label>
                <SearchableSelect
                  options={(suppliers as any[]).map((s) => ({ value: s.id, label: s.name }))}
                  value={supplierId}
                  onValueChange={setSupplierId}
                  placeholder="Sem fornecedor"
                />
              </div>
              <div>
                <Label>Evento</Label>
                <SearchableSelect
                  options={(events as any[]).map((e) => ({ value: e.id, label: e.name }))}
                  value={eventId}
                  onValueChange={setEventId}
                  placeholder="Sem evento"
                />
              </div>
              <div>
                <Label>IVA</Label>
                <Select value={String(ivaRate)} onValueChange={(v) => setIvaRate(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IVA_RATES.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Base {formatCurrency(base)} · pago {formatCurrency(gross)}
                </p>
              </div>
            </div>
          )}

          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <Label>Nota (opcional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          <div className="rounded-lg border border-border p-3">
            <label className="flex items-start gap-2">
              <Checkbox checked={saveRule} onCheckedChange={(v) => setSaveRule(!!v)} />
              <span className="text-xs">
                Guardar como regra, para a próxima vez vir preenchido.
              </span>
            </label>
            {saveRule && (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Nome da regra</Label>
                  <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Texto a procurar na descrição</Label>
                  <Input value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Descrição normalizada, sem a parte variável (o número no fim).
                  </p>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Cria a transação já paga na conta {accountName}, com data de pagamento {formatDatePT(paymentDate)}.
            O valor vem do banco e não se edita.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar lançamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import LinkBpLineDialog from "@/components/LinkBpLineDialog";
import { friendlyPaymentError } from "@/lib/payment-methods";
import {
  findMatchingRule,
  suggestPattern,
  type BankLineRule,
  type BankRuleAction,
} from "@/lib/bank-statement/rules";
import type { FeeLeg } from "@/lib/bank-statement/transfer-fees";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

const TRANSFER_CATEGORY_CODE = "10.3";
/** Taxas bancárias (D-ERP30) — também as taxas de transferência (D-ERP74). */
const FEE_CATEGORY_CODE = "10.6.01";
const IVA_RATES = [0, 6, 13, 23];

export interface LaunchableLine {
  id: string;
  description: string;
  amount: number;
  booking_date: string;
  value_date: string | null;
}

/**
 * Modo "taxas de transferência" (D-ERP74): DOIS lançamentos pela soma, um por
 * taxa de IVA, ligados às respectivas linhas, com evento e linha de BP
 * herdados da transação-mãe. Só confirmação — nada se edita.
 */
export interface FeeLaunchPlan {
  ref: string;
  /** Transação-mãe: id e rubrica servem para propor a linha e para a ligar (Peça C). */
  motherId?: string | null;
  motherDescription: string;
  motherCategoryId?: string | null;
  motherAmount?: number | null;
  eventId: string | null;
  forecastId: string | null;
  legs: FeeLeg[];
}

/** D2 — só conta para a verba o que é compromisso real (espelho do TransactionFormModal). */
function countsAsBudgetCommitment(t: any): boolean {
  return (
    !t?.is_transitory && !t?.exclude_from_result && !t?.reversed_at && !t?.is_hidden &&
    !t?.shared_cost_account_id
  );
}

interface Props {
  lines: LaunchableLine[];
  accountId: string;
  accountName: string;
  rules: BankLineRule[];
  feePlan?: FeeLaunchPlan | null;
  onClose: () => void;
  onDone: () => void;
}

/**
 * #154 — o modal NUNCA insere em `transactions`. Tudo passa pela RPC
 * `launch_from_bank_lines`: transações e linhas nascem no mesmo commit, e uma
 * linha já conciliada é recusada (guarda contra o duplo clique).
 */
interface LaunchItem {
  transaction: Record<string, unknown>;
  line_ids: string[];
  matched_by?: string;
  note?: string | null;
}

async function launchAtomic(items: LaunchItem[]): Promise<string[]> {
  const { data, error } = await supabase.rpc("launch_from_bank_lines" as any, {
    p_items: items as any,
  } as any);
  if (error) throw error;
  return (data as string[]) ?? [];
}

export function BankLineLaunchModal({ lines, accountId, accountName, rules, feePlan = null, onClose, onDone }: Props) {
  const { user, hasPermission } = useAuth();
  const canSeeConfidential = hasPermission("view_confidential");
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
  /** Dinheiro de terceiros que só passa pela conta: move saldo, não é resultado. */
  const [isTransitory, setIsTransitory] = useState(false);
  /** D1+D8 — linha de BP escolhida (nunca guardada em regra: pertence ao evento). */
  const [forecastId, setForecastId] = useState("");
  const [pickingBpLine, setPickingBpLine] = useState(false);
  /** Peça C — ligar também a transferência-mãe à linha escolhida (por defeito, sim). */
  const [linkMother, setLinkMother] = useState(true);

  // Aprender a regra: só se propõe quando NENHUMA regra casou.
  const [saveRule, setSaveRule] = useState(false);
  const [isConfidential, setIsConfidential] = useState(false);
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
    setIsTransitory(false);
    setForecastId("");
    setIsConfidential(false);
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

  /** Criação rápida de fornecedor (só nome) a partir do próprio campo. */
  const handleCreateSupplier = async (text: string) => {
    const name = text.trim();
    if (!name) return false;
    const { data: companyId, error: cErr } = await supabase.rpc("current_company_id" as any);
    if (cErr || !companyId) {
      toast.error("Não foi possível identificar a empresa activa.");
      return false;
    }
    const { data, error } = await supabase
      .from("suppliers")
      .insert({ name, company_id: companyId as string } as any)
      .select("id, name")
      .single();
    if (error || !data) {
      toast.error("Erro ao criar fornecedor: " + (error?.message ?? "desconhecido"));
      return false;
    }
    setSupplierId((data as any).id);
    await queryClient.invalidateQueries({ queryKey: ["bank-launch-suppliers"] });
    toast.success(`Fornecedor "${name}" criado.`);
    return true;
  };

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
        .select("id, name, is_restricted")
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

  /**
   * Modo taxas de transferência: tudo vem do banco e da transação-mãe. Só a
   * linha de BP pode faltar — e nesse caso é pedida antes de gravar (D1+D8).
   */
  useEffect(() => {
    if (!feePlan) return;
    const cat = (categories as any[]).find((c) => c.code === FEE_CATEGORY_CODE);
    setAction("create_expense");
    setEventId(feePlan.eventId ?? "");
    setForecastId(feePlan.forecastId ?? "");
    setCategoryId(cat?.id ?? "");
    setIvaRate(0);
    setIsTransitory(false);
    setSaveRule(false);
    setDescription(`Taxas transferência ${feePlan.ref} — ${feePlan.motherDescription}`);
  }, [feePlan, categories]);

  const isTransfer = action === "create_transfer";
  const base = Math.round((gross / (1 + ivaRate / 100)) * 100) / 100;
  /**
   * Ramo Capital (10.1.*): é transitória por regra e o motivo é derivado da rubrica
   * pelo trigger — o ecrã não manda motivo (D-ERP80, adenda 22/09/2026).
   */
  const isCapital = isCapitalCategoryCode(
    (categories as any[]).find((c) => c.id === categoryId)?.code,
  );
  /** A transitória dispensa rubrica e nunca gera regra (a tabela não guarda o flag). */
  const transitory = !isTransfer && (isTransitory || isCapital);
  /** Direção do par: numa linha de crédito o dinheiro ENTROU na conta do extrato. */
  const transferIncoming = total > 0;
  /** Conta do extrato e conta de destino: se alguma é restrita, o par nasce confidencial. */
  const statementRestricted = !!(accounts as any[]).find((a) => a.id === accountId)?.is_restricted;
  const targetRestricted = !!(accounts as any[]).find((a) => a.id === targetAccountId)?.is_restricted;

  // ---- D1 + D8: linha de BP obrigatória em despesa de evento `with_bp` ------
  const isExpense = action === "create_expense";
  const { data: budgetMode } = useQuery({
    queryKey: ["bank-launch-budget-mode", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("event_budget_mode" as any, { _event_id: eventId } as any);
      if (error) throw error;
      return String(data ?? "with_bp");
    },
  });
  const needsBpLine = isExpense && !!eventId && !transitory && budgetMode === "with_bp";

  const { data: pickedLine } = useQuery({
    queryKey: ["bank-launch-bp-line", forecastId],
    enabled: !!forecastId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, description, amount")
        .eq("id", forecastId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ---- Peça C: propor a linha do BP na rubrica da transação-mãe -------------
  const motherCategory = useMemo(
    () => (categories as any[]).find((c) => c.id === feePlan?.motherCategoryId) ?? null,
    [categories, feePlan?.motherCategoryId],
  );
  const motherCategoryLabel = motherCategory
    ? `${motherCategory.code} · ${motherCategory.name}`
    : "da transferência";

  /** Linhas aprovadas do evento na rubrica da mãe (a de maior verba é a proposta). */
  const { data: feeCandidates = [], isLoading: loadingCandidates } = useQuery({
    queryKey: ["bank-launch-fee-bp-candidates", feePlan?.eventId, feePlan?.motherCategoryId],
    enabled: !!feePlan && !feePlan.forecastId && !!feePlan.eventId && !!feePlan.motherCategoryId,
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("event_forecasts")
        .select("id, description, amount")
        .eq("event_id", feePlan!.eventId as string)
        .eq("category_id", feePlan!.motherCategoryId as string)
        .eq("type", "expense")
        .is("version_id", null)
        .not("approved_at", "is", null)
        .order("amount", { ascending: false }));
      if (error) throw error;
      return data ?? [];
    },
  });
  /** Proposta automática: a linha de maior verba. Nunca escolhe sozinha se já há uma. */
  const proposedLineId = (feeCandidates as any[])[0]?.id ?? null;
  const proposedAutomatically = !!feePlan && !feePlan.forecastId && forecastId === proposedLineId && !!proposedLineId;
  useEffect(() => {
    if (!feePlan || feePlan.forecastId || !needsBpLine) return;
    if (forecastId || !proposedLineId) return;
    setForecastId(proposedLineId);
  }, [feePlan, needsBpLine, forecastId, proposedLineId]);

  /** Utilizado da linha escolhida (mesmo cálculo do modal Nova Transação: D2 por linha). */
  const { data: lineUsed = 0 } = useQuery({
    queryKey: ["bank-launch-bp-line-used", forecastId],
    enabled: !!forecastId,
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("transactions")
        .select("amount, is_transitory, exclude_from_result, reversed_at, is_hidden, shared_cost_account_id")
        .eq("forecast_id", forecastId));
      if (error) throw error;
      return (
        Math.round(
          (data ?? [])
            .filter((t: any) => countsAsBudgetCommitment(t))
            .reduce((s: number, t: any) => s + Number(t.amount || 0), 0) * 100,
        ) / 100
      );
    },
  });

  /** Base total das taxas a lançar (é isso que consome verba da linha). */
  const feeBase = useMemo(
    () =>
      feePlan
        ? Math.round(feePlan.legs.reduce((a, l) => a + Number(l.amount ?? 0), 0) * 100) / 100
        : 0,
    [feePlan],
  );
  const lineBudget = Number((pickedLine as any)?.amount ?? 0);
  const lineAvailable = Math.round((lineBudget - Number(lineUsed ?? 0)) * 100) / 100;
  const feeExcess = Math.round((feeBase - lineAvailable) * 100) / 100;
  const motherNeedsLink = !!feePlan && !feePlan.forecastId && !!feePlan.motherId;

  /**
   * Taxas de transferência (D-ERP74): um item por perna, cada um com as suas
   * linhas, numa só chamada à RPC (#154) — as duas pernas nascem no mesmo
   * commit ou nenhuma nasce. A ligação da transferência-mãe à linha de BP fica
   * DEPOIS e fora da RPC: se falhar, as taxas já estão lançadas e o aviso diz
   * para ligar à mão. Já não se desfaz nada.
   */
  async function confirmFees() {
    const plan = feePlan!;
    if (plan.legs.length === 0) return toast.error("Nada a lançar neste grupo de taxas.");
    if (!categoryId) return toast.error("Rubrica 10.6.01 (taxas bancárias) não encontrada.");
    if (needsBpLine && !forecastId) return toast.error("Escolhe a linha de BP deste evento.");

    setSaving(true);
    try {
      const matchedBy = `created:${user?.email ?? "sistema"}`;
      const items: LaunchItem[] = plan.legs.map((leg) => ({
        transaction: {
          description: description.trim(),
          type: "expense",
          amount: leg.amount,
          iva_rate: leg.ivaRate,
          category_id: categoryId,
          is_transitory: false,
          supplier_id: supplierId || null,
          event_id: plan.eventId || null,
          forecast_id: needsBpLine ? forecastId : (plan.forecastId || null),
          account_id: accountId,
          date: paymentDate,
          status: "paid",
          paid_amount: leg.paidAmount,
          payment_date: paymentDate,
          payment_method: "transfer",
          specification: note.trim() || null,
          is_confidential: isConfidential || statementRestricted,
        },
        line_ids: leg.lineIds,
        matched_by: matchedBy,
        note: note.trim() || null,
      }));

      const ids = await launchAtomic(items);
      toast.success(`Taxas da transferência ${plan.ref} lançadas em ${ids.length} transação(ões).`);

      // Peça C — ligar também a MÃE à mesma linha, pela edge function (nunca
      // UPDATE directo do cliente). Fora da RPC: as taxas já estão gravadas.
      if (motherNeedsLink && linkMother && forecastId && plan.motherId) {
        const { data: res, error: eMother } = await supabase.functions.invoke("update-transaction", {
          body: { transaction_id: plan.motherId, updates: { forecast_id: forecastId } },
        });
        const msg = (res as any)?.error ?? eMother?.message;
        if (eMother || msg) {
          toast.warning(
            `Taxas lançadas; a ligação da transferência-mãe à linha de BP falhou — liga-a manualmente na transação ${plan.motherDescription}.`,
          );
        }
      }

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onDone();
    } catch (err: any) {
      toast.error("Erro ao lançar as taxas (nada ficou criado): " + friendlyPaymentError(err));
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    if (feePlan) return confirmFees();
    if (!description.trim()) return toast.error("A descrição é obrigatória.");
    if (!isTransfer && !transitory && !categoryId) return toast.error("Escolhe a rubrica.");
    if (isTransfer && !targetAccountId) return toast.error("Escolhe a conta de destino.");
    if (gross <= 0) return toast.error("O movimento do banco não tem valor.");
    // Antes de qualquer lançamento: sem linha de BP não se cria nada.
    if (needsBpLine && !forecastId) return toast.error("Escolhe a linha de BP deste evento.");


    setSaving(true);
    try {
      const matchedBy = `created:${user?.email ?? "sistema"}`;
      const lineIds = lines.map((l) => l.id);
      const items: LaunchItem[] = [];

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
        // A direção segue o SINAL do movimento: crédito = dinheiro entrou na conta
        // do extrato, logo a receita é aqui e a despesa é na conta de destino.
        const fromName = transferIncoming ? (target?.name ?? "origem") : accountName;
        const toName = transferIncoming ? accountName : (target?.name ?? "destino");
        const label = `${description.trim()} (${fromName} → ${toName})`;
        const common = {
          amount: gross,
          iva_rate: 0,
          category_id: cat.id,
          date: paymentDate,
          status: "paid",
          paid_amount: gross,
          payment_date: paymentDate,
          specification: note.trim() || null,
          is_confidential: isConfidential || statementRestricted || targetRestricted,
        };
        // A transação da conta do extrato é sempre a primária (é a linha do banco);
        // a segunda perna não liga linhas.
        items.push({
          transaction: {
            ...common,
            description: label,
            type: transferIncoming ? "income" : "expense",
            account_id: accountId,
          },
          line_ids: lineIds,
          matched_by: matchedBy,
          note: note.trim() || null,
        });
        items.push({
          transaction: {
            ...common,
            description: label,
            type: transferIncoming ? "expense" : "income",
            account_id: targetAccountId,
          },
          line_ids: [],
        });
      } else {
        items.push({
          transaction: {
            description: description.trim(),
            type: action === "create_income" ? "income" : "expense",
            // `amount` é sempre o valor LÍQUIDO (Core rule); o banco moveu o bruto.
            amount: base,
            iva_rate: ivaRate,
            category_id: transitory ? (categoryId || null) : categoryId,
            is_transitory: transitory,
            // D-ERP80: entrada a repassar (dinheiro que chega e vai sair) ou repasse.
            // Ramo 10.1: não mandamos motivo — o trigger deriva-o da rubrica.
            transitory_reason: isCapital
              ? null
              : transitory
                ? (action === "create_income" ? "entrada_a_repassar" : "repasse")
                : null,
            supplier_id: supplierId || null,
            event_id: eventId || null,
            forecast_id: needsBpLine ? forecastId : null,
            account_id: accountId,
            date: paymentDate,
            status: "paid",
            paid_amount: gross,
            payment_date: paymentDate,
            specification: note.trim() || null,
            is_confidential: isConfidential || statementRestricted,
          },
          line_ids: lineIds,
          matched_by: matchedBy,
          note: note.trim() || null,
        });
      }

      // Transações e linhas no mesmo commit (#154): ou fica tudo, ou nada.
      await launchAtomic(items);
      const now = new Date().toISOString();


      // Aprender: guardar a regra para a próxima vez. Nunca em transitórias —
      // `bank_line_rules` não tem coluna para o flag e perdê-lo em silêncio
      // seria pior do que não haver regra.
      if (saveRule && !transitory && rulePattern.trim() && !isTransferMissingTarget()) {
        const { error: eRule } = await supabase.from("bank_line_rules").insert({
          name: ruleName.trim() || rulePattern.trim().slice(0, 60),
          pattern: rulePattern.trim(),
          match_type: "contains",
          direction: total < 0 ? "debit" : "credit",
          supplier_id: supplierId || null,
          category_id: isTransfer ? null : (categoryId || null),
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
      toast.error("Erro ao lançar: " + friendlyPaymentError(err));
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
            {feePlan
              ? `Lançar taxas da transferência ${feePlan.ref}`
              : `Lançar ${lines.length === 1 ? "movimento do banco" : `${lines.length} movimentos pela soma`}`}
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

          {feePlan && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Taxas da transferência {feePlan.ref}
              </p>
              <p className="mt-1 text-xs">
                Custo do evento da transferência-mãe · rubrica 10.6.01 · {feePlan.motherDescription}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {feePlan.legs.map((leg) => (
                  <li key={leg.key}>
                    <strong>{leg.label}</strong> — base {formatCurrency(leg.amount)} · IVA {leg.ivaRate}% ·
                    pago {formatCurrency(leg.paidAmount)} ({leg.lineIds.length} linha(s))
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Cria {feePlan.legs.length} transação(ões), cada uma ligada às suas linhas. Nada se edita
                aqui — só a linha de BP, se o evento a exigir.
              </p>
            </div>
          )}

          {!feePlan && (
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
                  {transferIncoming
                    ? `Cria o par: entrada em ${accountName}, saída da conta de origem, rubrica 10.3.`
                    : `Cria o par: saída de ${accountName}, entrada na conta de destino, rubrica 10.3.`}
                </p>
              </div>
            ) : (
              <div>
                <Label>Rubrica{transitory ? " (opcional)" : ""}</Label>
                <SearchableSelect
                  options={categoryOptions}
                  value={categoryId}
                  onValueChange={(v) => { setCategoryId(v); setForecastId(""); }}
                  placeholder={transitory ? "Sem rubrica" : "Escolher rubrica…"}
                />
              </div>
            )}
          </div>
          )}

          {!isTransfer && !feePlan && (
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Fornecedor</Label>
                <SearchableSelect
                  options={(suppliers as any[]).map((s) => ({ value: s.id, label: s.name }))}
                  value={supplierId}
                  onValueChange={setSupplierId}
                  placeholder="Sem fornecedor"
                  onCreateOption={handleCreateSupplier}
                  createLabel={(t) => `Criar fornecedor "${t}"…`}
                />
              </div>
              <div>
                <Label>Evento</Label>
                <SearchableSelect
                  options={(events as any[]).map((e) => ({ value: e.id, label: e.name }))}
                  value={eventId}
                  onValueChange={(v) => { setEventId(v); setForecastId(""); }}
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

          {needsBpLine && (
            <div className="rounded-lg border border-border p-3">
              <Label>Linha de BP</Label>
              <div className="mt-1 flex items-center gap-2">
                <div className="min-w-0 flex-1 text-xs">
                  {forecastId ? (
                    <span className="truncate">
                      {(pickedLine as any)?.description ?? "Linha escolhida"}
                      {(pickedLine as any)?.amount != null &&
                        ` · ${formatCurrency(Number((pickedLine as any).amount))}`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Nenhuma linha escolhida — obrigatório.</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!categoryId}
                  onClick={() => setPickingBpLine(true)}
                >
                  {forecastId ? "Trocar linha" : "Escolher linha…"}
                </Button>
              </div>
              {feePlan && forecastId && (
                <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs">
                  {proposedAutomatically ? (
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Linha proposta (rubrica {motherCategoryLabel} da transferência)
                    </p>
                  ) : (
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {feePlan.forecastId === forecastId ? "Linha herdada da transferência" : "Linha escolhida"}
                    </p>
                  )}
                  <p className="mt-1">
                    Previsto {formatCurrency(lineBudget)} · Utilizado {formatCurrency(Number(lineUsed ?? 0))} ·{" "}
                    <span className={lineAvailable < 0 ? "text-destructive" : ""}>
                      Disponível {formatCurrency(lineAvailable)}
                    </span>
                  </p>
                  <p className={`mt-1 ${feeExcess > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {feeExcess > 0
                      ? `A taxa de ${formatCurrency(feeBase)} excede a linha em ${formatCurrency(feeExcess)} — entra como custo fora do BP; a verba aumenta-se no ecrã do BP.`
                      : `A taxa de ${formatCurrency(feeBase)} cabe.`}
                  </p>
                </div>
              )}
              {feePlan && !forecastId && !loadingCandidates && !!feePlan.motherCategoryId && !proposedLineId && (
                <p className="mt-2 text-xs text-amber-500">
                  O BP deste evento não tem linha {motherCategoryLabel}. Escolhe outra ou cria a linha.
                </p>
              )}
              {motherNeedsLink && (
                <label className="mt-2 flex items-start gap-2">
                  <Checkbox checked={linkMother} onCheckedChange={(v) => setLinkMother(!!v)} />
                  <span className="text-xs">
                    Ligar também a transferência-mãe ({feePlan?.motherDescription}
                    {feePlan?.motherAmount != null && ` · ${formatCurrency(Number(feePlan.motherAmount))}`}) a esta
                    linha
                  </span>
                </label>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                Este evento é gerido com BP: a despesa precisa de uma linha do Business Plan.
                {!categoryId && " Escolhe primeiro a rubrica."}
              </p>
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

          {!isTransfer && !feePlan && (
            <div className="rounded-lg border border-border p-3">
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={isTransitory}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setIsTransitory(on);
                    if (on) setSaveRule(false);
                  }}
                />
                <span className="text-xs">
                  Transitória (a repassar) — não entra no resultado
                </span>
              </label>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Move o saldo da conta, mas não é receita nem custo. Para dinheiro de terceiros que
                passa pela conta e vai ser repassado.
              </p>
            </div>
          )}

          {canSeeConfidential && (
            <div className="rounded-lg border border-border p-3">
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={isConfidential || statementRestricted || (isTransfer && targetRestricted)}
                  disabled={statementRestricted || (isTransfer && targetRestricted)}
                  onCheckedChange={(v) => setIsConfidential(!!v)}
                />
                <span className="text-xs">Confidencial</span>
              </label>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {statementRestricted || (isTransfer && targetRestricted)
                  ? "Conta restrita envolvida — o lançamento nasce sempre confidencial."
                  : "Só quem tem a permissão de ver confidenciais é que vê este movimento."}
              </p>
            </div>
          )}

          {!transitory && !feePlan && (
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
          )}

          <p className="text-xs text-muted-foreground">
            Cria a transação já paga na conta {accountName}, com data de pagamento {formatDatePT(paymentDate)}.
            O valor vem do banco e não se edita.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {feePlan ? `Confirmar ${feePlan.legs.length} lançamento(s)` : "Confirmar lançamento"}
          </Button>
        </DialogFooter>

        {pickingBpLine && (
          <LinkBpLineDialog
            pickOnly
            transaction={{
              id: "",
              description: description.trim(),
              amount: base,
              iva_rate: ivaRate,
              event_id: eventId,
              category_id: categoryId,
              events: { name: (events as any[]).find((e) => e.id === eventId)?.name ?? null },
              account_categories: (() => {
                const c = (categories as any[]).find((x) => x.id === categoryId);
                return c ? { code: c.code, name: c.name } : null;
              })(),
            }}
            onClose={() => setPickingBpLine(false)}
            onLinked={() => setPickingBpLine(false)}
            onPicked={(id) => {
              setForecastId(id);
              setPickingBpLine(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

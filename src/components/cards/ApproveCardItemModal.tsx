import { useEffect, useMemo, useState } from "react";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { cardBaseFromTotal, cardTotalFromBase, invalidateCardSessionQueries } from "@/lib/card-session-helpers";
import CardAmountFields from "@/components/cards/CardAmountFields";
import { normalizeMatchText } from "@/lib/bp-tx-matching";
import CardItemDocumentsField from "@/components/cards/CardItemDocumentsField";

interface Item {
  id: string;
  session_id: string;
  item_date: string;
  supplier_name: string | null;
  invoice_ref?: string | null;
  description: string | null;
  amount: number;
  iva_rate: number;
  event_id: string | null;
  category_id: string | null;
  document_path?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: Item | null;
  cardAccountId: string;
}

export function ApproveCardItemModal({ open, onOpenChange, item, cardAccountId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  /** Valor c/IVA (o que saiu do cartão, igual ao talão). */
  const [total, setTotal] = useState("");
  const [ivaRate, setIvaRate] = useState<number>(0);
  const [date, setDate] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setDescription(item.description ?? "");
      setIvaRate(Number(item.iva_rate ?? 0));
      setTotal(String(cardTotalFromBase(Number(item.amount ?? 0), Number(item.iva_rate ?? 0))));
      setDate(item.item_date);
      setSupplierName(item.supplier_name ?? "");
      // Valor inicial: o que o produtor gravou no item; senão o nº lido pelo OCR.
      setInvoiceRef(
        item.invoice_ref ?? (item as any).ocr_raw_payload?.document_number ?? "",
      );
      setEventId(item.event_id ?? "");
      setCategoryId(item.category_id ?? "");
      setPreviewUrl(null);
      if (item.document_path) {
        supabase.storage
          .from("card-documents")
          .createSignedUrl(item.document_path, 60 * 60)
          .then(({ data }) => setPreviewUrl(data?.signedUrl ?? null));
      }
    }
  }, [item]);

  const { data: events = [] } = useQuery({
    queryKey: ["events-for-card-expense"],
    enabled: open,
    queryFn: async () => {
      const { data, error: qErr1 } = await supabase.from("events").select("id, name").order("date", { ascending: false });
      if (qErr1) throw qErr1;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["l3-categories"],
    enabled: open,
    queryFn: async () => {
      const { data, error: qErr2 } = await supabase.from("account_categories").select("id, name, code, type, parent_id").eq("is_active", true);
      if (qErr2) throw qErr2;
      return data ?? [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active"],
    enabled: open,
    queryFn: async () => {
      const { data, error: qErr3 } = await supabase.from("suppliers").select("id, name").order("name");
      if (qErr3) throw qErr3;
      return data ?? [];
    },
  });

  /**
   * #274 — possível duplicado: transação na conta do cartão com a mesma data
   * efetiva (payment_date → date), bruto igual (±0,01 €), sem nenhum item a
   * apontar para ela, não estornada nem oculta. Mesma regra da invariante
   * `item_de_cartao_duplica_transacao` e de `possible_duplicates` no fecho.
   * É AVISO, nunca bloqueio (há repetições legítimas, ex. portagens).
   */
  const totalNum = Number(total) || 0;
  const { data: possibleDuplicates = [] } = useQuery({
    queryKey: ["card-item-possible-duplicates", item?.id, cardAccountId, date, totalNum],
    enabled: open && !!item && !!cardAccountId && !!date && totalNum > 0,
    queryFn: async () => {
      const { data: txs, error } = await supabase
        .from("transactions")
        .select("id, description, paid_amount, date, payment_date, reversed_at, is_hidden")
        .eq("account_id", cardAccountId)
        .or(`payment_date.eq.${date},and(payment_date.is.null,date.eq.${date})`)
        .is("reversed_at", null);
      if (error) throw error;
      const cands = ((txs ?? []) as any[]).filter(
        (t) => !t.is_hidden && Math.abs(Number(t.paid_amount ?? 0) - totalNum) < 0.01,
      );
      if (cands.length === 0) return [];
      const { data: linked, error: lErr } = await supabase
        .from("card_session_items")
        .select("transaction_id")
        .in("transaction_id", cands.map((t) => t.id));
      if (lErr) throw lErr;
      const linkedIds = new Set((linked ?? []).map((l: any) => l.transaction_id));
      return cands.filter((t) => !linkedIds.has(t.id));
    },
  });

  /**
   * O cartão guarda o fornecedor como texto livre. Para o agrupamento
   * automático por fatura funcionar é preciso `supplier_id`: resolvemos por
   * nome normalizado e só aceitamos correspondência única. Nunca criamos
   * fornecedores novos.
   */
  const resolvedSupplierId = useMemo(() => {
    const key = normalizeMatchText(supplierName);
    if (!key) return null;
    const hits = (suppliers as any[]).filter((sup) => normalizeMatchText(sup.name) === key);
    return hits.length === 1 ? (hits[0].id as string) : null;
  }, [suppliers, supplierName]);

  const l3Options = useMemo(() => {
    const byId = new Map(categories.map((c: any) => [c.id, c]));
    const isL3 = (c: any) => {
      const p1 = byId.get(c.parent_id);
      if (!p1) return false;
      const p2 = byId.get((p1 as any).parent_id);
      return !!p2;
    };
    return categories
      .filter((c: any) => isL3(c) && c.type === "expense")
      .sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""))
      .map((c: any) => ({ value: c.id, label: `${c.code} — ${c.name}` }));
  }, [categories]);

  /**
   * D17 — aprovar é só validar o ITEM. A transação nasce no FECHO da sessão,
   * consolidada por evento × rubrica × IVA (com o gate D1/D8/D2 lá).
   */
  const approve = useMutation({
    mutationFn: async () => {
      if (!item) return;
      if (!categoryId) throw new Error("Rubrica (L3) obrigatória para aprovar.");
      const gross = parseFloat(total);
      if (isNaN(gross) || gross <= 0) throw new Error("Valor inválido.");
      const rate = Number(ivaRate) || 0;
      // BD: amount = base s/IVA (o total c/IVA é reconstruído a partir da taxa).
      const amt = cardBaseFromTotal(gross, rate);

      const { error: updErr } = await supabase
        .from("card_session_items")
        .update({
          status: "approved",
          amount: amt,
          iva_rate: rate,
          item_date: date,
          supplier_name: supplierName || null,
          invoice_ref: invoiceRef.trim() || null,
          description: description || null,
          event_id: eventId || null,
          category_id: categoryId,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast({ title: "Item aprovado (entra no fecho da sessão)." });
      invalidateCardSessionQueries(qc, item?.session_id);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });


  const reject = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const reason = window.prompt("Motivo da rejeição:");
      if (!reason) throw new Error("cancelado");
      const { error } = await supabase
        .from("card_session_items")
        .update({
          status: "rejected",
          rejection_reason: reason,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Item rejeitado." });
      invalidateCardSessionQueries(qc, item?.session_id);
      onOpenChange(false);
    },
    onError: (e: any) => {
      if (e.message !== "cancelado") toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  if (!open || !item) return null;

  return (
    <OverlayLayer className="fixed inset-0 flex items-center justify-center bg-black/60 p-4">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Aprovar despesa</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="block">
              <img
                src={previewUrl}
                alt="Talão submetido"
                className="max-h-56 w-full rounded border border-border bg-muted object-contain"
              />
            </a>
          )}
          {item.session_id && (
            <CardItemDocumentsField
              sessionId={item.session_id}
              itemId={item.id}
              pending={[]}
              onPendingChange={() => {}}
            />
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            {!resolvedSupplierId && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Sem fornecedor associado, a fatura não é agrupada automaticamente.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nº Fatura</label>
            <input
              type="text"
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
              placeholder="Ex: FT 002/5944"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Transações com o mesmo nº de fatura serão agrupadas automaticamente
            </p>
          </div>
          
          <CardAmountFields
            total={total}
            onTotalChange={setTotal}
            ivaRate={Number(ivaRate) || 0}
            onIvaRateChange={setIvaRate}
            eventId={eventId || null}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria (L3) *</label>
            <SearchableSelect
              options={l3Options}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Selecionar categoria…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento</label>
            <SearchableSelect
              options={events.map((e: any) => ({ value: e.id, label: e.name }))}
              value={eventId}
              onValueChange={setEventId}
              placeholder="(sem evento)"
            />
          </div>

          {possibleDuplicates.length > 0 && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Possível talão repetido neste cartão
              </p>
              <ul className="mt-2 space-y-1">
                {(possibleDuplicates as any[]).map((t) => {
                  const d = String(t.payment_date ?? t.date ?? "").slice(0, 10).split("-");
                  return (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "—"} · {t.description ?? "(sem descrição)"}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium">
                        {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(t.paid_amount ?? 0))}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Já existe uma despesa com a mesma data e o mesmo valor neste cartão. Se for o mesmo talão,
                aprovar vai lançar a despesa uma segunda vez. Se for uma repetição real (ex.: duas
                portagens iguais no mesmo dia), podes aprovar.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => reject.mutate()}
              disabled={reject.isPending}
              className="flex-1 rounded-lg border border-destructive/40 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Rejeitar
            </button>
            <button
              type="button"
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {approve.isPending ? "A aprovar…" : "Aprovar item"}
            </button>
          </div>
        </div>
      </div>
    </OverlayLayer>
  );
}


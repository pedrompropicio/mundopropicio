import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, CreditCard } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { performCardLoad } from "./cardLoadHelpers";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (sessionId: string) => void;
  presetCardAccountId?: string;
  presetOpeningBalance?: number;
}

export function OpenCardSessionModal({
  open,
  onOpenChange,
  onCreated,
  presetCardAccountId,
  presetOpeningBalance,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [cardAccountId, setCardAccountId] = useState(presetCardAccountId ?? "");
  const [holderProfileId, setHolderProfileId] = useState<string>("");
  const [holderName, setHolderName] = useState("");
  const [primaryEventId, setPrimaryEventId] = useState<string>("");
  const [openingBalance, setOpeningBalance] = useState<string>(
    presetOpeningBalance !== undefined ? String(presetOpeningBalance) : "0",
  );
  const [notes, setNotes] = useState("");
  const [loadAmount, setLoadAmount] = useState<string>("");
  const [loadSourceId, setLoadSourceId] = useState<string>("");
  const [loadDate, setLoadDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (open) {
      setCardAccountId(presetCardAccountId ?? "");
      setOpeningBalance(presetOpeningBalance !== undefined ? String(presetOpeningBalance) : "0");
    }
  }, [open, presetCardAccountId, presetOpeningBalance]);

  const { data: cards = [] } = useQuery({
    queryKey: ["prepaid-cards-active"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("type", "prepaid_card")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sourceAccounts = [] } = useQuery({
    queryKey: ["source-accounts-for-load"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, type")
        .in("type", ["bank", "cash"])
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-card-holder"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-open-for-card"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name, date, status")
        .in("status", ["planning", "confirmed", "active"])
        .order("date", { ascending: false });
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!cardAccountId) throw new Error("Selecione o cartão.");
      if (!holderName.trim()) throw new Error("Nome do portador é obrigatório.");
      const card = cards.find((c: any) => c.id === cardAccountId);

      const { data: session, error } = await supabase
        .from("card_sessions")
        .insert({
          card_account_id: cardAccountId,
          holder_profile_id: holderProfileId || null,
          holder_name: holderName.trim(),
          primary_event_id: primaryEventId || null,
          opening_balance: parseFloat(openingBalance) || 0,
          notes: notes.trim() || null,
          opened_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Carga inicial opcional
      const amt = parseFloat(loadAmount);
      if (!isNaN(amt) && amt > 0) {
        if (!loadSourceId) throw new Error("Conta de origem obrigatória para a carga inicial.");
        await performCardLoad({
          sessionId: session.id,
          cardAccountId,
          cardName: card?.name ?? "Cartão",
          sourceAccountId: loadSourceId,
          sourceAccountName: sourceAccounts.find((a: any) => a.id === loadSourceId)?.name ?? "Conta",
          amount: amt,
          loadDate,
          userId: user?.id ?? null,
        });
      }

      return session.id;
    },
    onSuccess: (sessionId) => {
      toast({ title: "Sessão de cartão aberta." });
      qc.invalidateQueries({ queryKey: ["card-sessions"] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      onCreated?.(sessionId);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Entregar cartão</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Cartão">
            <SearchableSelect
              options={cards.map((c: any) => ({ value: c.id, label: c.name }))}
              value={cardAccountId}
              onValueChange={setCardAccountId}
              placeholder="Selecionar cartão…"
            />
          </Field>

          <Field label="Portador (utilizador do sistema)">
            <SearchableSelect
              options={profiles.map((p: any) => ({
                value: p.id,
                label: p.full_name || p.email || p.id.slice(0, 8),
              }))}
              value={holderProfileId}
              onValueChange={(v) => {
                setHolderProfileId(v);
                const p = profiles.find((x: any) => x.id === v);
                if (p && !holderName) setHolderName(p.full_name || p.email || "");
              }}
              placeholder="(opcional)"
            />
          </Field>

          <Field label="Nome do portador *">
            <input
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Nome que aparece no cartão / responsável"
            />
          </Field>

          <Field label="Evento principal (opcional)">
            <SearchableSelect
              options={events.map((e: any) => ({ value: e.id, label: e.name }))}
              value={primaryEventId}
              onValueChange={setPrimaryEventId}
              placeholder="(sem evento principal)"
            />
          </Field>

          <Field label="Saldo do cartão à data da entrega">
            <div className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
              {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
                parseFloat(openingBalance) || 0,
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Snapshot informativo do saldo atual do cartão. Não movimenta contas. Para ajustar o saldo real da conta do cartão, use <strong>Contas de Movimentação</strong> (admin/gestor).
            </p>
          </Field>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Carga inicial (opcional — cria par de transações transitórias)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  value={loadAmount}
                  onChange={(e) => setLoadAmount(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Data</label>
                <DatePicker value={loadDate} onChange={setLoadDate} />
              </div>
            </div>
            <div className="mt-2">
              <label className="mb-1 block text-xs text-muted-foreground">Conta de origem</label>
              <SearchableSelect
                options={sourceAccounts.map((a: any) => ({ value: a.id, label: a.name }))}
                value={loadSourceId}
                onValueChange={setLoadSourceId}
                placeholder="(sem carga)"
              />
            </div>
          </div>

          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? "A abrir…" : "Abrir sessão"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { IbanWarning } from "@/components/IbanWarning";
import { fetchSupplierBankMap, mergeSupplierBank } from "@/lib/supplier-bank";


interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function ReimbursementNoteFormModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [ibanChoice, setIbanChoice] = useState<string>("primary"); // primary | secondary | tertiary | custom | none
  const [customIban, setCustomIban] = useState("");

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-collaborators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, category")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const bank = await fetchSupplierBankMap((data ?? []).map((s: any) => s.id));
      return mergeSupplierBank((data ?? []) as any[], bank) as any[];
    },
  });


  const selectedSupplier = suppliers.find((s: any) => s.id === supplierId);

  // Whenever supplier changes, default IBAN choice to the first available one.
  useEffect(() => {
    if (!selectedSupplier) {
      setIbanChoice("primary");
      setCustomIban("");
      return;
    }
    if (selectedSupplier.iban) setIbanChoice("primary");
    else if (selectedSupplier.iban_2) setIbanChoice("secondary");
    else if (selectedSupplier.iban_3) setIbanChoice("tertiary");
    else setIbanChoice("custom");
    setCustomIban("");
  }, [supplierId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolvedIban = useMemo(() => {
    if (!selectedSupplier) return "";
    switch (ibanChoice) {
      case "primary": return selectedSupplier.iban || "";
      case "secondary": return selectedSupplier.iban_2 || "";
      case "tertiary": return selectedSupplier.iban_3 || "";
      case "custom": return customIban.trim();
      case "none": return "";
      default: return "";
    }
  }, [ibanChoice, customIban, selectedSupplier]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupplier) throw new Error("Selecione um funcionário/fornecedor");
      const { data, error } = await supabase
        .from("reimbursement_notes")
        .insert({
          employee_name: selectedSupplier.name,
          supplier_id: supplierId,
          notes: notes.trim() || null,
          payment_iban: resolvedIban || null,
          created_by: user?.email || "system",
          code: "", // trigger will generate
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes"] });
      toast({ title: "Nota de reembolso criada" });
      onCreated(id);
    },
    onError: (err: any) => toast({ title: "Erro ao criar", description: err.message, variant: "destructive" }),
  });

  const supplierOptions = suppliers.map((s: any) => ({
    value: s.id,
    label: `${s.name}${s.category ? ` (${s.category})` : ""}`,
  }));

  const hasAnyIban = !!(selectedSupplier?.iban || selectedSupplier?.iban_2 || selectedSupplier?.iban_3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-md rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nova Nota de Reembolso</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Funcionário / Beneficiário *</Label>
            <SearchableSelect
              options={supplierOptions}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="Selecionar funcionário…"
              searchPlaceholder="Pesquisar fornecedor…"
            />
            <p className="text-[10px] text-muted-foreground">
              O funcionário deve estar cadastrado como fornecedor. Recomenda-se a categoria "Colaborador".
            </p>
          </div>

          {selectedSupplier && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Label className="text-xs font-semibold">IBAN para o reembolso *</Label>
              {hasAnyIban ? (
                <div className="space-y-1.5">
                  {selectedSupplier.iban && (
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="iban-choice"
                        checked={ibanChoice === "primary"}
                        onChange={() => setIbanChoice("primary")}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="text-muted-foreground">IBAN principal:</span>{" "}
                        <span className="font-mono">{selectedSupplier.iban}</span>
                      </span>
                    </label>
                  )}
                  {selectedSupplier.iban_2 && (
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="iban-choice"
                        checked={ibanChoice === "secondary"}
                        onChange={() => setIbanChoice("secondary")}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="text-muted-foreground">IBAN 2:</span>{" "}
                        <span className="font-mono">{selectedSupplier.iban_2}</span>
                      </span>
                    </label>
                  )}
                  {selectedSupplier.iban_3 && (
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="iban-choice"
                        checked={ibanChoice === "tertiary"}
                        onChange={() => setIbanChoice("tertiary")}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="text-muted-foreground">IBAN 3:</span>{" "}
                        <span className="font-mono">{selectedSupplier.iban_3}</span>
                      </span>
                    </label>
                  )}
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="iban-choice"
                      checked={ibanChoice === "custom"}
                      onChange={() => setIbanChoice("custom")}
                      className="mt-0.5"
                    />
                    <span className="text-muted-foreground">Outro IBAN (apenas para este reembolso)</span>
                  </label>
                </div>
              ) : (
                <p className="text-[11px] text-warning">
                  Este fornecedor não tem IBAN registado. Indique abaixo o IBAN para este reembolso.
                </p>
              )}

              {(ibanChoice === "custom" || !hasAnyIban) && (
                <>
                  <Input
                    value={customIban}
                    onChange={(e) => setCustomIban(e.target.value.toUpperCase())}
                    placeholder="PT50 0000 0000 0000 0000 0000 0"
                    className="h-8 font-mono text-xs"
                  />
                  <IbanWarning value={customIban} />
                </>
              )}

              {hasAnyIban && (
                <label className="flex items-start gap-2 text-[11px] cursor-pointer text-muted-foreground">
                  <input
                    type="radio"
                    name="iban-choice"
                    checked={ibanChoice === "none"}
                    onChange={() => setIbanChoice("none")}
                    className="mt-0.5"
                  />
                  <span>Sem IBAN (pago por outro meio)</span>
                </label>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas opcionais…"
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={
              !supplierId ||
              createMutation.isPending ||
              (ibanChoice === "custom" && !customIban.trim()) ||
              (!hasAnyIban && ibanChoice !== "none" && !customIban.trim())
            }
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Criar
          </Button>
        </div>
      </div>
    </div>
  );
}

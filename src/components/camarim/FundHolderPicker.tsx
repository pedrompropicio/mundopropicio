import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSupplierBankMap, mergeSupplierBank } from "@/lib/supplier-bank";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Link2 } from "lucide-react";

export type FundHolderType = "employee" | "supplier";

export interface FundHolderValue {
  type: FundHolderType;
  supplierId: string | null;
  userId: string | null;
}

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string;
  linked_supplier_id: string | null;
}
interface SupplierOption {
  id: string;
  name: string;
  iban: string | null;
}

interface Props {
  value: FundHolderValue;
  onChange: (v: FundHolderValue) => void;
  disabled?: boolean;
}

/**
 * Seletor de "responsável pelo caixa" da sessão de camarim.
 * - Colaborador: usa profiles.linked_supplier_id como fonte de IBAN
 *   (mesmo padrão dos reembolsos). Se ainda não está vinculado, permite
 *   vincular aqui mesmo.
 * - Prestador externo: seleciona directamente do cadastro de suppliers.
 */
export function FundHolderPicker({ value, onChange, disabled }: Props) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [linking, setLinking] = useState(false);
  const [linkChoice, setLinkChoice] = useState<string>("");

  const refetchProfiles = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name,email,linked_supplier_id")
      .order("full_name")
      .limit(500);
    setProfiles((data ?? []) as ProfileOption[]);
  };

  useEffect(() => {
    void (async () => {
      await Promise.all([
        refetchProfiles(),
        supabase
          .from("suppliers")
          .select("id,name")
          .order("name")
          .limit(1000)
          .then(async ({ data }) => {
            const bank = await fetchSupplierBankMap(((data ?? []) as any[]).map((s) => s.id));
            setSuppliers(mergeSupplierBank((data ?? []) as any[], bank) as unknown as SupplierOption[]);
          }),

      ]);
    })();
  }, []);

  const setType = (t: FundHolderType) => {
    onChange({ type: t, supplierId: null, userId: null });
  };

  const selectedProfile = profiles.find((p) => p.id === value.userId) ?? null;
  const linkedSupplier = selectedProfile
    ? suppliers.find((s) => s.id === selectedProfile.linked_supplier_id) ?? null
    : null;

  const linkSupplier = async () => {
    if (!selectedProfile || !linkChoice) return;
    setLinking(true);
    const { error } = await supabase
      .from("profiles")
      .update({ linked_supplier_id: linkChoice })
      .eq("id", selectedProfile.id);
    setLinking(false);
    if (error) {
      toast({ variant: "destructive", title: "Erro a vincular", description: error.message });
      return;
    }
    toast({ title: "Fornecedor vinculado ao colaborador" });
    setLinkChoice("");
    await refetchProfiles();
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
      <Label className="text-sm font-semibold">Responsável pelo caixa da sessão</Label>
      <p className="text-[11px] text-muted-foreground">
        Quem recebe o adiantamento e presta contas no fecho. O IBAN de destino vem
        sempre do cadastro de fornecedor associado.
      </p>

      <RadioGroup
        value={value.type}
        onValueChange={(v) => setType(v as FundHolderType)}
        disabled={disabled}
        className="mt-2 grid grid-cols-2 gap-2"
      >
        <label className="flex cursor-pointer items-center gap-2 rounded border border-border p-2 text-sm hover:bg-muted/40">
          <RadioGroupItem value="employee" />
          Colaborador
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded border border-border p-2 text-sm hover:bg-muted/40">
          <RadioGroupItem value="supplier" />
          Prestador externo
        </label>
      </RadioGroup>

      {value.type === "employee" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Colaborador</Label>
          <Select
            value={value.userId ?? ""}
            onValueChange={(v) => onChange({ ...value, userId: v || null, supplierId: null })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar colaborador" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProfile && linkedSupplier && (
            <p className="text-[11px] text-muted-foreground">
              Fornecedor vinculado: <span className="font-medium">{linkedSupplier.name}</span>
              {linkedSupplier.iban ? (
                <> · IBAN <span className="font-mono">{linkedSupplier.iban}</span></>
              ) : (
                <> · <span className="text-amber-600">sem IBAN cadastrado</span></>
              )}
            </p>
          )}

          {selectedProfile && !linkedSupplier && (
            <div className="mt-1 space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Este colaborador ainda não tem fornecedor vinculado. É necessário para
                  o IBAN das transações e listas de reembolso.
                </span>
              </div>
              <div className="flex gap-2">
                <Select value={linkChoice} onValueChange={setLinkChoice} disabled={linking}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Escolher fornecedor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.iban ? "" : " (sem IBAN)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={linkSupplier}
                  disabled={!linkChoice || linking}
                  className="h-8"
                >
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  Vincular
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Fornecedor / prestador</Label>
          <Select
            value={value.supplierId ?? ""}
            onValueChange={(v) => onChange({ ...value, supplierId: v || null, userId: null })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar fornecedor" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.iban ? "" : " (sem IBAN)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

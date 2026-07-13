import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
}
interface SupplierOption {
  id: string;
  name: string;
}

interface Props {
  value: FundHolderValue;
  onChange: (v: FundHolderValue) => void;
  disabled?: boolean;
}

/**
 * Seletor de "responsável pelo caixa" da sessão de camarim.
 * Distingue colaborador interno (profile) vs prestador externo (supplier).
 * Determina para onde vai o adiantamento e onde o saldo em aberto fica
 * lançado até ao fecho.
 */
export function FundHolderPicker({ value, onChange, disabled }: Props) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  useEffect(() => {
    void (async () => {
      const [pf, sp] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email").order("full_name").limit(300),
        supabase.from("suppliers").select("id,name").order("name").limit(500),
      ]);
      setProfiles(((pf.data ?? []) as ProfileOption[]));
      setSuppliers(((sp.data ?? []) as SupplierOption[]));
    })();
  }, []);

  const setType = (t: FundHolderType) => {
    onChange({ type: t, supplierId: null, userId: null });
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
      <Label className="text-sm font-semibold">Responsável pelo caixa da sessão</Label>
      <p className="text-[11px] text-muted-foreground">
        Quem recebe o adiantamento e presta contas no fecho.
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
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

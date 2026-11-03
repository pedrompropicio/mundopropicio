import { useState } from "react";
import { ChevronDown, ChevronRight, Building2, Copy, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import { supabase } from "@/integrations/supabase/client";

/** BR fields extend the open slot schema documented by 0302. Keep numbers as text. */
export interface BrBankDetails {
  bank_name?: string;
  routing_number?: string;
  account_number?: string;
  account_digit?: string;
  account_kind?: "corrente" | "poupanca";
  pix_key?: string;
}
export interface BrBankSlot extends BrBankDetails {
  slot: number;
  account_type: "br_banco_agencia_conta";
}
export const BR_BANK_FIELDS = [
  ["bank_name", "Banco"], ["routing_number", "Agência"],
  ["account_number", "Conta"], ["account_digit", "Dígito"], ["pix_key", "Chave Pix"],
] as const;

export function readBrBankSlots(value: unknown): BrBankSlot[] {
  return Array.isArray(value) ? value.filter((v): v is BrBankSlot =>
    v && typeof v === "object" && v.account_type === "br_banco_agencia_conta" && [1, 2, 3].includes(v.slot)) : [];
}

/** A missing optional column is expected before the manual window; other errors propagate. */
export async function optionalBankColumns(table: "suppliers" | "financial_accounts", columns: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(columns).limit(0);
  if (!error) return true;
  if (["42703", "PGRST204"].includes(error.code)) return false;
  throw error;
}

export interface SupplierBrData {
  foreign_bank_accounts?: unknown;
  tax_id_foreign?: string | null;
  tax_id_type?: string | null;
}

export async function loadOptionalSupplierBrData(id?: string): Promise<{ available: boolean; details: SupplierBrData | null }> {
  if (!id) return { available: await optionalBankColumns("suppliers", "foreign_bank_accounts,tax_id_foreign,tax_id_type"), details: null };
  const { data, error } = await supabase.from("suppliers")
    .select("foreign_bank_accounts,tax_id_foreign,tax_id_type").eq("id", id).maybeSingle();
  if (error) {
    if (["42703", "PGRST204", "42501"].includes(error.code)) return { available: false, details: null };
    throw error;
  }
  return { available: !!data, details: data as SupplierBrData | null };
}

export function BrBankFields({ value, onChange, prefix, disabled = false }: {
  value: BrBankDetails; onChange: (value: BrBankDetails) => void; prefix: string; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="grid grid-cols-2 gap-4">
    {BR_BANK_FIELDS.map(([key, label]) => <div className="grid gap-2" key={key}>
      <label htmlFor={`${prefix}-${key}`} className="text-xs font-medium">{label}</label>
      <input id={`${prefix}-${key}`} value={value[key] ?? ""}
        onChange={e => onChange({ ...value, [key]: e.target.value })}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
    </div>)}
    <div className="grid gap-2">
      <label htmlFor={`${prefix}-account_kind`} className="text-xs font-medium">Tipo de conta</label>
      <select id={`${prefix}-account_kind`} value={value.account_kind ?? ""}
        onChange={e => onChange({ ...value, account_kind: (e.target.value || undefined) as BrBankDetails["account_kind"] })}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <option value="">Selecionar</option><option value="corrente">Corrente</option><option value="poupanca">Poupança</option>
      </select>
    </div>
  </fieldset>;
}

interface SupplierBankData {
  id?: string;
  foreign_bank_accounts?: unknown;
  tax_id_foreign?: string | null;
  tax_id_type?: string | null;
  name: string;
  nif?: string | null;
  iban?: string | null;
  swift_bic?: string | null;
  iban_2?: string | null;
  swift_bic_2?: string | null;
  iban_3?: string | null;
  swift_bic_3?: string | null;
}

interface Props {
  supplier: SupplierBankData | null | undefined;
  defaultExpanded?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" onClick={handleCopy} className="ml-1 p-0.5 rounded hover:bg-muted transition-colors" title="Copiar">
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

function IbanRow({ label, iban, swift }: { label: string; iban: string; swift?: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-1">
        <span className="font-mono text-xs font-medium text-foreground">{iban}</span>
        <CopyButton text={iban} />
      </div>
      {swift && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">SWIFT:</span>
          <span className="font-mono text-[11px]">{swift}</span>
          <CopyButton text={swift} />
        </div>
      )}
    </div>
  );
}

export function SupplierBankDetails({ supplier, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const locale = useCompanyLocale();
  const isBR = locale.status === "available" && locale.locale === "pt-BR";
  const { role } = useAuth();
  const canReadBank = ["admin", "platform_admin", "manager", "editor", "accountant"].includes(role ?? "");
  const { data: brData } = useQuery({
    queryKey: ["supplier-br-details", locale.companyId, supplier?.id, role],
    enabled: isBR && canReadBank && !!locale.companyId && !!supplier?.id,
    queryFn: () => loadOptionalSupplierBrData(supplier?.id),
  });

  if (!supplier) return null;

  if (isBR) {
    const source = brData?.details ?? supplier;
    const banks = readBrBankSlots(source.foreign_bank_accounts);
    const taxId = source.tax_id_foreign;
    if (!banks.length && !taxId) return null;
    return <div className="rounded-lg border border-border/50 bg-secondary/20 overflow-hidden">
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <Building2 className="h-3.5 w-3.5" /><span className="text-xs font-medium">{supplier.name}</span>
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {expanded && <div className="px-3 pb-2.5 space-y-2">
        {taxId && <p className="text-xs">{source.tax_id_type?.toUpperCase() || "CNPJ"}: {taxId}<CopyButton text={taxId} /></p>}
        {banks.map(bank => <div key={bank.slot} className="text-xs space-y-1">
          <p className="font-medium">Conta bancária {bank.slot}</p>
          {BR_BANK_FIELDS.map(([key, label]) => bank[key] ? <p key={key}>{label}: {bank[key]}<CopyButton text={bank[key]!} /></p> : null)}
          {bank.account_kind && <p>Tipo de conta: {bank.account_kind === "poupanca" ? "Poupança" : "Corrente"}</p>}
        </div>)}
      </div>}
    </div>;
  }

  const ibans = [
    { iban: supplier.iban, swift: supplier.swift_bic },
    { iban: supplier.iban_2, swift: supplier.swift_bic_2 },
    { iban: supplier.iban_3, swift: supplier.swift_bic_3 },
  ].filter((b) => b.iban);

  if (ibans.length === 0 && !supplier.nif) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground truncate flex-1">{supplier.name}</span>
        {ibans.length > 0 && (
          <span className="text-[10px] text-muted-foreground">{ibans.length} IBAN{ibans.length > 1 ? "s" : ""}</span>
        )}
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 space-y-2 border-t border-border/30 pt-2">
          {supplier.nif && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">NIF:</span>
              <span className="font-mono text-xs">{supplier.nif}</span>
              <CopyButton text={supplier.nif} />
            </div>
          )}
          {ibans.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">Nenhum IBAN cadastrado</p>
          )}
          {ibans.map((b, i) => (
            <IbanRow
              key={i}
              label={ibans.length === 1 ? "IBAN" : `IBAN ${i + 1}`}
              iban={b.iban!}
              swift={b.swift}
            />
          ))}
        </div>
      )}
    </div>
  );
}

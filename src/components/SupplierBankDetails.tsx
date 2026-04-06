import { useState } from "react";
import { ChevronDown, ChevronRight, Building2, Copy, Check } from "lucide-react";

interface SupplierBankData {
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

  if (!supplier) return null;

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

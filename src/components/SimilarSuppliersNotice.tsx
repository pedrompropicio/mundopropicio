/**
 * Aviso de fornecedores parecidos (D-ERP199). Partilhado por SupplierFormModal
 * e BankLineLaunchModal — a decisão (o que fazer em cada botão) é de quem usa.
 */
import { normalizeNif } from "@/lib/supplier-similarity";

export type SimilarSupplier = {
  id: string;
  name: string;
  nif: string | null;
  iban: string | null;
  iban_2: string | null;
  iban_3: string | null;
  is_active: boolean;
  motivo: "nif" | "nome";
};

/** NIF (não vazio) igual a um fornecedor ATIVO → não se deixa criar outro. */
export function isNifBlocked(typedNif: string | null | undefined, list: SimilarSupplier[]): boolean {
  return !!normalizeNif(typedNif) && list.some((c) => c.motivo === "nif" && c.is_active);
}

interface Props {
  list: SimilarSupplier[];
  typedNif?: string | null;
  canManage: boolean;
  busy?: boolean;
  onUse: (c: SimilarSupplier) => void;
  onCreateAnyway: () => void;
  /** Opcional: só o SupplierFormModal oferece acrescentar o IBAN. */
  canAppendIban?: (c: SimilarSupplier) => boolean;
  onAppendIban?: (c: SimilarSupplier) => void;
}

export function SimilarSuppliersNotice({
  list, typedNif, canManage, busy, onUse, onCreateAnyway, canAppendIban, onAppendIban,
}: Props) {
  const nifBlock = isNifBlocked(typedNif, list);
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-3" role="alert">
      <p className="font-medium">
        {nifBlock ? "Já existe um fornecedor ativo com este NIF" : "Há fornecedores parecidos — confirma antes de criar"}
      </p>
      <ul className="space-y-3">
        {list.map((c) => {
          const blockedInactive = !c.is_active && !canManage;
          return (
            <li key={c.id} className="space-y-1.5">
              <p>
                <span className="font-medium">«{c.name}»</span>{" "}
                <span className="text-muted-foreground">
                  (NIF: {c.nif ?? "—"}) · {c.motivo === "nif" ? "mesmo NIF" : "nome parecido"}
                  {!c.is_active && " · desativado"}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {blockedInactive ? (
                  <span className="text-xs text-muted-foreground">Pede a um admin/manager para reativar «{c.name}».</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onUse(c)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {c.is_active ? `Usar «${c.name}»` : `Reativar e usar «${c.name}»`}
                  </button>
                )}
                {c.is_active && onAppendIban && canAppendIban?.(c) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAppendIban(c)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Acrescentar o IBAN a «{c.name}»
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!nifBlock && (
        <button
          type="button"
          disabled={busy}
          onClick={onCreateAnyway}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          É outra entidade — criar mesmo assim
        </button>
      )}
    </div>
  );
}

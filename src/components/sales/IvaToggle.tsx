/**
 * Chips "Com IVA" / "Sem IVA" do BI de Vendas.
 * O estado vive no search param ?iva=0 para ser partilhado pelos três ecrãs.
 */
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function useIvaMode() {
  const [params, setParams] = useSearchParams();
  const withIva = params.get("iva") !== "0";
  const setWithIva = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.delete("iva");
    else next.set("iva", "0");
    setParams(next, { replace: true });
  };
  /** Sufixo a acrescentar a URLs de navegação para manter o modo. */
  const ivaSuffix = withIva ? "" : "?iva=0";
  return { withIva, setWithIva, ivaSuffix };
}

export function IvaToggle({ withIva, onChange }: { withIva: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={withIva ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => onChange(true)}
        >
          Com IVA
        </Button>
        <Button
          size="sm"
          variant={!withIva ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => onChange(false)}
        >
          Sem IVA
        </Button>
      </div>
      {!withIva ? (
        <p className="text-[11px] text-warning">
          Sem IVA não é receita líquida — faltam as comissões de bilheteira e sala, que vivem no fecho do evento.
        </p>
      ) : null}
    </div>
  );
}

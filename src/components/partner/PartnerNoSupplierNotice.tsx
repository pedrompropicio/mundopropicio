import { Card } from "@/components/ui/card";

/**
 * Aviso único (uma só versão de cada texto) para quando o Portal NÃO pode
 * mostrar números do sócio. Números de um sócio só existem quando há um sócio e
 * quando existe prestação de contas do servidor: sem isso não se mostra nem um
 * valor, nem cards, e nunca se assume uma base de apuramento por defeito
 * (decisão do CEO).
 *
 * Motivos:
 * - `no_supplier`  — a conta autenticada não está ligada a nenhum sócio.
 * - `no_statement` — há sócio, mas o evento ainda não tem fechamento com ele
 *                    (ou o sócio não tem acesso concedido a este evento).
 * - `error`        — falha técnica ao obter a prestação de contas.
 */
export type PartnerNoticeReason = "no_supplier" | "no_statement" | "error";

export function PartnerNoSupplierNotice({
  isLoading = false,
  reason = "no_supplier",
}: {
  isLoading?: boolean;
  reason?: PartnerNoticeReason;
}) {
  return (
    <Card className="p-8 text-center max-w-2xl mx-auto space-y-2">
      {isLoading ? (
        <p className="text-muted-foreground">A carregar a prestação de contas…</p>
      ) : reason === "no_supplier" ? (
        <>
          <p className="font-semibold">Esta conta não está ligada a nenhum sócio.</p>
          <p className="text-sm text-muted-foreground">
            Sem essa ligação não é possível apresentar valores deste evento, porque a base de
            apuramento das despesas depende do contrato do sócio. Pede ao administrador para
            fazer a ligação no evento, em <span className="font-medium">Acesso de Parceiros</span>.
          </p>
        </>
      ) : reason === "no_statement" ? (
        <>
          <p className="font-semibold">Este evento ainda não tem prestação de contas para o seu sócio.</p>
          <p className="text-sm text-muted-foreground">
            Ou a conta ainda não está ligada a um sócio, ou o evento ainda não tem um fechamento
            que inclua esse sócio. Enquanto isso não existir, não se mostram valores de receitas,
            despesas nem resultado. Pede ao administrador para ligar a conta ao sócio e incluí-lo
            no fechamento do evento, em <span className="font-medium">Acesso de Parceiros</span>.
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold">Não foi possível obter a prestação de contas.</p>
          <p className="text-sm text-muted-foreground">
            Houve uma falha técnica ao pedir os valores deste evento. Para não mostrar números
            errados, não se apresentam receitas, despesas nem resultado. O problema ficou
            registado — tenta novamente mais tarde ou avisa o administrador.
          </p>
        </>
      )}
    </Card>
  );
}

export default PartnerNoSupplierNotice;

import { Card } from "@/components/ui/card";

/**
 * Aviso único (uma só versão do texto) para quando a conta autenticada não está
 * ligada a nenhum sócio. Números de um sócio só existem quando há um sócio: sem
 * identidade resolvida não se mostra nem um valor, nem cards, e nunca se assume
 * uma base de apuramento por defeito (decisão do CEO).
 */
export function PartnerNoSupplierNotice({ isLoading = false }: { isLoading?: boolean }) {
  return (
    <Card className="p-8 text-center max-w-2xl mx-auto space-y-2">
      {isLoading ? (
        <p className="text-muted-foreground">A identificar o sócio…</p>
      ) : (
        <>
          <p className="font-semibold">Esta conta não está ligada a nenhum sócio.</p>
          <p className="text-sm text-muted-foreground">
            Sem essa ligação não é possível apresentar valores deste evento, porque a base de
            apuramento das despesas depende do contrato do sócio. Pede ao administrador para
            fazer a ligação no evento, em <span className="font-medium">Acesso de Parceiros</span>.
          </p>
        </>
      )}
    </Card>
  );
}

export default PartnerNoSupplierNotice;

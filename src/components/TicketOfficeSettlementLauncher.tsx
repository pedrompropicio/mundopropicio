import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import HelpTooltip from "@/components/HelpTooltip";
import { TicketOfficeSettlementModal } from "@/components/TicketOfficeSettlementModal";

interface TicketOffice {
  id: string;
  name: string;
}

/**
 * Botão e seletor de bilheteira que abre o modal de fecho de bilheteira.
 * Usado em locais onde não existe uma bilheteira já contextualizada (ex.: página de Transações).
 */
export function TicketOfficeSettlementLauncher() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<TicketOffice | null>(null);

  const { data: offices = [], isLoading } = useQuery({
    queryKey: ["ticket-offices-for-settlement-launcher"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("type", "ticket_office")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TicketOffice[];
    },
    enabled: pickerOpen,
  });

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Receipt className="h-4 w-4" />
        <span className="hidden sm:inline">Fecho de Bilheteira</span>
        <HelpTooltip text="Iniciar fecho de uma bilheteira por evento" size={13} />
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar bilheteira</DialogTitle>
            <DialogDescription>
              Escolha a bilheteira para iniciar o fecho por evento.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : offices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Não existem bilheteiras ativas.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {offices.map((office) => (
                <button
                  key={office.id}
                  onClick={() => {
                    setSelectedOffice(office);
                    setPickerOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-left transition-colors hover:bg-muted hover:border-primary/50"
                >
                  <span>{office.name}</span>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedOffice && (
        <TicketOfficeSettlementModal
          open={!!selectedOffice}
          onClose={() => setSelectedOffice(null)}
          officeId={selectedOffice.id}
          officeName={selectedOffice.name}
        />
      )}
    </>
  );
}

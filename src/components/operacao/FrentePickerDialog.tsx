import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  title?: string;
  onPick: (frenteId: string) => void;
  onClose: () => void;
}

export function FrentePickerDialog({ title = "Escolhe a Zona/Serviço", onPick, onClose }: Props) {
  const { user } = useAuth();
  const { data: frentes } = useQuery({
    queryKey: ["op-picker-frentes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: team } = await supabase.from("operacao_frente_team")
        .select("frente_id").eq("profile_id", user!.id).eq("active", true);
      const ids = Array.from(new Set((team ?? []).map((t: any) => t.frente_id)));
      if (ids.length === 0) return [];
      const { data } = await supabase.from("operacao_frentes")
        .select("id,name,color,event_id, events(name)").in("id", ids).order("display_order");
      return data ?? [];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {(frentes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Sem frentes disponíveis.</p>
          )}
          {(frentes ?? []).map((f: any) => (
            <Button key={f.id} variant="outline" className="w-full justify-start gap-3"
              onClick={() => onPick(f.id)}>
              <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: f.color ?? "#6b7280" }} />
              <span className="flex-1 text-left">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.events?.name}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { validateComboLotAgainstCapacity } from "@/lib/combo-capacity";

export interface ComboPass {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  benefits: string | null;
  applies_to_days: number;
  display_order: number;
  version_id: string | null;
  zones: { id: string; zone_id: string }[];
  lots: ComboPassLot[];
}

export interface ComboPassLot {
  id: string;
  combo_pass_id: string;
  lot_number: number;
  name: string;
  quantity: number;
  price: number;
  iva_rate: number;
  lot_type: string;
  version_id: string | null;
}

export function useEventComboPasses(eventId: string | undefined, versionId: string | null = null) {
  const queryClient = useQueryClient();

  const queryKey = ["event_combo_passes", eventId, versionId ?? "active"];

  const { data: passes = [], isLoading } = useQuery<ComboPass[]>({
    queryKey,
    queryFn: async () => {
      if (!eventId) return [];
      let q = supabase
        .from("event_combo_passes" as any)
        .select("id, event_id, name, description, benefits, applies_to_days, display_order, version_id")
        .eq("event_id", eventId)
        .order("display_order");
      if (versionId) q = q.eq("version_id", versionId);
      else q = q.is("version_id", null);
      const { data: passRows, error } = await q;
      if (error) throw error;
      const passList = (passRows ?? []) as any[];
      if (passList.length === 0) return [];
      const ids = passList.map((p) => p.id);

      const [{ data: zones }, { data: lots }] = await Promise.all([
        supabase.from("event_combo_pass_zones" as any).select("id, combo_pass_id, zone_id").in("combo_pass_id", ids),
        supabase
          .from("event_combo_pass_lots" as any)
          .select("id, combo_pass_id, lot_number, name, quantity, price, iva_rate, lot_type, version_id")
          .in("combo_pass_id", ids)
          .order("lot_number"),
      ]);

      return passList.map((p) => ({
        ...p,
        zones: ((zones ?? []) as any[]).filter((z) => z.combo_pass_id === p.id),
        lots: ((lots ?? []) as any[]).filter((l) => l.combo_pass_id === p.id && (versionId ? l.version_id === versionId : l.version_id == null)),
      })) as ComboPass[];
    },
    enabled: !!eventId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createPass = useMutation({
    mutationFn: async (input: { name: string; applies_to_days: number; benefits?: string; description?: string; zoneIds: string[] }) => {
      if (!eventId) throw new Error("event missing");
      const { data: pass, error } = await supabase
        .from("event_combo_passes" as any)
        .insert({
          event_id: eventId,
          name: input.name,
          description: input.description ?? null,
          benefits: input.benefits ?? null,
          applies_to_days: input.applies_to_days,
          display_order: passes.length,
          version_id: versionId,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      const passId = (pass as any).id;
      if (input.zoneIds.length > 0) {
        const { error: zErr } = await supabase
          .from("event_combo_pass_zones" as any)
          .insert(input.zoneIds.map((z) => ({ combo_pass_id: passId, zone_id: z })) as any);
        if (zErr) throw zErr;
      }
      return passId;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Combo/Passe criado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updatePass = useMutation({
    mutationFn: async (input: { id: string; name?: string; applies_to_days?: number; benefits?: string | null; description?: string | null; zoneIds?: string[] }) => {
      const patch: any = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.applies_to_days !== undefined) patch.applies_to_days = input.applies_to_days;
      if (input.benefits !== undefined) patch.benefits = input.benefits;
      if (input.description !== undefined) patch.description = input.description;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("event_combo_passes" as any).update(patch).eq("id", input.id);
        if (error) throw error;
      }
      if (input.zoneIds) {
        await supabase.from("event_combo_pass_zones" as any).delete().eq("combo_pass_id", input.id);
        if (input.zoneIds.length > 0) {
          const { error: zErr } = await supabase
            .from("event_combo_pass_zones" as any)
            .insert(input.zoneIds.map((z) => ({ combo_pass_id: input.id, zone_id: z })) as any);
          if (zErr) throw zErr;
        }
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Combo/Passe atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deletePass = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_combo_passes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Combo/Passe eliminado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const saveLot = useMutation({
    mutationFn: async (input: {
      id?: string;
      combo_pass_id: string;
      name: string;
      quantity: number;
      price: number;
      iva_rate: number;
      lot_type: string;
    }) => {
      const pass = passes.find((p) => p.id === input.combo_pass_id);
      const nextLotNumber = input.id
        ? pass?.lots.find((l) => l.id === input.id)?.lot_number ?? 1
        : (pass?.lots.length ?? 0) + 1;
      const payload: any = {
        combo_pass_id: input.combo_pass_id,
        lot_number: nextLotNumber,
        name: input.name,
        quantity: input.quantity,
        price: input.price,
        iva_rate: input.iva_rate,
        lot_type: input.lot_type,
        version_id: versionId,
      };
      if (input.id) {
        const { error } = await supabase.from("event_combo_pass_lots" as any).update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_combo_pass_lots" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Lote do Combo guardado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteLot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_combo_pass_lots" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Lote eliminado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return { passes, isLoading, createPass, updatePass, deletePass, saveLot, deleteLot };
}

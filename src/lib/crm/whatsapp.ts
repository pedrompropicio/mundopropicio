import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

export function whatsappSourceLabel(source: string | null | undefined): string {
  if (source === "club_profile_whatsapp-v1") return "Perfil Clube · WhatsApp v1";
  if (source === "form_legacy_sem_prova") return "Formulário antigo · sem prova";
  return "—";
}

/** Re-evaluate at export time; missing permission/network response fails closed. */
export async function eligibleWhatsappIds(): Promise<Set<string>> {
  const { data, error } = await fetchAllPagedQuery(
    (supabase as any).from("crm_whatsapp_eligible_contacts").select("id").order("id"),
    { maxRows: 200000 },
  );
  if (error) throw error;
  return new Set((data ?? []).map((row: any) => row.id as string));
}

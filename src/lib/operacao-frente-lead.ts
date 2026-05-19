import { supabase } from "@/integrations/supabase/client";

/**
 * Atribui (ou remove) o Produtor responsável de uma Frente.
 * Mantém em sincronia:
 *  - operacao_frentes.current_lead_id
 *  - operacao_frente_team (is_permanent_lead, active, role_in_frente='lead')
 *
 * Schema: UNIQUE(frente_id, profile_id) → upsert por par.
 */
export async function setFrenteLead({
  frenteId, profileId, companyId,
}: {
  frenteId: string;
  profileId: string | null;
  companyId: string;
}): Promise<{ error?: string }> {
  const { error: uErr } = await supabase
    .from("operacao_frentes")
    .update({ current_lead_id: profileId })
    .eq("id", frenteId);
  if (uErr) return { error: uErr.message };

  // limpar flag de outros leads permanentes desta frente
  const clearQuery = supabase
    .from("operacao_frente_team")
    .update({ is_permanent_lead: false })
    .eq("frente_id", frenteId);
  const { error: cErr } = await (profileId
    ? clearQuery.neq("profile_id", profileId)
    : clearQuery);
  if (cErr) return { error: cErr.message };

  if (profileId) {
    const { data: existing } = await supabase
      .from("operacao_frente_team")
      .select("id")
      .eq("frente_id", frenteId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from("operacao_frente_team")
        .update({ is_permanent_lead: true, active: true, role_in_frente: "lead" })
        .eq("id", existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("operacao_frente_team").insert({
        frente_id: frenteId,
        profile_id: profileId,
        company_id: companyId,
        role_in_frente: "lead",
        is_permanent_lead: true,
        active: true,
      });
      if (error) return { error: error.message };
    }
  }
  return {};
}

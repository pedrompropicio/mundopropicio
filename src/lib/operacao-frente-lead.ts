import { supabase } from "@/integrations/supabase/client";

/**
 * Atribui (ou remove) o Produtor PRIMÁRIO de uma Frente.
 * Compat: substitui o primário único anterior. Mantém em sincronia:
 *  - operacao_frentes.current_lead_id
 *  - operacao_frente_team (is_permanent_lead, active, role_in_frente='lead')
 *
 * Para fluxos multi-produtor preferir addFrenteLead/removeFrenteLead/setPrimaryLead.
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

/**
 * Adiciona um produtor à frente (lead permanente activo).
 * Idempotente: se já existir row para o perfil, promove a lead permanente activo.
 * Não toca em current_lead_id — o trigger DB só promove a primário se a frente
 * ainda não tiver primário válido.
 */
export async function addFrenteLead({
  frenteId, profileId, companyId,
}: {
  frenteId: string;
  profileId: string;
  companyId: string;
}): Promise<{ error?: string }> {
  const { data: existing } = await supabase
    .from("operacao_frente_team")
    .select("id")
    .eq("frente_id", frenteId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("operacao_frente_team")
      .update({ role_in_frente: "lead", is_permanent_lead: true, active: true })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    return {};
  }

  const { error } = await supabase.from("operacao_frente_team").insert({
    frente_id: frenteId,
    profile_id: profileId,
    company_id: companyId,
    role_in_frente: "lead",
    is_permanent_lead: true,
    active: true,
  });
  if (error) return { error: error.message };
  return {};
}

/**
 * Remove um produtor: rebaixa para 'auxiliary' (mantém na frente como auxiliar)
 * e desmarca is_permanent_lead. Se o perfil removido era o current_lead_id,
 * promove outro lead permanente da frente (mais antigo) — ou NULL se não houver.
 */
export async function removeFrenteLead({
  frenteId, profileId,
}: {
  frenteId: string;
  profileId: string;
}): Promise<{ error?: string }> {
  const { error: uErr } = await supabase
    .from("operacao_frente_team")
    .update({ role_in_frente: "auxiliary", is_permanent_lead: false })
    .eq("frente_id", frenteId)
    .eq("profile_id", profileId);
  if (uErr) return { error: uErr.message };

  // Verificar se era o primário
  const { data: frente } = await supabase
    .from("operacao_frentes")
    .select("current_lead_id")
    .eq("id", frenteId)
    .maybeSingle();
  if (frente?.current_lead_id !== profileId) return {};

  // Procurar substituto: outro lead permanente activo (mais antigo)
  const { data: candidates } = await supabase
    .from("operacao_frente_team")
    .select("profile_id, assigned_at")
    .eq("frente_id", frenteId)
    .eq("role_in_frente", "lead")
    .eq("is_permanent_lead", true)
    .eq("active", true)
    .order("assigned_at", { ascending: true })
    .limit(1);

  const nextPrimary = candidates?.[0]?.profile_id ?? null;
  const { error: pErr } = await supabase
    .from("operacao_frentes")
    .update({ current_lead_id: nextPrimary })
    .eq("id", frenteId);
  if (pErr) return { error: pErr.message };
  return {};
}

/**
 * Define qual produtor é o primário (escreve current_lead_id directamente).
 * Não mexe nas rows do team — assume-se que o perfil já está no team como lead.
 */
export async function setPrimaryLead({
  frenteId, profileId,
}: {
  frenteId: string;
  profileId: string | null;
}): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("operacao_frentes")
    .update({ current_lead_id: profileId })
    .eq("id", frenteId);
  if (error) return { error: error.message };
  return {};

/**
 * Associa um perfil a uma frente como AUXILIAR (role_in_frente='auxiliary').
 * Idempotente: se já existir row, rebaixa para auxiliar (mantém active=true).
 */
export async function addFrenteAuxiliary({
  frenteId, profileId, companyId,
}: {
  frenteId: string;
  profileId: string;
  companyId: string;
}): Promise<{ error?: string }> {
  const { data: existing } = await supabase
    .from("operacao_frente_team")
    .select("id, role_in_frente, is_permanent_lead")
    .eq("frente_id", frenteId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existing?.id) {
    // Se era lead primário, ao rebaixar precisa libertar current_lead_id também
    const { data: frente } = await supabase
      .from("operacao_frentes")
      .select("current_lead_id")
      .eq("id", frenteId)
      .maybeSingle();
    const wasPrimary = frente?.current_lead_id === profileId;
    const { error } = await supabase
      .from("operacao_frente_team")
      .update({ role_in_frente: "auxiliary", is_permanent_lead: false, active: true })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    if (wasPrimary) {
      await supabase.from("operacao_frentes").update({ current_lead_id: null }).eq("id", frenteId);
    }
    return {};
  }

  const { error } = await supabase.from("operacao_frente_team").insert({
    frente_id: frenteId,
    profile_id: profileId,
    company_id: companyId,
    role_in_frente: "auxiliary",
    is_permanent_lead: false,
    active: true,
  });
  if (error) return { error: error.message };
  return {};
}

/**
 * Remove totalmente um auxiliar da frente (DELETE).
 */
export async function removeFrenteAuxiliary({
  frenteId, profileId,
}: {
  frenteId: string;
  profileId: string;
}): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("operacao_frente_team")
    .delete()
    .eq("frente_id", frenteId)
    .eq("profile_id", profileId)
    .eq("role_in_frente", "auxiliary");
  if (error) return { error: error.message };
  return {};
}


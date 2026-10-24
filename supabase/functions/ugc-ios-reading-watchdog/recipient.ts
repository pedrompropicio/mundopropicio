// Resolve o destinatário do alerta a partir de notification_optin (mesma regra
// de enqueue_whatsapp_notification): phone_number E opted_in_at IS NOT NULL E opted_out_at IS NULL.
export type RecipientReason = "sem_perfil" | "sem_optin" | "optout" | "sem_telefone";
export type OptinRow = {
  profile_id: string;
  phone_number: string | null;
  opted_in_at: string | null;
  opted_out_at: string | null;
};
export type RecipientResult =
  | { ok: true; phone: string; profile_id: string }
  | { ok: false; reason: RecipientReason };

export function resolveRecipient(
  cfg: { recipient_profile_id?: string | null },
  optin: OptinRow | null | undefined,
): RecipientResult {
  const profileId = cfg.recipient_profile_id;
  if (!profileId) return { ok: false, reason: "sem_perfil" };
  if (!optin || optin.profile_id !== profileId) return { ok: false, reason: "sem_optin" };
  if (optin.opted_out_at != null) return { ok: false, reason: "optout" };
  if (optin.opted_in_at == null) return { ok: false, reason: "sem_optin" };
  const phone = (optin.phone_number ?? "").trim();
  if (!phone) return { ok: false, reason: "sem_telefone" };
  return { ok: true, phone, profile_id: profileId };
}

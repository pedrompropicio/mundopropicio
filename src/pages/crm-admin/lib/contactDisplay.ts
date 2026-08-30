/**
 * Apresentação de contactos no MP CRM.
 * O nome é opcional; o email (ou telefone) é o identificador que existe sempre.
 * Quando não há nome, o email passa a ser a linha principal e não há subtítulo.
 */
export interface ContactLike {
  name?: string | null;
  email?: string | null;
  phone_e164?: string | null;
}

export function contactPrimaryLabel(c: ContactLike | null | undefined): string {
  const name = c?.name?.trim();
  if (name) return name;
  return c?.email?.trim() || c?.phone_e164?.trim() || "—";
}

/** Subtítulo: só existe quando há nome (email e/ou telefone). Vazio caso contrário. */
export function contactSecondaryLabel(c: ContactLike | null | undefined): string {
  const name = c?.name?.trim();
  const email = c?.email?.trim();
  const phone = c?.phone_e164?.trim();
  const parts: string[] = [];
  if (name) {
    if (email) parts.push(email);
    if (phone) parts.push(phone);
  } else if (email && phone) {
    // email já é a linha principal; sobra o telefone
    parts.push(phone);
  }
  return parts.join(" · ");
}

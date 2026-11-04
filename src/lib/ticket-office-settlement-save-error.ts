export function settlementSaveErrorMessage(err: { code?: string; message: string }): string {
  if (
    err.code === "23505" &&
    (err.message.includes("ux_settlements_office_event_active") ||
      err.message.includes("ux_settlements_office_event_confirmed"))
  ) {
    return "Fecho não gravado (nada foi alterado): já existe um fecho deste evento nesta bilheteira (rascunho ou confirmado). Abra-o pelo ícone do evento.";
  }
  return `Fecho não gravado (nada foi alterado): ${err.message}`;
}

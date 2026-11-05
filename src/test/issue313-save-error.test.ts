import { describe, expect, it } from "vitest";
import { settlementSaveErrorMessage } from "@/lib/ticket-office-settlement-save-error";

describe("#313 — mensagem de erro ao guardar o fecho", () => {
  it.each([
    "ux_settlements_office_event_active",
    "ux_settlements_office_event_confirmed",
  ])("explica o conflito 23505 do índice %s", (index) => {
    expect(settlementSaveErrorMessage({
      code: "23505",
      message: `duplicate key value violates unique constraint "${index}"`,
    })).toBe("Fecho não gravado (nada foi alterado): já existe um fecho deste evento nesta bilheteira (rascunho ou confirmado). Abra-o pelo ícone do evento.");
  });

  it.each([
    { code: "23505", message: 'duplicate key value violates unique constraint "outro_indice"' },
    { code: "42501", message: "Bilheteira de outra empresa" },
    { message: "Erro genérico: ação recusada.\nDetalhe com acentos e espaços  " },
    { code: "P0001", message: "ux_settlements_office_event_active" },
    { message: "ux_settlements_office_event_confirmed" },
    { code: "23505", message: "" },
  ])("preserva byte a byte o texto anterior para $message", (err) => {
    expect(settlementSaveErrorMessage(err)).toBe(`Fecho não gravado (nada foi alterado): ${err.message}`);
  });
});

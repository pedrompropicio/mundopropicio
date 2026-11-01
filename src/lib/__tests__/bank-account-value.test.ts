import { describe, it, expect } from "vitest";
import { classifyBankAccountValue, blocksSubmit, bankAccountValueToStore } from "../bank-account-value";
import { normalizeIban } from "../iban";

const PT_VALIDO = "PT50 0002 0123 1234 5678 9015 4";
const PT_CHECKSUM_ERRADO = "PT50 0002 0123 1234 5678 9015 5";

describe("classifyBankAccountValue", () => {
  it("IBAN PT válido → iban_valido", () => {
    expect(classifyBankAccountValue(PT_VALIDO)).toBe("iban_valido");
  });
  it("IBAN com forma de IBAN e checksum errado → iban_invalido", () => {
    expect(classifyBankAccountValue(PT_CHECKSUM_ERRADO)).toBe("iban_invalido");
  });
  it("ABA + conta (EUA) → nao_iban", () => {
    expect(classifyBankAccountValue("021000021 / 1234567890")).toBe("nao_iban");
  });
  it("banco/agência/conta (BR) → nao_iban", () => {
    expect(classifyBankAccountValue("001 1234-5 12345-6")).toBe("nao_iban");
  });
  it("vazio / só espaços / null → vazio", () => {
    expect(classifyBankAccountValue("")).toBe("vazio");
    expect(classifyBankAccountValue("   ")).toBe("vazio");
    expect(classifyBankAccountValue(null)).toBe("vazio");
    expect(classifyBankAccountValue(undefined)).toBe("vazio");
  });
});

describe("decisão de submit do SupplierFormModal", () => {
  it("iban_invalido bloqueia", () => {
    expect(blocksSubmit(classifyBankAccountValue(PT_CHECKSUM_ERRADO))).toBe(true);
  });
  it("nao_iban, iban_valido e vazio não bloqueiam", () => {
    expect(blocksSubmit(classifyBankAccountValue("021000021 / 1234567890"))).toBe(false);
    expect(blocksSubmit(classifyBankAccountValue("001 1234-5 12345-6"))).toBe(false);
    expect(blocksSubmit(classifyBankAccountValue(PT_VALIDO))).toBe(false);
    expect(blocksSubmit(classifyBankAccountValue(""))).toBe(false);
  });
});

describe("bankAccountValueToStore", () => {
  it("não-IBAN guarda-se tal e qual (só trim)", () => {
    expect(bankAccountValueToStore("  021000021 / 1234567890 ", normalizeIban)).toBe("021000021 / 1234567890");
    expect(bankAccountValueToStore("001 1234-5 12345-6", normalizeIban)).toBe("001 1234-5 12345-6");
  });
  it("IBAN continua normalizado; vazio → null", () => {
    expect(bankAccountValueToStore(PT_VALIDO, normalizeIban)).toBe("PT50000201231234567890154");
    expect(bankAccountValueToStore("  ", normalizeIban)).toBeNull();
  });
});

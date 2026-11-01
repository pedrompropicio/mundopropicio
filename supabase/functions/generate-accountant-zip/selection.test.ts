import { describe, expect, it } from "vitest";
import {
  assertTransactionLimit, assertZipSize, canExportCompany, MAX_BYTES,
  parseTransactionIds, queryableTransactionIds, selectRequestedTransactions, TX_LIMIT_ERROR,
} from "./selection";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const tx = (n: number, company_id = "own", account_id: string | null = "bank") =>
  ({ id: id(n), company_id, account_id });

describe("#395 — seleção exata do ZIP", () => {
  it("distingue ausência de IDs de seleção explicitamente vazia", () => {
    expect(parseTransactionIds(undefined)).toBeUndefined();
    expect(parseTransactionIds([])).toEqual([]);
    expect(selectRequestedTransactions([], [tx(1)], "own", []).transactions).toEqual([]);
  });
  it("recusa listas mal formadas", () => {
    for (const input of [null, id(1), {}, [1], [id(1), null]]) {
      expect(() => parseTransactionIds(input)).toThrow("transaction_ids deve ser uma lista");
    }
  });
  it("ignora IDs inválidos e inexistentes sem enviar texto inválido à query", () => {
    const requested = parseTransactionIds([id(1), "inválido", id(2)]) ?? [];
    expect(queryableTransactionIds(requested)).toEqual([id(1), id(2)]);
    expect(selectRequestedTransactions(requested, [tx(1)], "own", [])).toEqual({
      transactions: [tx(1)], ignored_count: 2,
    });
  });
  it("só inclui IDs pedidos pertencentes à empresa autorizada", () => {
    const result = selectRequestedTransactions([id(1), id(2)], [tx(1), tx(2, "other"), tx(3)], "own", []);
    expect(result.transactions.map((t) => t.id)).toEqual([id(1)]);
    expect(result.ignored_count).toBe(1);
  });
  it("#235 exclui contas não contabilísticas e mantém transações sem conta", () => {
    const result = selectRequestedTransactions([id(1), id(2), id(3)],
      [tx(1), tx(2, "own", "managerial"), tx(3, "own", null)], "own", ["managerial"]);
    expect(result.transactions.map((t) => t.id)).toEqual([id(1), id(3)]);
    expect(result.ignored_count).toBe(1);
  });
  it("não duplica transações e normaliza UUIDs", () => {
    const upper = "AAAAAAAA-0000-0000-0000-000000000001";
    expect(queryableTransactionIds(parseTransactionIds([upper, upper]) ?? [])).toEqual([upper.toLowerCase()]);
    const result = selectRequestedTransactions([id(1), id(1)], [tx(1)], "own", []);
    expect(result.transactions).toHaveLength(1);
    expect(result.ignored_count).toBe(0);
  });
  it("aceita exatamente 500 transações", () => {
    const ids = Array.from({ length: 500 }, (_, i) => id(i));
    expect(parseTransactionIds(ids)).toHaveLength(500);
    expect(() => assertTransactionLimit(500)).not.toThrow();
  });
  it("recusa 501 IDs antes da consulta, com o erro pt-PT existente", () => {
    expect(() => parseTransactionIds(Array.from({ length: 501 }, (_, i) => id(i)))).toThrow(TX_LIMIT_ERROR);
    expect(() => assertTransactionLimit(501)).toThrow(TX_LIMIT_ERROR);
  });
  it("mantém o limite de 200 MB inclusive", () => {
    expect(MAX_BYTES).toBe(200 * 1024 * 1024);
    expect(() => assertZipSize(200 * 1024 * 1024)).not.toThrow();
    expect(() => assertZipSize(200 * 1024 * 1024 + 1)).toThrow("ZIP excederia 200MB. Reduza o período.");
  });
  it("admin/manager/accountant exigem a empresa do chamador", () => {
    for (const role of ["admin", "manager", "accountant"]) {
      expect(canExportCompany([{ role, company_id: "own" }], "own")).toBe(true);
      expect(canExportCompany([{ role, company_id: "other" }], "own")).toBe(false);
    }
  });
  it("mantém platform admin global e recusa perfis não autorizados", () => {
    expect(canExportCompany([{ role: "platform_admin", company_id: null }], "own")).toBe(true);
    expect(canExportCompany([{ role: "editor", company_id: "own" }], "own")).toBe(false);
    expect(canExportCompany([], "own")).toBe(false);
  });
});
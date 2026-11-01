import { describe, it, expect } from "vitest";
import { ALL_PERMISSIONS } from "@/contexts/AuthContext";
import { resolveForCompany } from "@/lib/permissions";
import {
  canShowDeleteDocumentButton,
  DELETE_TRANSACTION_DOCUMENTS,
} from "@/lib/transaction-document-permissions";

describe("delete_transaction_documents em ALL_PERMISSIONS", () => {
  it("existe uma vez, com rótulo e grupo certos", () => {
    const hits = ALL_PERMISSIONS.filter((p) => p.key === "delete_transaction_documents");
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe("Apagar anexos de transações");
    expect(hits[0].group).toBe("Operacional");
  });

  // Os defaults vivem em role_permissions (servidor); aqui valida-se a réplica
  // TS: admin/manager/editor com a permissão, viewer sem, override decide.
  const rolePermissions = {
    admin: [DELETE_TRANSACTION_DOCUMENTS],
    manager: [DELETE_TRANSACTION_DOCUMENTS],
    editor: [DELETE_TRANSACTION_DOCUMENTS],
    viewer: [],
  };
  const universe = ALL_PERMISSIONS.map((p) => p.key);
  const resolve = (role: string, overrides: any[] = []) =>
    resolveForCompany({
      companyId: "A",
      memberships: [{ role, company_id: "A" }],
      overrides,
      rolePermissions,
      universe,
    }).permissions;

  it.each(["admin", "manager", "editor"])("%s tem a permissão por defeito", (r) => {
    expect(resolve(r)).toContain(DELETE_TRANSACTION_DOCUMENTS);
  });
  it("viewer não tem", () => {
    expect(resolve("viewer")).not.toContain(DELETE_TRANSACTION_DOCUMENTS);
  });
  it("override por utilizador/empresa decide (nega ao editor, concede ao viewer)", () => {
    const deny = [{ permission: DELETE_TRANSACTION_DOCUMENTS, granted: false, company_id: "A" }];
    const grant = [{ permission: DELETE_TRANSACTION_DOCUMENTS, granted: true, company_id: "A" }];
    expect(resolve("editor", deny)).not.toContain(DELETE_TRANSACTION_DOCUMENTS);
    expect(resolve("viewer", grant)).toContain(DELETE_TRANSACTION_DOCUMENTS);
  });
});

describe("canShowDeleteDocumentButton", () => {
  it("com a permissão: mostra", () => {
    expect(canShowDeleteDocumentButton({ permissions: [DELETE_TRANSACTION_DOCUMENTS], isPlatformAdmin: false })).toBe(true);
  });
  it("sem a permissão: esconde", () => {
    expect(canShowDeleteDocumentButton({ permissions: ["manage_transactions"], isPlatformAdmin: false })).toBe(false);
  });
  it("platform admin: sempre mostra", () => {
    expect(canShowDeleteDocumentButton({ permissions: [], isPlatformAdmin: true })).toBe(true);
    expect(
      canShowDeleteDocumentButton({ permissions: [], isPlatformAdmin: true, ownerCompanyId: "B", activeCompanyId: "A" }),
    ).toBe(true);
  });
  it("documento de outra empresa que não a activa: esconde", () => {
    expect(
      canShowDeleteDocumentButton({
        permissions: [DELETE_TRANSACTION_DOCUMENTS],
        isPlatformAdmin: false,
        ownerCompanyId: "B",
        activeCompanyId: "A",
      }),
    ).toBe(false);
  });
  it("empresa dona = activa: segue a permissão", () => {
    expect(
      canShowDeleteDocumentButton({
        permissions: [DELETE_TRANSACTION_DOCUMENTS],
        isPlatformAdmin: false,
        ownerCompanyId: "A",
        activeCompanyId: "A",
      }),
    ).toBe(true);
  });
});

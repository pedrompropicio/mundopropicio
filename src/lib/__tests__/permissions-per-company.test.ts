import { describe, it, expect, vi } from "vitest";
import {
  resolveForCompany,
  notifyActiveCompanyChanged,
  onActiveCompanyChanged,
  parseEffectivePermissions,
} from "@/lib/permissions";

const MP = "mp", COALA = "coala";
const RP: Record<string, string[]> = {
  editor: ["module.erp", "manage_transactions"],
  producer: ["module.operacao", "manage_operacao_staff"],
  manager: ["module.erp", "module.operacao", "settings.bp_tools"],
  platform_admin: ["view_operacao"],
};
const UNIVERSE = ["module.erp", "module.crm", "module.audience", "manage_bp", "view_bp"];

describe("#311 F2a — permissões pela empresa activa", () => {
  it("(a) papéis em 2 empresas: vale o papel da empresa activa", () => {
    const memberships = [{ role: "editor", company_id: MP }, { role: "producer", company_id: COALA }];
    const mp = resolveForCompany({ companyId: MP, memberships, overrides: [], rolePermissions: RP, universe: UNIVERSE });
    const coala = resolveForCompany({ companyId: COALA, memberships, overrides: [], rolePermissions: RP, universe: UNIVERSE });
    expect(mp.role).toBe("editor");
    expect(mp.permissions).not.toContain("manage_operacao_staff");
    expect(coala.role).toBe("producer");
    expect(coala.permissions).not.toContain("manage_transactions");
  });

  it("(b) platform_admin com excepção negada não tem essa chave", () => {
    const out = resolveForCompany({
      companyId: COALA,
      memberships: [{ role: "platform_admin", company_id: MP }],
      overrides: [{ company_id: COALA, permission: "manage_bp", granted: false }],
      rolePermissions: RP, universe: UNIVERSE,
    });
    expect(out.role).toBe("platform_admin");
    expect(out.permissions).toContain("module.crm");
    expect(out.permissions).not.toContain("manage_bp");
  });

  it("(c) manager sem excepção não tem module.crm; com excepção tem", () => {
    const memberships = [{ role: "manager", company_id: MP }];
    const sem = resolveForCompany({ companyId: MP, memberships, overrides: [], rolePermissions: RP, universe: UNIVERSE });
    const com = resolveForCompany({
      companyId: MP, memberships, rolePermissions: RP, universe: UNIVERSE,
      overrides: [{ company_id: MP, permission: "module.crm", granted: true }],
    });
    expect(sem.permissions).not.toContain("module.crm");
    expect(com.permissions).toContain("module.crm");
  });

  it("(d) troca de empresa dispara o recarregamento", () => {
    const reload = vi.fn();
    const off = onActiveCompanyChanged(reload);
    notifyActiveCompanyChanged(COALA);
    expect(reload).toHaveBeenCalledWith(COALA);
    off();
    notifyActiveCompanyChanged(MP);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("lê o resultado da RPC my_effective_permissions", () => {
    expect(parseEffectivePermissions({ role: "manager", permissions: ["a"] })).toEqual({ role: "manager", permissions: ["a"] });
    expect(parseEffectivePermissions(null)).toEqual({ role: "user", permissions: [] });
  });
});

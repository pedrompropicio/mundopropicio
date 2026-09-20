import { describe, it, expect } from "vitest";
import { resolveEffectivePermissions, hasFullAccessRole } from "@/lib/permissions";

const ALL = ["manage_bp", "manage_events", "view_reports"];

describe("resolveEffectivePermissions (#105)", () => {
  it("admin parte de todas as permissões", () => {
    const out = resolveEffectivePermissions({
      roles: ["admin"], rolePermissions: [], overrides: [], allPermissions: ALL,
    });
    expect(out.sort()).toEqual([...ALL].sort());
  });

  it("override negado retira a permissão ao admin", () => {
    const out = resolveEffectivePermissions({
      roles: ["admin"],
      rolePermissions: [],
      overrides: [{ permission: "manage_bp", granted: false }],
      allPermissions: ALL,
    });
    expect(out).not.toContain("manage_bp");
    expect(out).toContain("manage_events");
  });

  it("override negado retira também ao platform_admin", () => {
    const out = resolveEffectivePermissions({
      roles: ["platform_admin", "admin"],
      rolePermissions: [],
      overrides: [{ permission: "view_reports", granted: false }],
      allPermissions: ALL,
    });
    expect(out).not.toContain("view_reports");
  });

  it("não-admin: role_permissions como base, override concede e nega", () => {
    const out = resolveEffectivePermissions({
      roles: ["viewer"],
      rolePermissions: ["view_reports", "manage_events"],
      overrides: [
        { permission: "manage_events", granted: false },
        { permission: "manage_bp", granted: true },
      ],
      allPermissions: ALL,
    });
    expect(out.sort()).toEqual(["manage_bp", "view_reports"]);
  });

  it("hasFullAccessRole", () => {
    expect(hasFullAccessRole(["viewer"])).toBe(false);
    expect(hasFullAccessRole(["viewer", "platform_admin"])).toBe(true);
  });
});

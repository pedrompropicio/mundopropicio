import { describe, expect, it } from "vitest";
import {
  canAutoReload,
  decideInitialAuthMode,
  mapUpdateUserError,
  missingPasswordRules,
} from "./passwordRecovery";

describe("mapUpdateUserError", () => {
  it("senha fraca", () => {
    expect(mapUpdateUserError({ code: "weak_password", message: "Password should contain..." })).toMatch(/demasiado fraca/);
  });
  it("igual à anterior", () => {
    expect(
      mapUpdateUserError({ code: "same_password", message: "New password should be different from the old password." }),
    ).toMatch(/diferente da senha anterior/);
  });
  it("comprometida (HIBP)", () => {
    expect(
      mapUpdateUserError({ code: "weak_password", message: "Password is known to be weak", reasons: ["pwned"] }),
    ).toMatch(/fugas de dados/);
  });
  it("sessão expirada", () => {
    expect(mapUpdateUserError({ message: "Auth session missing!" })).toMatch(/sessão de recuperação expirou/);
  });
  it("genérica", () => {
    expect(mapUpdateUserError({ message: "boom" })).toMatch(/Não foi possível guardar/);
  });
});

describe("decideInitialAuthMode", () => {
  it("flag + sessão → new-password", () => {
    expect(decideInitialAuthMode({ recoveryInProgress: true, hasSession: true })).toEqual({ mode: "new-password", clearFlag: false });
  });
  it("flag sem sessão → login e limpa flag", () => {
    expect(decideInitialAuthMode({ recoveryInProgress: true, hasSession: false })).toEqual({ mode: "login", clearFlag: true });
  });
  it("sem flag → login", () => {
    expect(decideInitialAuthMode({ recoveryInProgress: false, hasSession: true })).toEqual({ mode: "login", clearFlag: false });
  });
});

describe("canAutoReload (PWAUpdateManager)", () => {
  it("não recarrega com recovery_in_progress activo", () => {
    expect(canAutoReload({ isBusy: false, recoveryInProgress: true })).toBe(false);
  });
  it("recarrega quando livre e sem recuperação", () => {
    expect(canAutoReload({ isBusy: false, recoveryInProgress: false })).toBe(true);
  });
  it("não recarrega se ocupado", () => {
    expect(canAutoReload({ isBusy: true, recoveryInProgress: false })).toBe(false);
  });
});

describe("missingPasswordRules", () => {
  it("lista o que falta", () => {
    expect(missingPasswordRules("abc")).toHaveLength(4);
    expect(missingPasswordRules("Abcdef1!")).toEqual([]);
  });
});

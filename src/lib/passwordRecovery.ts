import { PASSWORD_RULES } from "@/components/PasswordStrengthIndicator";

export const RECOVERY_FLAG_KEY = "recovery_in_progress";

export type AuthMode = "login" | "forgot" | "otp" | "new-password" | "mfa";

export interface InitialAuthModeInput {
  recoveryInProgress: boolean;
  hasSession: boolean;
}

export interface InitialAuthModeDecision {
  mode: Extract<AuthMode, "login" | "new-password">;
  /** true → o flag `recovery_in_progress` é órfão (sem sessão) e deve ser limpo. */
  clearFlag: boolean;
}

/** Decide o modo inicial do ecrã /login a partir do flag de recuperação e da sessão. */
export function decideInitialAuthMode(input: InitialAuthModeInput): InitialAuthModeDecision {
  if (input.recoveryInProgress && input.hasSession) return { mode: "new-password", clearFlag: false };
  if (input.recoveryInProgress && !input.hasSession) return { mode: "login", clearFlag: true };
  return { mode: "login", clearFlag: false };
}

interface UpdateUserErrorLike {
  message?: string | null;
  code?: string | null;
  name?: string | null;
  reasons?: string[] | null;
}

/** Traduz erros do `supabase.auth.updateUser({ password })` para pt-PT. */
export function mapUpdateUserError(error: UpdateUserErrorLike | null | undefined): string {
  const code = (error?.code ?? "").toLowerCase();
  const msg = (error?.message ?? "").toLowerCase();
  const reasons = (error?.reasons ?? []).map((r) => r.toLowerCase());

  if (
    reasons.includes("pwned") ||
    /pwned|compromis|breach|data leak|known to be weak|easy to guess/.test(msg)
  ) {
    return "Esta senha apareceu em fugas de dados conhecidas. Escolha outra senha, mais única.";
  }
  if (code === "same_password" || /different from the old|same as the old|same password/.test(msg)) {
    return "A nova senha tem de ser diferente da senha anterior.";
  }
  if (
    code === "session_not_found" ||
    code === "session_expired" ||
    code === "refresh_token_not_found" ||
    /session missing|session.*(expired|not found)|jwt expired|not authenticated|invalid jwt/.test(msg)
  ) {
    return "A sessão de recuperação expirou. Volte ao login e peça um novo código.";
  }
  if (code === "weak_password" || /weak|should contain|at least \d+ char|too short/.test(msg)) {
    return "A senha é demasiado fraca. Use 8 ou mais caracteres, com maiúscula, número e carácter especial.";
  }
  return "Não foi possível guardar a nova senha. Tente novamente ou peça um novo código.";
}

/** Regras locais de senha ainda por cumprir (labels pt-PT). */
export function missingPasswordRules(password: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
}

/** Pode recarregar automaticamente? Nunca com ocupação ou recuperação de senha activa. */
export function canAutoReload(state: { isBusy: boolean; recoveryInProgress: boolean }): boolean {
  return !state.isBusy && !state.recoveryInProgress;
}

export function isRecoveryInProgress(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

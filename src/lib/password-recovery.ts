import type { EmailOtpType } from "@supabase/supabase-js";

export type RecoveryParams = {
  code: string | null;
  tokenHash: string | null;
  type: EmailOtpType | null;
  accessToken: string | null;
  refreshToken: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

export function getRecoveryParams(): RecoveryParams {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  const getParam = (key: string) => queryParams.get(key) ?? hashParams.get(key);

  return {
    code: getParam("code"),
    tokenHash: getParam("token_hash"),
    type: getParam("type") as EmailOtpType | null,
    accessToken: getParam("access_token"),
    refreshToken: getParam("refresh_token"),
    errorCode: getParam("error_code"),
    errorDescription: getParam("error_description"),
  };
}

export function clearRecoveryParams() {
  window.history.replaceState({}, document.title, "/reset-password");
}

export function mapRecoveryError(message?: string | null) {
  const normalized = String(message ?? "").toLowerCase();

  if (/code verifier|both auth code and code verifier|auth code/i.test(normalized)) {
    return "Abra o link no mesmo browser e dispositivo onde pediu a recuperação da senha.";
  }

  if (/expired|invalid|otp|one-time token not found|email link is invalid/i.test(normalized)) {
    return "O link de recuperação expirou, já foi usado, ou ficou inválido. Solicite um novo link.";
  }

  if (/timeout|demor|timed out/i.test(normalized)) {
    return "A validação do link demorou demasiado. Abra novamente o link no mesmo browser ou solicite um novo.";
  }

  return "Não foi possível validar o link de recuperação. Solicite um novo link.";
}

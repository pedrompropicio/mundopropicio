import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "mp_mfa_trusted_token";

/** SHA-256 hex digest of an arbitrary string (browser native). */
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a cryptographically random opaque token. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Friendly device label from UA. */
function detectLabel(): string {
  const ua = navigator.userAgent;
  let os = "Desconhecido";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS/i.test(ua)) os = "Mac";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  return `${browser} · ${os}`;
}

/** Check if current device is trusted (skip TOTP). */
export async function isCurrentDeviceTrusted(): Promise<boolean> {
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) return false;
  try {
    const hash = await sha256Hex(token);
    const { data, error } = await supabase.rpc("validate_trusted_device", { _token_hash: hash });
    if (error || !data) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Persist current device as trusted for 30 days. */
export async function trustCurrentDevice(): Promise<void> {
  const token = generateToken();
  const hash = await sha256Hex(token);
  const { error } = await supabase.from("mfa_trusted_devices").insert({
    user_id: (await supabase.auth.getUser()).data.user?.id!,
    device_token_hash: hash,
    device_label: detectLabel(),
    user_agent: navigator.userAgent.slice(0, 500),
  });
  if (error) throw error;
  localStorage.setItem(STORAGE_KEY, token);
}

/** Forget current device (logout-side cleanup). */
export function forgetCurrentDeviceLocally() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Generate N short recovery codes (XXXX-XXXX format). */
export function generateRecoveryCodes(count = 5): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const part1 = Array.from(bytes.slice(0, 4))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
    const part2 = Array.from(bytes.slice(4, 8))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}

/** Hash recovery codes for storage. */
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => sha256Hex(c.toUpperCase().trim())));
}

/** Try to consume a recovery code (returns true if accepted). */
export async function consumeRecoveryCode(rawCode: string): Promise<boolean> {
  const normalized = rawCode.toUpperCase().trim().replace(/\s+/g, "");
  const hash = await sha256Hex(normalized);
  const { data, error } = await supabase.rpc("consume_recovery_code", { _code_hash: hash });
  if (error) return false;
  return Boolean(data);
}

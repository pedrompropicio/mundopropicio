/** Portable backup envelope: gzip, then AES-256-GCM; IV(12) || ciphertext || tag. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function importBackupKey(base64: string): Promise<CryptoKey> {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("BACKUP_R2_ENC_KEY tem de ter 32 bytes");
  }
  if (bytes.length !== 32) throw new Error("BACKUP_R2_ENC_KEY tem de ter 32 bytes");
  return crypto.subtle.importKey("raw", new Uint8Array(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(
    new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream),
  ).arrayBuffer());
}

export async function sealBackup(plain: Uint8Array, key: CryptoKey, iv?: Uint8Array): Promise<Uint8Array> {
  const nonce = iv ? new Uint8Array(iv) : crypto.getRandomValues(new Uint8Array(12));
  if (nonce.length !== 12) throw new Error("O IV tem de ter 12 bytes");
  const compressed = await transform(plain, new CompressionStream("gzip"));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 }, key, compressed,
  ));
  const sealed = new Uint8Array(12 + ciphertext.length);
  sealed.set(nonce);
  sealed.set(ciphertext, 12);
  return sealed;
}

export async function openBackup(sealed: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  if (sealed.length < 28) throw new Error("Backup encriptado truncado");
  const compressed = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.slice(0, 12), tagLength: 128 }, key, sealed.slice(12),
  ));
  return transform(compressed, new DecompressionStream("gzip"));
}

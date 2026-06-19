// AES-256-GCM encryption for Meta access tokens at rest.
// ENCRYPTION_KEY must be a 64-char hex string (32 bytes).

const ALGORITHM = "AES-GCM";
const KEY_USAGE: KeyUsage[] = ["encrypt", "decrypt"];

function hexToBytes(hex: string): Uint8Array {
  if (hex.length !== 64) throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const raw = hexToBytes(process.env.ENCRYPTION_KEY!);
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, ALGORITHM, false, KEY_USAGE);
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  // Encode as base64: iv (12 bytes) || ciphertext
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), 12);
  return Buffer.from(combined).toString("base64");
}

export async function decrypt(encoded: string): Promise<string> {
  const key = await getKey();
  const combined = Buffer.from(encoded, "base64");
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

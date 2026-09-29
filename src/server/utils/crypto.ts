import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { getConfig } from "~/server/utils/config";

/**
 * AES-256-GCM encryption/decryption utilities for token storage.
 * All tokens are encrypted at rest using a pre-shared key.
 */

interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  authTag: string;
  salt: string;
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param plaintext The token/secret to encrypt
 * @returns JSON-encoded encrypted payload (iv, ciphertext, authTag)
 */
export function encryptToken(plaintext: string): string {
  const config = getConfig();
  const keyHex = config.tokenEncryptionKey;

  // Generate random IV and salt for this encryption
  const iv = randomBytes(12); // 96-bit IV for GCM
  const salt = randomBytes(16);

  // Derive key using scrypt (even though we have a pre-shared key, add salt layer)
  const key = scryptSync(keyHex, salt, 32);

  // Create cipher
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  // Encrypt
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Return as JSON-encoded string
  const payload: EncryptedPayload = {
    iv: iv.toString("hex"),
    ciphertext,
    authTag: authTag.toString("hex"),
    salt: salt.toString("hex"),
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt an encrypted payload
 * @param encrypted JSON-encoded encrypted payload
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (tampering detected)
 */
export function decryptToken(encrypted: string): string {
  const config = getConfig();
  const keyHex = config.tokenEncryptionKey;

  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(encrypted);
  } catch (e) {
    throw new Error("Invalid encrypted payload format");
  }

  // Reconstruct components
  const iv = Buffer.from(payload.iv, "hex");
  const ciphertext = payload.ciphertext;
  const authTag = Buffer.from(payload.authTag, "hex");
  const salt = Buffer.from(payload.salt, "hex");

  // Derive key using same salt
  const key = scryptSync(keyHex, salt, 32);

  // Create decipher
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  let plaintext = decipher.update(ciphertext, "hex", "utf8");
  try {
    plaintext += decipher.final("utf8");
  } catch (e) {
    throw new Error("Decryption failed: payload may be tampered");
  }

  return plaintext;
}

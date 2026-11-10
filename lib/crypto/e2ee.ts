"use client";

/**
 * Web Crypto API Engine for Relay Messenger (AES-GCM 256-bit)
 * Encrypts messages on the client before saving to IndexedDB or transmitting.
 */

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

/**
 * Generate a cryptographically secure 256-bit AES-GCM room key.
 */
export const generateRoomKey = async (): Promise<CryptoKey> => {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );
};

/**
 * Encrypt plaintext string using AES-GCM with a unique 96-bit initialization vector (IV).
 */
export const encryptPayload = async (
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedPayload> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    data
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
    iv: btoa(String.fromCharCode(...iv)),
  };
};

/**
 * Decrypt base64-encoded ciphertext using AES-GCM and stored IV.
 */
export const decryptPayload = async (
  ciphertextB64: string,
  ivB64: string,
  key: CryptoKey
): Promise<string> => {
  const decoder = new TextDecoder();
  const ciphertext = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    ciphertext
  );

  return decoder.decode(decryptedBuffer);
};

/**
 * Export a CryptoKey to raw base64 format for local key backup or session export.
 */
export const exportKeyToRaw = async (key: CryptoKey): Promise<string> => {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
};

/**
 * Import a raw base64 key into a Web Crypto CryptoKey object.
 */
export const importKeyFromRaw = async (rawB64: string): Promise<CryptoKey> => {
  const raw = Uint8Array.from(atob(rawB64), (c) => c.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
};

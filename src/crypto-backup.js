const b64e = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x4000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  }
  return btoa(s);
};

const b64d = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wraps an ECDH private+public JWK pair (and optional historical key ring) using PBKDF2-SHA256 (250k) + AES-256-GCM.
 */
export async function encryptKeyBackup(ecdhPair, fp, passphrase, extra = null) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 250000;
  const key = await deriveKey(passphrase, salt, iterations);
  const inner = JSON.stringify({
    v: 2,
    fp,
    pubJwk: ecdhPair.pubJwk,
    privJwk: ecdhPair.privJwk,
    ...(extra?.ring ? { ring: extra.ring } : {}),
    ...(extra?.pubCache ? { pubCache: extra.pubCache } : {}),
    exportedAt: Date.now()
  });
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(inner));
  return {
    v: 2,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: b64e(salt),
    iv: b64e(iv),
    ct: b64e(ct),
    fp,
    pubJwk: ecdhPair.pubJwk
  };
}

/**
 * Unwraps a PBKDF2 + AES-GCM encrypted key backup using the user's passphrase.
 */
export async function decryptKeyBackup(backupObj, passphrase) {
  if (!backupObj || !backupObj.salt || !backupObj.iv || !backupObj.ct) {
    throw new Error('Invalid encrypted backup payload');
  }
  const iterations = Number(backupObj.iterations) || 250000;
  const key = await deriveKey(passphrase, b64d(backupObj.salt), iterations);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(backupObj.iv) }, key, b64d(backupObj.ct));
  } catch (_) {
    throw new Error('Incorrect backup passphrase');
  }
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  if (!parsed || !parsed.privJwk || !parsed.pubJwk) {
    throw new Error('Corrupt decrypted key material');
  }
  return parsed;
}

export function buildRecoveryKitText(backupObj, handle) {
  return [
    '=== WHATSGRAM E2EE RECOVERY KIT ===',
    `Account: ${handle || 'unknown'}`,
    `Key Fingerprint: ${backupObj.fp || ''}`,
    `KDF: ${backupObj.kdf || 'PBKDF2-SHA256'} (${backupObj.iterations || 250000} rounds)`,
    `Created: ${new Date().toISOString()}`,
    '',
    'Keep this encrypted bundle + passphrase safe. Your private key never left your device unencrypted.',
    '',
    JSON.stringify(backupObj)
  ].join('\n');
}

/**
 * Renders a deterministic visual verification QR-style matrix SVG for a key fingerprint / safety number.
 */
export function renderSafetyQrSvg(code, size = 140) {
  const N = 21;
  const grid = Array.from({ length: N }, () => Array(N).fill(false));
  const markFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = edge || inner;
      }
    }
  };
  markFinder(0, 0);
  markFinder(0, N - 7);
  markFinder(N - 7, 0);

  let h = 2166136261;
  const src = String(code || 'WG-EMPTY');
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let state = h || 1;
  const nextBit = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) & 1) === 1;
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inTL = r < 8 && c < 8;
      const inTR = r < 8 && c >= N - 8;
      const inBL = r >= N - 8 && c < 8;
      if (inTL || inTR || inBL) continue;
      grid[r][c] = nextBit();
    }
  }
  const rects = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c]) rects.push(`<rect x="${c + 1}" y="${r + 1}" width="1" height="1" rx="0.18"/>`);
    }
  }
  return `<svg viewBox="0 0 ${N + 2} ${N + 2}" width="${size}" height="${size}" class="rounded-2xl bg-white p-1.5 text-zinc-950 shadow-inner" role="img" aria-label="Safety number QR matrix"><g fill="currentColor">${rects.join('')}</g></svg>`;
}

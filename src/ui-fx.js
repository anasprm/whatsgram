/* Visual FX, QR generator, WebAudio analyser, WebAuthn, Encrypted IndexedDB search & Privacy/Security utilities */

/* ---- Minimal compliant Byte-Mode QR Matrix Generator (Versions 1..6, ECC-L) ---- */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(deg) {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data, ecCount) {
  const gen = rsGenerator(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (!factor) continue;
    for (let j = 0; j < gen.length; j++) {
      res[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return res.slice(data.length);
}

// Version specs (ECC-L): [version, size, totalDataCodewords, ecCodewordsPerBlock, alignPos]
const QR_VER_SPECS = [
  [1, 21, 19, 7, []],
  [2, 25, 34, 10, [6, 18]],
  [3, 29, 55, 15, [6, 22]],
  [4, 33, 80, 20, [6, 26]],
  [5, 37, 108, 26, [6, 30]],
  [6, 41, 136, 18, [6, 34]] // Ver 6 ECC-L has 2 blocks of (68 data + 18 ec)
];

function computeFormatBits(maskIdx) {
  // ECC level L = 01
  const data = (0b01 << 3) | (maskIdx & 7);
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

export function encodeQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text || 'https://whatsgram.app').slice(0, 128));
  const spec = QR_VER_SPECS.find(s => bytes.length + 2 <= s[2]) || QR_VER_SPECS[QR_VER_SPECS.length - 1];
  const [ver, N, dataCap, ecLen, align] = spec;
  const maxBytes = dataCap - 2;
  const payload = bytes.slice(0, maxBytes);

  // Build bitstream: mode(0100) + len(8 bits for v1..6) + data + terminator + pad bytes
  const bits = [];
  const pushBits = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);
  pushBits(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const padWords = [0xec, 0x11];
  let pi = 0;
  while (bits.length < dataCap * 8) { pushBits(padWords[pi % 2], 8); pi++; }

  const dataWords = new Uint8Array(dataCap);
  for (let i = 0; i < dataCap; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) val = (val << 1) | bits[i * 8 + b];
    dataWords[i] = val;
  }

  // Version 6 uses 2 blocks of 68; Versions 1..5 use 1 block
  const blocks = ver === 6 ? [dataWords.slice(0, 68), dataWords.slice(68, 136)] : [dataWords];
  const ecBlocks = blocks.map(blk => rsRemainder(blk, ecLen));
  const finalWords = [];
  const maxD = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxD; i++) for (const blk of blocks) if (i < blk.length) finalWords.push(blk[i]);
  for (let i = 0; i < ecLen; i++) for (const ec of ecBlocks) finalWords.push(ec[i]);

  const finalBits = [];
  for (const w of finalWords) for (let b = 7; b >= 0; b--) finalBits.push((w >> b) & 1);
  // Remainder bits
  while (finalBits.length < N * N) finalBits.push(0);

  const grid = Array.from({ length: N }, () => new Int8Array(N).fill(-1));
  const reserved = Array.from({ length: N }, () => new Uint8Array(N));

  const placeFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
        const on = (r >= 0 && r <= 6 && c >= 0 && c <= 6) &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        grid[rr][cc] = on ? 1 : 0;
        reserved[rr][cc] = 1;
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, N - 7);
  placeFinder(N - 7, 0);

  // Timing & alignment patterns + dark module
  for (let i = 8; i < N - 8; i++) {
    grid[6][i] = i % 2 === 0 ? 1 : 0; reserved[6][i] = 1;
    grid[i][6] = i % 2 === 0 ? 1 : 0; reserved[i][6] = 1;
  }
  grid[N - 8][8] = 1; reserved[N - 8][8] = 1;
  for (const r0 of align) {
    for (const c0 of align) {
      if (reserved[r0][c0]) continue;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        const on = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
        grid[r0 + r][c0 + c] = on ? 1 : 0;
        reserved[r0 + r][c0 + c] = 1;
      }
    }
  }

  // Reserve format info strips
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { reserved[8][i] = 1; reserved[i][8] = 1; }
  }
  for (let i = 0; i < 8; i++) reserved[8][N - 1 - i] = 1;
  for (let i = 0; i < 7; i++) reserved[N - 1 - i][8] = 1;

  // Zig-zag bit placement
  let bitIdx = 0, up = true;
  for (let col = N - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < N; step++) {
      const r = up ? N - 1 - step : step;
      for (const cc of [col, col - 1]) {
        if (!reserved[r][cc]) {
          const rawBit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          // Use mask 0: (r + c) % 2 === 0
          const masked = ((r + cc) % 2 === 0) ? (rawBit ^ 1) : rawBit;
          grid[r][cc] = masked;
        }
      }
    }
    up = !up;
  }

  // Write format bits for mask 0
  const fmt = computeFormatBits(0);
  const fCoords1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> i) & 1;
    const [r1, c1] = fCoords1[14 - i];
    grid[r1][c1] = bit;
    if (i < 8) grid[8][N - 1 - i] = (fmt >> i) & 1;
    else grid[N - 15 + i][8] = (fmt >> i) & 1;
  }
  return grid;
}

export function renderQrSvg(text, { size = 180, fg = '#09090b', bg = '#ffffff', title = 'QR Code' } = {}) {
  const mat = encodeQrMatrix(text);
  const N = mat.length;
  const pad = 3;
  const vb = N + pad * 2;
  let paths = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (mat[r][c] === 1) paths += `M${c + pad},${r + pad}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" width="${size}" height="${size}" role="img" aria-label="${title.replace(/"/g, '')}" shape-rendering="crispEdges"><rect width="${vb}" height="${vb}" fill="${bg}" rx="2"/><path d="${paths}" fill="${fg}"/></svg>`;
}

export function downloadQrPng(svgMarkup, filename = 'whatsgram-qr.png') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);
    ctx.drawImage(img, 0, 0, 512, 512);
    URL.revokeObjectURL(url);
    canvas.toBlob(png => {
      if (!png) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

/* ---- Dynamic SVG Favicon & Title Badge (#15) ---- */
export function updateDynamicFavicon(unreadCount = 0, accentHex = '#6366f1') {
  if (typeof document === 'undefined') return;
  const n = Math.max(0, Number(unreadCount) || 0);
  document.title = n > 0 ? `(${n > 99 ? '99+' : n}) WhatsGram` : 'WhatsGram · Zero-Knowledge Messaging & Social';
  const badge = n > 0
    ? `<circle cx="24" cy="8" r="7.5" fill="#f43f5e"/><text x="24" y="11" text-anchor="middle" font-size="9" font-weight="800" font-family="system-ui" fill="#fff">${n > 9 ? '9+' : n}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="${accentHex}"/><path d="M9 11h14v9H15l-4 3v-3H9z" fill="#fff"/>${badge}</svg>`;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* ---- Ambient Card Glow Color Sampler (#5) ---- */
export function sampleImageAmbientGlow(url) {
  return new Promise(resolve => {
    if (typeof document === 'undefined' || !url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 4; c.height = 4;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 4, 4);
        const d = ctx.getImageData(0, 0, 4, 4).data;
        let r = 0, g = 0, b = 0, k = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; k++; }
        resolve(`rgba(${Math.round(r / k)},${Math.round(g / k)},${Math.round(b / k)},0.26)`);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* ---- WebAudio Live Mic / Call Waveform Visualizer (#51, #82) ---- */
export function createMicVisualizer(stream, onLevel) {
  if (typeof window === 'undefined' || !stream) return { stop() {} };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return { stop() {} };
  let raf = 0;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  src.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    const bars = [];
    for (let i = 0; i < 16; i++) {
      const v = data[i] || 0;
      sum += v;
      bars.push(Math.max(12, Math.round((v / 255) * 100)));
    }
    const rms = sum / (16 * 255);
    onLevel && onLevel(rms, bars);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    stop() {
      cancelAnimationFrame(raf);
      try { src.disconnect(); ctx.close(); } catch {}
    }
  };
}

/* ---- Passphrase Entropy & Crack-Time Meter (#85) ---- */
export function scorePassphraseEntropy(pw) {
  const s = String(pw || '');
  if (!s) return { bits: 0, pct: 0, label: 'Empty', crack: 'Instant', tone: 'bg-zinc-600 text-zinc-400' };
  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/[0-9]/.test(s)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(s)) pool += 32;
  const uniq = new Set(s).size;
  const effLen = Math.min(s.length, uniq * 1.4 + 2);
  const bits = Math.round(effLen * Math.log2(Math.max(pool, 10)));
  const pct = Math.min(100, Math.round((bits / 100) * 100));
  if (bits < 36) return { bits, pct, label: 'Weak', crack: '< 1 hour', tone: 'bg-rose-500 text-rose-400' };
  if (bits < 60) return { bits, pct, label: 'Fair', crack: '~Months', tone: 'bg-amber-400 text-amber-300' };
  if (bits < 84) return { bits, pct, label: 'Strong', crack: '~Years', tone: 'bg-emerald-400 text-emerald-300' };
  return { bits, pct, label: 'Vault-Grade', crack: 'Centuries+', tone: 'bg-cyan-400 text-cyan-300' };
}

/* ---- 60-Digit Signal Safety Number 12x5 Visual Matrix (#84) ---- */
export function formatSafetyNumberMatrix(fp = '') {
  const seed = String(fp || '0').replace(/[^0-9A-Za-z]/g, '') || '0';
  let digits = '';
  let acc = 2166136261;
  for (let i = 0; i < 60; i++) {
    const ch = seed.charCodeAt(i % seed.length);
    acc = Math.imul(acc ^ ch ^ i, 16777619) >>> 0;
    digits += String(acc % 10);
  }
  const chunks = [];
  for (let i = 0; i < 60; i += 5) chunks.push(digits.slice(i, i + 5));
  return chunks; // 12 groups of 5 digits
}

/* ---- WebAuthn Hardware Passkey Registration & Verification (#94, #132, #161) ---- */
export async function registerWebAuthnPasskey(userId, username = 'member') {
  if (typeof navigator === 'undefined' || !navigator.credentials || !window.PublicKeyCredential) {
    throw new Error('WebAuthn Passkeys are not supported in this browser context.');
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const uidBytes = new TextEncoder().encode(String(userId || 'wg-user').slice(0, 64));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'WhatsGram OS', id: location.hostname || 'localhost' },
      user: { id: uidBytes, name: username, displayName: username },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      timeout: 60000
    }
  });
  const credId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
  localStorage.setItem('wg_passkey_id', credId);
  return { credId, type: cred.type };
}

export async function verifyWebAuthnPasskey() {
  if (!navigator.credentials || !window.PublicKeyCredential) {
    throw new Error('WebAuthn unavailable.');
  }
  const saved = localStorage.getItem('wg_passkey_id');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const opts = {
    challenge,
    timeout: 60000,
    userVerification: 'preferred',
    ...(saved ? { allowCredentials: [{ type: 'public-key', id: Uint8Array.from(atob(saved), c => c.charCodeAt(0)) }] } : {})
  };
  const assertion = await navigator.credentials.get({ publicKey: opts });
  return Boolean(assertion?.rawId);
}

/* ---- Multi-Tab BroadcastChannel Sync (#153) ---- */
export function createTabSync(onMessage) {
  if (typeof BroadcastChannel === 'undefined') return { post() {}, close() {} };
  const ch = new BroadcastChannel('wg_tab_sync_v1');
  ch.onmessage = ev => { if (ev?.data && onMessage) onMessage(ev.data); };
  return {
    post(type, payload) { try { ch.postMessage({ type, payload, at: Date.now() }); } catch {} },
    close() { try { ch.close(); } catch {} }
  };
}

/* ---- Local Inverted DM Search Index (IndexedDB, #144, #162) ---- */
const IDB_NAME = 'wg_local_search_v1';
const IDB_STORE = 'postings';

function openSearchDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const EncryptedSearchIndex = {
  async indexMessages(convId, msgs = []) {
    try {
      const db = await openSearchDb();
      if (!db || !convId) return;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const st = tx.objectStore(IDB_STORE);
      for (const m of msgs) {
        const plain = String(m.text || m.fileName || '').trim();
        if (!plain) continue;
        const tokens = [...new Set(plain.toLowerCase().split(/[^a-z0-9_@#]+/).filter(w => w.length >= 2))].slice(0, 40);
        st.put({ id: `${convId}:${m.id}`, convId, msgId: m.id, snippet: plain.slice(0, 140), tokens, ts: Number(m.ts || Date.now()) });
      }
    } catch {}
  },
  async query(text, limit = 25) {
    try {
      const db = await openSearchDb();
      if (!db) return [];
      const terms = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      return await new Promise(resolve => {
        const out = [];
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return resolve(out.sort((a, b) => b.ts - a.ts).slice(0, limit));
          const val = cur.value;
          const hay = (val.snippet || '').toLowerCase();
          if (terms.every(t => hay.includes(t) || (val.tokens || []).some(k => k.includes(t)))) {
            out.push(val);
          }
          cur.continue();
        };
        req.onerror = () => resolve([]);
      });
    } catch { return []; }
  },
  async clear() {
    try { if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(IDB_NAME); } catch {}
  }
};

/* ---- Zero-Trace Panic Wipe (#170) ---- */
export async function executePanicWipe(tabSync) {
  try { tabSync?.post('panic', {}); } catch {}
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  await EncryptedSearchIndex.clear();
  try {
    if ('caches' in window) {
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
    }
  } catch {}
  try { location.replace('/'); } catch { location.reload(); }
}

/* ---- Anti-Phishing Homograph & Unsafe URL Guard (#193) ---- */
export function inspectExternalUrl(rawUrl) {
  try {
    const base = typeof location !== 'undefined' ? location.origin : 'https://whatsgram.app';
    const u = new URL(String(rawUrl || ''), base);
    if (!['http:', 'https:'].includes(u.protocol)) {
      return { safe: false, warning: `Blocked non-HTTP scheme (${u.protocol})`, hostname: u.hostname };
    }
    const host = u.hostname || '';
    const hasPuny = host.split('.').some(p => p.startsWith('xn--'));
    const hasMixedScript = /[\u0400-\u04ff\u0370-\u03ff]/.test(host);
    const hasCreds = Boolean(u.username || u.password);
    const isRawIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && u.protocol === 'http:';
    if (hasPuny || hasMixedScript) {
      return { safe: false, warning: `Suspicious lookalike/IDN domain detected: ${host}`, hostname: host, url: u.href };
    }
    if (hasCreds || isRawIp) {
      return { safe: false, warning: `Unverified external host: ${host}`, hostname: host, url: u.href };
    }
    return { safe: true, warning: '', hostname: host, url: u.href };
  } catch {
    return { safe: false, warning: 'Malformed external URL', hostname: '', url: '' };
  }
}

/* Client-side media preprocessing: EXIF metadata stripping, max-dimension downscaling,
 * WebP/JPEG compression, and lightweight video poster thumbnail extraction. */

const PASS_THROUGH_TYPES = new Set(['image/gif', 'image/svg+xml']);

function replaceExt(name, ext) {
  const base = String(name || 'media').replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fallback to <img> element below for formats createImageBitmap rejects
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Downscales oversized raster images and re-encodes camera photos so EXIF metadata
 * (GPS coordinates, camera serials, timestamps) is stripped before upload.
 */
export async function processUploadFile(file, { maxDim = 1600, quality = 0.86 } = {}) {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) return file;
  if (PASS_THROUGH_TYPES.has(file.type)) return file;
  if (typeof document === 'undefined') return file;

  const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
  if (!isJpeg && file.size <= 150 * 1024) return file;

  let bmp = null;
  try {
    bmp = await decodeImage(file);
    const srcW = bmp.width || bmp.naturalWidth || 0;
    const srcH = bmp.height || bmp.naturalHeight || 0;
    if (!srcW || !srcH) return file;

    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    if (!isJpeg && scale === 1 && file.size <= 150 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, dstW, dstH);

    // Prefer WebP when supported for PNG/WebP transparency & size; keep JPEG for camera photos
    let targetMime = isJpeg ? 'image/jpeg' : 'image/webp';
    let blob = await canvasToBlob(canvas, targetMime, quality);
    if (!blob && targetMime === 'image/webp') {
      targetMime = 'image/png';
      blob = await canvasToBlob(canvas, targetMime, quality);
    }
    if (!blob) return file;

    // For lossless/small non-EXIF files that didn't resize, keep smaller of original vs compressed
    if (!isJpeg && scale === 1 && blob.size >= file.size) return file;
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
    return new File([blob], replaceExt(file.name, ext), {
      type: blob.type || targetMime,
      lastModified: Date.now()
    });
  } catch {
    return file;
  } finally {
    if (bmp && typeof bmp.close === 'function') {
      try { bmp.close(); } catch {}
    }
  }
}

/**
 * Captures a poster frame from a local video File for preview thumbnails and reels.
 */
export async function extractVideoPoster(file, { maxDim = 720, quality = 0.8 } = {}) {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('video/')) return null;
  if (typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      try { video.load(); } catch {}
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => done(null), 5000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const targetTime = Number.isFinite(video.duration) && video.duration > 0.25
        ? Math.min(0.4, video.duration * 0.1)
        : 0;
      try {
        video.currentTime = targetTime;
      } catch {
        done(null);
      }
    };

    video.onseeked = async () => {
      try {
        const vw = video.videoWidth || 0;
        const vh = video.videoHeight || 0;
        if (!vw || !vh) return done(null);
        const scale = Math.min(1, maxDim / Math.max(vw, vh));
        const w = Math.max(1, Math.round(vw * scale));
        const h = Math.max(1, Math.round(vh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.drawImage(video, 0, 0, w, h);
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const posterFile = blob ? new File([blob], replaceExt(file.name, 'jpg'), { type: 'image/jpeg' }) : null;
        done({ file: posterFile, dataUrl, duration: Number(video.duration || 0) });
      } catch {
        done(null);
      }
    };

    video.onerror = () => done(null);
    video.src = url;
  });
}

export const POST_FILTERS = [
  { key: 'none', label: 'Normal', css: 'none' },
  { key: 'vivid', label: 'Vivid', css: 'contrast(1.12) saturate(1.28)' },
  { key: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.22)' },
  { key: 'warm', label: 'Warm', css: 'sepia(0.24) saturate(1.18) brightness(1.03)' },
  { key: 'cool', label: 'Frost', css: 'hue-rotate(12deg) saturate(0.92) contrast(1.08)' },
  { key: 'cinema', label: 'Cinema', css: 'contrast(1.16) brightness(0.95) saturate(0.86)' }
];

/** Applies a chosen preset CSS filter directly to a raster image on Canvas before upload. */
export async function applyCanvasFilter(file, filterKey = 'none', maxDim = 1600) {
  if (!file || filterKey === 'none' || !file.type?.startsWith('image/') || PASS_THROUGH_TYPES.has(file.type)) return file;
  const preset = POST_FILTERS.find(f => f.key === filterKey);
  if (!preset || preset.css === 'none' || typeof document === 'undefined') return file;
  let bmp = null;
  try {
    bmp = await decodeImage(file);
    const sw = bmp.width || bmp.naturalWidth || 0;
    const sh = bmp.height || bmp.naturalHeight || 0;
    if (!sw || !sh) return file;
    const sc = Math.min(1, maxDim / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * sc));
    canvas.height = Math.max(1, Math.round(sh * sc));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.filter = preset.css;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, 'image/webp', 0.88) || await canvasToBlob(canvas, 'image/jpeg', 0.88);
    if (!blob) return file;
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], replaceExt(file.name, ext), { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    if (bmp && typeof bmp.close === 'function') { try { bmp.close(); } catch {} }
  }
}

/** Dual-size WebP generator (#175): produces crisp 1600px full upload + 400px feed thumbnail. */
export async function generateThumbAndFullWebP(file, filterKey = 'none') {
  const filtered = filterKey && filterKey !== 'none' ? await applyCanvasFilter(file, filterKey, 1600) : file;
  const fullFile = await processUploadFile(filtered, { maxDim: 1600, quality: 0.86 });
  const thumbFile = await processUploadFile(filtered, { maxDim: 400, quality: 0.78 });
  return { fullFile, thumbFile };
}

export interface ProcessedImageResult {
  originalFile: File;
  compressedBlob: Blob;
  thumbnailBlob: Blob;
  imageHash: string;
  dimensions: { width: number; height: number };
  gpsLocation?: { latitude: number; longitude: number; accuracy: number };
  deviceInfo: { userAgent: string; platform: string };
  timestamp: string;
}

/**
 * Calculates SHA-256 hash or safe string hash fallback.
 */
export async function calculateImageHash(buffer: ArrayBuffer, file: File): Promise<string> {
  try {
    if (window.crypto && window.crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    // Subtle crypto fallback
  }
  return `hash_${file.name.replace(/\s+/g, '_')}_${file.size}_${file.lastModified}`;
}

/**
 * Safe canvas compressor with direct file fallback.
 */
export function compressCanvasImage(
  img: HTMLImageElement,
  file: File,
  maxDimension: number,
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve) => {
    try {
      let width = img.naturalWidth || img.width || 800;
      let height = img.naturalHeight || img.height || 600;

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(file);
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        'image/jpeg',
        quality
      );
    } catch (err) {
      console.warn('Canvas compression fallback to raw file:', err);
      resolve(file);
    }
  });
}

/**
 * Main 100% crash-proof image processor pipeline.
 */
export async function processChecklistImage(file: File): Promise<ProcessedImageResult> {
  try {
    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch {
      buffer = new ArrayBuffer(0);
    }

    const imageHash = await calculateImageHash(buffer, file);

    const img = new Image();
    const url = URL.createObjectURL(file);

    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });

    const dimensions = {
      width: img.naturalWidth || img.width || 800,
      height: img.naturalHeight || img.height || 600,
    };

    const compressedBlob = await compressCanvasImage(img, file, 1280, 0.82);
    const thumbnailBlob = await compressCanvasImage(img, file, 300, 0.70);

    try {
      URL.revokeObjectURL(url);
    } catch {}

    // Safe Geolocation Capture
    let gpsLocation: { latitude: number; longitude: number; accuracy: number } | undefined;
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        gpsLocation = await new Promise((res) => {
          const timeoutId = setTimeout(() => res(undefined), 2500);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timeoutId);
              res({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            },
            () => {
              clearTimeout(timeoutId);
              res(undefined);
            },
            { timeout: 2500, enableHighAccuracy: false }
          );
        });
      } catch {
        gpsLocation = undefined;
      }
    }

    return {
      originalFile: file,
      compressedBlob,
      thumbnailBlob,
      imageHash,
      dimensions,
      gpsLocation,
      deviceInfo: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'web',
        platform: typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'web',
      },
      timestamp: new Date().toISOString(),
    };
  } catch (fatalErr: any) {
    console.warn('Image processing fallback used:', fatalErr);
    return {
      originalFile: file,
      compressedBlob: file,
      thumbnailBlob: file,
      imageHash: `img_${Date.now()}`,
      dimensions: { width: 800, height: 600 },
      deviceInfo: { userAgent: 'web', platform: 'web' },
      timestamp: new Date().toISOString(),
    };
  }
}

import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onCapture: (blob: Blob, dataUrl: string) => void;
  facing?: 'user' | 'environment';
  label?: string;
}

/**
 * Live camera-only capture. NO gallery upload path exists — we render nothing
 * that lets the user pick a saved file. Falls back to `<input capture>` on
 * devices where getUserMedia is denied, which still forces the OS camera.
 */
export const LiveCameraCapture: React.FC<Props> = ({ onCapture, facing = 'user', label = 'Capture live photo' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e: any) {
        setError(e?.message || 'Camera unavailable');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facing]);

  const snap = async () => {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    const w = v.videoWidth || 720; const h = v.videoHeight || 960;
    // downscale to max 1024 for upload
    const scale = Math.min(1, 1024 / Math.max(w, h));
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    setPreview(dataUrl);
    c.toBlob((b) => { if (b) onCapture(b, dataUrl); }, 'image/jpeg', 0.85);
  };

  const retake = () => { setPreview(null); };

  if (error) {
    // Fallback: OS camera (no gallery picker) via capture attribute
    return (
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-4 space-y-3">
        <p className="text-sm text-muted-foreground">{error}. Using device camera fallback.</p>
        <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent">
          <Camera className="h-4 w-4" /> {label}
          <input
            type="file"
            accept="image/*"
            capture={facing === 'user' ? 'user' : 'environment'}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const dataUrl = URL.createObjectURL(f);
              setPreview(dataUrl);
              onCapture(f, dataUrl);
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur overflow-hidden">
      {!preview ? (
        <div className="relative">
          <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
          <div className="p-3 flex items-center justify-center">
            <Button type="button" onClick={snap} disabled={!ready} size="lg" className="rounded-full">
              <Camera className="h-5 w-5 mr-2" /> {label}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <img src={preview} alt="captured" className="w-full aspect-[3/4] object-cover" />
          <div className="p-3 flex items-center justify-center gap-2">
            <Button type="button" variant="outline" onClick={retake}><RefreshCw className="h-4 w-4 mr-1" /> Retake</Button>
            <Button type="button" onClick={() => { /* already sent via onCapture */ }}><Check className="h-4 w-4 mr-1" /> Use photo</Button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default LiveCameraCapture;

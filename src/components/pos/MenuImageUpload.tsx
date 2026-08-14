import React, { useRef, useState } from 'react';
import { Camera, Upload, X, ImageIcon, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MenuImageUploadProps {
  imageUrl: string;
  onImageChange: (url: string) => void;
}

/** Resize & compress an image file to a base64 data URL (max 800px, JPEG 75% quality) */
const compressToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

export const MenuImageUpload: React.FC<MenuImageUploadProps> = ({ imageUrl, onImageChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [usedLocalFallback, setUsedLocalFallback] = useState(false);

  const uploadFile = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }

    setUploading(true);
    setUsedLocalFallback(false);

    // --- Attempt 1: Supabase Storage ---
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `menu/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('menu-images')
          .getPublicUrl(filePath);
        onImageChange(publicUrl);
        toast.success('Image uploaded!');
        setUploading(false);
        return;
      }

      console.warn('Supabase storage upload failed, using local fallback:', uploadError.message);
    } catch (err: any) {
      console.warn('Supabase storage error, using local fallback:', err?.message ?? err);
    }

    // --- Attempt 2: Local base64 fallback ---
    try {
      const base64 = await compressToBase64(file);
      onImageChange(base64);
      setUsedLocalFallback(true);
      toast.success('Image saved locally!');
    } catch (err: any) {
      console.error('Base64 conversion failed:', err);
      toast.error('Failed to process image. Please try a smaller file.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const removeImage = () => {
    onImageChange('');
    setUsedLocalFallback(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <ImageIcon className="w-4 h-4" /> Product Image
      </label>

      {imageUrl ? (
        <div className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-primary/20 shadow-md group">
          <img src={imageUrl} alt="Product" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
            <button
              onClick={removeImage}
              className="w-7 h-7 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="w-24 h-24 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center cursor-pointer hover:border-primary/60 hover:bg-primary/10 transition-all"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-[9px] text-primary/60">Uploading…</span>
            </div>
          ) : (
            <>
              <Upload className="w-5 h-5 text-primary/60 mb-1" />
              <span className="text-[10px] text-primary/60 font-medium">Add Photo</span>
            </>
          )}
        </div>
      )}

      {!imageUrl && !uploading && (
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
        >
          <Camera className="w-3.5 h-3.5" /> Use Camera
        </button>
      )}

      {usedLocalFallback && imageUrl && (
        <p className="flex items-center gap-1 text-[10px] text-amber-500">
          <AlertCircle className="w-3 h-3" /> Saved locally (cloud storage unavailable)
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};
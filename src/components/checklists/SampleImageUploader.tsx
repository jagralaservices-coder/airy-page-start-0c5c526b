import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface SampleImageUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  readOnly?: boolean;
}

export const SampleImageUploader: React.FC<SampleImageUploaderProps> = ({
  images = [],
  onChange,
  maxImages = 5,
  readOnly = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    if (readOnly) return;
    const validFiles = Array.from(files).filter((file) =>
      ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)
    );

    if (validFiles.length === 0) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload valid PNG, JPG, JPEG, or WEBP images.',
        variant: 'destructive',
      });
      return;
    }

    if (images.length + validFiles.length > maxImages) {
      toast({
        title: 'Upload Limit Reached',
        description: `Maximum ${maxImages} sample images allowed.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploading(true);
      const uploadedUrls: string[] = [];

      for (const file of validFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `sample_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        const filePath = `sample_references/${fileName}`;

        let finalUrl: string | null = null;

        // Try primary bucket: checklist-images
        try {
          const { error: uploadErr } = await supabase.storage
            .from('checklist-images')
            .upload(filePath, file, { cacheControl: '3600', upsert: true });

          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('checklist-images')
              .getPublicUrl(filePath);
            finalUrl = urlData.publicUrl;
          }
        } catch {
          // Primary bucket attempt silent catch
        }

        // Try fallback bucket: public
        if (!finalUrl) {
          try {
            const { error: pubErr } = await supabase.storage
              .from('public')
              .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (!pubErr) {
              const { data: pubUrlData } = supabase.storage
                .from('public')
                .getPublicUrl(filePath);
              finalUrl = pubUrlData.publicUrl;
            }
          } catch {
            // Secondary bucket attempt silent catch
          }
        }

        // Final fallback: data URL
        if (!finalUrl) {
          finalUrl = await fileToBase64(file);
        }

        uploadedUrls.push(finalUrl);
      }

      onChange([...images, ...uploadedUrls]);
      toast({ title: 'Sample reference image added' });
    } catch (err: any) {
      console.warn('Image upload fallback used:', err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index: number) => {
    if (readOnly) return;
    const updated = images.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-3">
      {!readOnly && images.length < maxImages && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-border hover:border-primary/50 bg-card'
          }`}
        >
          <input
            type="file"
            multiple
            accept="image/png, image/jpeg, image/jpg, image/webp"
            className="hidden"
            id="sample-image-input"
            onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
            disabled={uploading}
          />
          <label htmlFor="sample-image-input" className="cursor-pointer flex flex-col items-center gap-2">
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <Upload className="w-6 h-6 text-muted-foreground" />
            )}
            <div className="text-xs">
              <span className="font-semibold text-primary">Click to upload sample image</span> or drag & drop
            </div>
            <p className="text-[10px] text-muted-foreground">PNG, JPG, JPEG, WEBP (Max {maxImages} photos)</p>
          </label>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden border border-border bg-muted aspect-video">
              <img src={url} alt={`Sample ${idx + 1}`} className="w-full h-full object-cover" />
              {!readOnly && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRemove(idx)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  referenceUrls: string[];
  submittedUrls: string[];
  onClose?: () => void;
}

export const ImageCompareViewer: React.FC<Props> = ({ referenceUrls, submittedUrls, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl overflow-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between p-3 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.min(3, z + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setRot(r => (r + 90) % 360)}><RotateCw className="h-4 w-4" /></Button>
        </div>
        {onClose && <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Reference</h3>
          <div className="grid gap-3">
            {referenceUrls.map((u, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
                <img src={u} alt="ref" style={{ transform: `scale(${zoom}) rotate(${rot}deg)`, transition: 'transform 0.2s' }} className="w-full object-contain" />
                <div className="p-2 text-right"><a href={u} download className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Download className="h-3 w-3" /> Download</a></div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Submitted</h3>
          <div className="grid gap-3">
            {submittedUrls.map((u, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
                <img src={u} alt="sub" style={{ transform: `scale(${zoom}) rotate(${rot}deg)`, transition: 'transform 0.2s' }} className="w-full object-contain" />
                <div className="p-2 text-right"><a href={u} download className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Download className="h-3 w-3" /> Download</a></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCompareViewer;

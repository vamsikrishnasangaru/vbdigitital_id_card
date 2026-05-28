'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudentPhotoPickerProps {
  preview: string | null;
  onPhotoChange: (file: File | null, previewUrl: string | null) => void;
}

function readFileAsPreview(file: File, onPhotoChange: StudentPhotoPickerProps['onPhotoChange']) {
  const reader = new FileReader();
  reader.onloadend = () => onPhotoChange(file, reader.result as string);
  reader.readAsDataURL(file);
}

export function StudentPhotoPicker({ preview, onPhotoChange }: StudentPhotoPickerProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not supported on this device.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError('Could not open camera. Allow camera access or upload a photo instead.');
    }
  }, [stopCamera]);

  useEffect(() => {
    if (cameraOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [cameraOpen, startCamera, stopCamera]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      readFileAsPreview(file, onPhotoChange);
      setShowOptions(false);
    }
    e.target.value = '';
  };

  const openGallery = () => {
    setShowOptions(false);
    fileInputRef.current?.click();
  };

  const openCamera = () => {
    setShowOptions(false);
    setCameraOpen(true);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `student-photo-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        readFileAsPreview(file, onPhotoChange);
        setCameraOpen(false);
      },
      'image/jpeg',
      0.92,
    );
  };

  const clearPhoto = () => {
    onPhotoChange(null, null);
    setShowOptions(false);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInput}
      />

      <div className="relative group">
        <div
          className={cn(
            'aspect-square rounded-[2rem] border-4 border-dashed border-border overflow-hidden',
            'flex items-center justify-center bg-muted/30 transition-all',
            'group-hover:border-primary/30 group-hover:bg-primary/5',
          )}
        >
          {preview ? (
            <img src={preview} alt="Student preview" className="h-full w-full object-cover" />
          ) : (
            <div className="text-center p-6">
              <Camera className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                Add portrait
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowOptions(true)}
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-300',
            'bg-black/40 opacity-0 group-hover:opacity-100 focus:opacity-100',
            'max-sm:opacity-100',
          )}
        >
          <span className="bg-background text-foreground px-5 py-2.5 rounded-2xl text-xs font-black shadow-lg border border-border">
            {preview ? 'CHANGE PHOTO' : 'ADD PHOTO'}
          </span>
        </button>
      </div>

      {showOptions && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowOptions(false)}
        >
          <div
            className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h4 className="font-black text-foreground">Student photo</h4>
              <button
                type="button"
                onClick={() => setShowOptions(false)}
                className="p-2 rounded-xl hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 grid gap-3">
              <button
                type="button"
                onClick={openCamera}
                className="flex items-center gap-4 w-full p-4 rounded-2xl border border-border hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Camera className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Open camera</div>
                  <div className="text-xs text-muted-foreground">Take a live portrait</div>
                </div>
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="flex items-center gap-4 w-full p-4 rounded-2xl border border-border hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
              >
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Upload photo</div>
                  <div className="text-xs text-muted-foreground">Choose from gallery or files</div>
                </div>
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="w-full py-3 text-sm font-bold text-red-600 hover:bg-red-500/10 rounded-xl transition-colors"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-black">
          <div className="flex items-center justify-between p-4 text-white shrink-0">
            <span className="font-bold">Take photo</span>
            <button
              type="button"
              onClick={() => setCameraOpen(false)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
              aria-label="Close camera"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 relative flex items-center justify-center min-h-0 px-4 pb-4">
            {cameraError ? (
              <div className="text-center text-white/90 max-w-sm px-6">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm font-medium">{cameraError}</p>
                <button
                  type="button"
                  onClick={openGallery}
                  className="mt-6 px-6 py-3 bg-white text-black rounded-2xl text-sm font-bold"
                >
                  Upload instead
                </button>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-full max-w-full rounded-2xl object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />
            )}
          </div>

          {!cameraError && (
            <div className="p-6 pb-10 flex justify-center shrink-0">
              <button
                type="button"
                onClick={capturePhoto}
                className="h-16 w-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 transition-all ring-4 ring-white/30"
                aria-label="Capture photo"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

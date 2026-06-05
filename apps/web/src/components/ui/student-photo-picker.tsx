'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, ImageIcon, SlidersHorizontal, RefreshCw, SwitchCamera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImageForUpload, STUDENT_PHOTO_UPLOAD_OPTS } from '@/lib/compress-image';
import { StudentPhotoEditor } from '@/components/ui/student-photo-editor';

type CameraFacing = 'user' | 'environment';

interface StudentPhotoPickerProps {
  preview: string | null;
  onPhotoChange: (file: File | null, previewUrl: string | null) => void;
  /** Crop, light/color adjustments (all roles in add/edit student modal) */
  enablePhotoEditor?: boolean;
}

async function readFileAsPreview(
  file: File,
  onPhotoChange: StudentPhotoPickerProps['onPhotoChange'],
) {
  const compressed = await compressImageForUpload(file, STUDENT_PHOTO_UPLOAD_OPTS);
  const reader = new FileReader();
  reader.onloadend = () => onPhotoChange(compressed, reader.result as string);
  reader.readAsDataURL(compressed);
}

export function StudentPhotoPicker({
  preview,
  onPhotoChange,
  enablePhotoEditor = false,
}: StudentPhotoPickerProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSource, setEditorSource] = useState<string | File | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('user');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const openEditor = useCallback((source: string | File) => {
    setEditorSource(source);
    setEditorOpen(true);
    setShowOptions(false);
    setCameraOpen(false);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async (facing: CameraFacing) => {
    setCameraError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not supported on this device.');
        return;
      }
      const videoConstraints = {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError(
        facing === 'environment'
          ? 'Back camera unavailable. Try switching to front camera or upload a photo.'
          : 'Could not open camera. Allow camera access or upload a photo instead.',
      );
    }
  }, [stopCamera]);

  useEffect(() => {
    if (cameraOpen) {
      void startCamera(cameraFacing);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [cameraOpen, cameraFacing, startCamera, stopCamera]);

  const finishWithFile = (file: File) => {
    if (enablePhotoEditor) {
      openEditor(file);
      return;
    }
    void readFileAsPreview(file, onPhotoChange);
    setShowOptions(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      finishWithFile(file);
    }
    e.target.value = '';
  };

  const openGallery = () => {
    setShowOptions(false);
    fileInputRef.current?.click();
  };

  const openCamera = () => {
    setShowOptions(false);
    setCameraFacing('user');
    setCameraError(null);
    setCameraOpen(true);
  };

  const toggleCameraFacing = () => {
    setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const maxDim = STUDENT_PHOTO_UPLOAD_OPTS.maxWidth;
    const scale = Math.min(1, maxDim / video.videoWidth, maxDim / video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `student-photo-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        finishWithFile(file);
        setCameraOpen(false);
      },
      'image/jpeg',
      0.78,
    );
  };

  const clearPhoto = () => {
    onPhotoChange(null, null);
    setShowOptions(false);
  };

  const handleMainAction = () => {
    setShowOptions(true);
  };

  const overlayLabel = preview
    ? enablePhotoEditor
      ? 'EDIT PHOTO'
      : 'CHANGE PHOTO'
    : 'ADD PHOTO';

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
          onClick={handleMainAction}
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-300',
            'bg-black/40 opacity-0 group-hover:opacity-100 focus:opacity-100',
            'max-sm:opacity-100',
          )}
        >
          <span className="bg-background text-foreground px-5 py-2.5 rounded-2xl text-xs font-black shadow-lg border border-border">
            {overlayLabel}
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
              {enablePhotoEditor && preview && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditor(preview)}
                    className="flex items-center gap-4 w-full p-4 rounded-2xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left"
                  >
                    <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                      <SlidersHorizontal className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground">Edit photo</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={openGallery}
                    className="flex items-center gap-4 w-full p-4 rounded-2xl border border-border hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
                  >
                    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <RefreshCw className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground">Change photo</div>
                      <div className="text-xs text-muted-foreground">Replace with a new upload or camera shot</div>
                    </div>
                  </button>
                </>
              )}
              {(!enablePhotoEditor || !preview) && (
                <>
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
                </>
              )}
              {enablePhotoEditor && preview && (
                <button
                  type="button"
                  onClick={openCamera}
                  className="flex items-center gap-4 w-full p-4 rounded-2xl border border-border hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
                >
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Camera className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-foreground">Take new photo</div>
                    <div className="text-xs text-muted-foreground">Replace current portrait with camera</div>
                  </div>
                </button>
              )}
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
            <span className="font-bold">
              {cameraFacing === 'user' ? 'Front camera' : 'Back camera'}
            </span>
            <div className="flex items-center gap-2">
              {!cameraError && (
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-2 text-sm font-bold"
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-5 w-5" />
                  <span className="hidden sm:inline">Switch</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
                aria-label="Close camera"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 relative flex items-center justify-center min-h-0 px-4 pb-4">
            {cameraError ? (
              <div className="text-center text-white/90 max-w-sm px-6">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm font-medium">{cameraError}</p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  {cameraFacing === 'environment' && (
                    <button
                      type="button"
                      onClick={() => setCameraFacing('user')}
                      className="px-6 py-3 bg-white/15 text-white rounded-2xl text-sm font-bold hover:bg-white/25"
                    >
                      Use front camera
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openGallery}
                    className="px-6 py-3 bg-white text-black rounded-2xl text-sm font-bold"
                  >
                    Upload instead
                  </button>
                </div>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-full max-w-full rounded-2xl object-cover"
                style={cameraFacing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
              />
            )}
          </div>

          {!cameraError && (
            <div className="p-6 pb-10 flex items-center justify-center gap-8 shrink-0">
              <button
                type="button"
                onClick={toggleCameraFacing}
                className="p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
                aria-label="Switch camera"
              >
                <SwitchCamera className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                className="h-16 w-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 transition-all ring-4 ring-white/30"
                aria-label="Capture photo"
              />
              <div className="w-12" aria-hidden />
            </div>
          )}
        </div>
      )}

      <StudentPhotoEditor
        open={editorOpen}
        source={editorSource}
        onClose={() => {
          setEditorOpen(false);
          setEditorSource(null);
        }}
        onSave={(file, previewUrl) => {
          onPhotoChange(file, previewUrl);
          setEditorOpen(false);
          setEditorSource(null);
        }}
      />
    </>
  );
}

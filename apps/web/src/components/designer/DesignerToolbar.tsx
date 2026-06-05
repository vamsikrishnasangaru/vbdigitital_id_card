'use client';

import {
  Save, Copy, FileDown, Image as ImageIcon, Eye, EyeOff, Undo2, Redo2,
  ZoomIn, ZoomOut, Trash2, CopyPlus, FlipHorizontal, Grid3X3, Magnet, X, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCr80Short, type CardOrientation } from '@/lib/card-sizes';

interface DesignerToolbarProps {
  templateName: string;
  activeSide: 'front' | 'back';
  previewMode: boolean;
  showGrid: boolean;
  scale: number;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onClose: () => void;
  onSave: () => void;
  onSaveAs?: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onTogglePreview: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleSide: () => void;
  onToggleGrid: () => void;
  snapEnabled?: boolean;
  onToggleSnap?: () => void;
  /** School admin / teacher preview: hide export and editing tools */
  orientation?: 'HORIZONTAL' | 'VERTICAL';
  readOnlyPreview?: boolean;
  restrictExport?: boolean;
}

function ToolButton({
  children,
  onClick,
  disabled,
  active,
  title,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors',
        active && 'bg-primary/20 text-primary',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-white/10 mx-0.5 shrink-0" />;
}

export function DesignerToolbar({
  templateName,
  activeSide,
  previewMode,
  showGrid,
  scale,
  saving,
  canUndo,
  canRedo,
  hasSelection,
  onClose,
  onSave,
  onSaveAs,
  onExportPng,
  onExportPdf,
  onTogglePreview,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onDelete,
  onDuplicate,
  onToggleSide,
  onToggleGrid,
  snapEnabled = false,
  onToggleSnap,
  readOnlyPreview = false,
  restrictExport = false,
  orientation = 'HORIZONTAL',
}: DesignerToolbarProps) {
  return (
    <header className="h-12 shrink-0 sticky top-0 z-20 flex items-center gap-1 px-3 border-b border-white/[0.08] bg-[#0a0a0f]/95 backdrop-blur-md">
      <ToolButton onClick={onClose} title="Close editor">
        <X className="h-4 w-4" />
      </ToolButton>
      <div className="min-w-0 mr-2 hidden sm:block">
        <p className="text-xs font-bold text-white truncate max-w-[180px]">{templateName}</p>
        <p className="text-[9px] text-white/35 uppercase tracking-widest">
          {readOnlyPreview ? 'Protected preview' : 'ID Card Designer'}
        </p>
      </div>
      <Divider />

      {!readOnlyPreview && (
        <>
          <ToolButton onClick={onSave} disabled={saving} title="Save template (Ctrl+S)">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </ToolButton>
          {onSaveAs && (
            <ToolButton onClick={onSaveAs} title="Save as new template">
              <Copy className="h-4 w-4" />
            </ToolButton>
          )}
          <Divider />
        </>
      )}

      {!restrictExport && (
        <>
          <ToolButton onClick={onExportPng} title="Export PNG">
            <ImageIcon className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={onExportPdf} title="Export PDF">
            <FileDown className="h-4 w-4" />
          </ToolButton>
        </>
      )}
      {!readOnlyPreview && (
        <>
          <ToolButton onClick={onTogglePreview} active={previewMode} title="Preview with sample data">
            {previewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </ToolButton>
          <Divider />

          <ToolButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
          </ToolButton>
          <Divider />
        </>
      )}

      <ToolButton onClick={onZoomOut} title="Zoom out">
        <ZoomOut className="h-4 w-4" />
      </ToolButton>
      <span className="text-[10px] font-bold text-white/50 w-10 text-center tabular-nums">
        {Math.round(scale * 100)}%
      </span>
      <ToolButton onClick={onZoomIn} title="Zoom in">
        <ZoomIn className="h-4 w-4" />
      </ToolButton>

      {!readOnlyPreview && (
        <>
          <Divider />
          <ToolButton onClick={onDelete} disabled={!hasSelection} title="Delete selected">
            <Trash2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={onDuplicate} disabled={!hasSelection} title="Duplicate (Ctrl+D)">
            <CopyPlus className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={onToggleSide} active={activeSide === 'back'} title="Front / Back">
            <FlipHorizontal className="h-4 w-4" />
            <span className="sr-only">{activeSide === 'front' ? 'Front' : 'Back'}</span>
          </ToolButton>
          <ToolButton onClick={onToggleGrid} active={showGrid} title="Show grid">
            <Grid3X3 className="h-4 w-4" />
          </ToolButton>
          {onToggleSnap && (
            <ToolButton onClick={onToggleSnap} active={snapEnabled} title="Snap to grid and other elements (on release)">
              <Magnet className="h-4 w-4" />
            </ToolButton>
          )}
        </>
      )}

      <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-white/40 hidden md:inline text-right leading-tight">
        {readOnlyPreview ? (
          'View only'
        ) : (
          <>
            {activeSide === 'front' ? 'Front' : 'Back'} · CR80 · {formatCr80Short(orientation as CardOrientation)}
          </>
        )}
      </span>
    </header>
  );
}

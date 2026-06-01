'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image, Text, Rect, Transformer } from 'react-konva';
import Konva from 'konva';
import { useCorsImage } from '@/hooks/useCorsImage';
import { toast } from 'sonner';
import {
  type DesignerElement,
  DESIGN_PPI,
  scaleElementsForPpi,
  resolveStudentField,
  getDefaultPlacement,
  getElementImageUrl,
  getElementSize,
  isMediaElement,
  isShapeElement,
  sanitizeElement,
  clampCrop,
  clampElementToCard,
  getElementBounds,
  getSignatureDefaults,
  getLogoDefaults,
  getCenteredPlacement,
  getCardSize,
  usesFrameOnlySelection,
} from '@/lib/designer-utils';
import { uploadDesignerAsset } from '@/lib/template-utils';
import { parseBackground, gradientEndPoint } from '@/lib/background-utils';
import { cn, resolveMediaUrl } from '@/lib/utils';
import { DESIGNER_MOCK_STUDENT } from '@/lib/designer-mock-student';
import { DesignerExportError, exportStageToPdf, exportStageToPng } from '@/lib/designer-export';
import { DesignerMediaLayer } from './DesignerMediaLayer';
import { DesignerTextLayer } from './DesignerTextLayer';
import { DesignerBoxLayer } from './DesignerBoxLayer';
import { DesignerShapeLayer } from './DesignerShapeLayer';
import { DesignerPropertiesPanel } from './DesignerPropertiesPanel';
import { DesignerToolbar } from './DesignerToolbar';
import { DesignerElementsSidebar } from './DesignerElementsSidebar';
import { ImageCropDialog } from './ImageCropDialog';
import { useDesignerHistory } from './useDesignerHistory';
import { 
  catalogActionToElementType,
  type ElementCatalogAction,
} from './designer-elements-catalog';
import { DESIGN_GRID_STEP } from '@/lib/designer-snap';
import { DesignerSnapProvider, useDesignerSnap } from './DesignerSnapContext';
import { DesignerGridOverlay } from './DesignerGridOverlay';
import { DesignerRestrictedWatermark, useRestrictedPreviewGuards } from './DesignerRestrictedOverlay';
import { useAuthStore } from '@/stores/auth-store';
import { isRestrictedIdCardPreviewRole } from '@/lib/role-preview-access';

type TransformerBox = { x: number; y: number; width: number; height: number; rotation: number };

function DesignerCanvasGrid({ cardWidth, cardHeight }: { cardWidth: number; cardHeight: number }) {
  const { showGrid, guides, gridStep } = useDesignerSnap();
  return (
    <DesignerGridOverlay
      cardWidth={cardWidth}
      cardHeight={cardHeight}
      gridStep={gridStep}
      showGrid={showGrid}
      guides={guides}
    />
  );
}

interface IdCardDesignerProps {
  bgUrl: string;
  elements: DesignerElement[];
  onSave?: (elements: DesignerElement[], meta?: { side: 'front' | 'back' }) => void | Promise<void>;
  onClose: () => void;
  templateName: string;
  orientation?: 'HORIZONTAL' | 'VERTICAL';
  schoolId?: string;
  student?: Record<string, unknown>;
  isRenderMode?: boolean;
  templateId?: string;
  backBgUrl?: string;
  backElements?: DesignerElement[];
  onSaveAs?: () => void;
  /** Headless PDF render: fired when the card canvas has settled (images loaded). */
  onRenderReady?: () => void;
  /** Force protected preview (no export). Auto-enabled for school admin / teacher student preview. */
  restrictedPreview?: boolean;
}

function parseElements(input: DesignerElement[] | string): DesignerElement[] {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function IdCardDesigner({ 
  bgUrl, 
  elements: initialElements, 
  onSave, 
  onClose, 
  templateName, 
  orientation = 'HORIZONTAL', 
  schoolId,
  student,
  isRenderMode = false,
  templateId,
  backBgUrl,
  backElements: initialBackElements = [],
  onSaveAs,
  onRenderReady,
  restrictedPreview: restrictedPreviewProp,
}: IdCardDesignerProps) {
  const { user } = useAuthStore();
  const restrictedPreview =
    restrictedPreviewProp ??
    (!isRenderMode &&
      !!student &&
      !onSave &&
      isRestrictedIdCardPreviewRole(user?.role));
  const sanitizeList = useCallback(
    (list: DesignerElement[]) => list.map((el) => sanitizeElement(el, orientation)),
    [orientation],
  );

  const {
    elements: frontElements,
    setElements: setFrontElements,
    undo,
    redo,
    canUndo,
    canRedo,
    historyVersion,
  } = useDesignerHistory(sanitizeList(parseElements(initialElements)));

  const [backElements, setBackElements] = useState<DesignerElement[]>(() =>
    sanitizeList(parseElements(initialBackElements)),
  );
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropElementId, setCropElementId] = useState<string | null>(null);

  const activeBgUrl = activeSide === 'back' && backBgUrl ? backBgUrl : bgUrl;
  const parsedBg = parseBackground(activeBgUrl);
  const imageSrc =
    parsedBg.mode === 'image' && parsedBg.imageUrl ? resolveMediaUrl(parsedBg.imageUrl) : undefined;
  const [backgroundImage, bgStatus] = useCorsImage(imageSrc ?? '');

  const elements = activeSide === 'front' ? frontElements : backElements;

  const applyElements = useCallback(
    (
      updater: DesignerElement[] | ((prev: DesignerElement[]) => DesignerElement[]),
      recordHistory = false,
    ) => {
      if (activeSide === 'front') {
        setFrontElements(updater, recordHistory);
      } else {
        setBackElements((prev) => (typeof updater === 'function' ? updater(prev) : updater));
      }
    },
    [activeSide, setFrontElements],
  );

  const assetInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingAssetKind = useRef<'schoolLogo' | 'schoolSignature'>('schoolLogo');
  const pendingReplaceElementId = useRef<string | null>(null);
  const assetUploadScope = schoolId || (templateId ? `tpl-${templateId}` : '');
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PPI = isRenderMode ? 300 : DESIGN_PPI;
  const ppiRatio = PPI / DESIGN_PPI;
  const isVertical = orientation === 'VERTICAL';
  const CARD_WIDTH = isVertical ? 2.125 * PPI : 3.375 * PPI;
  const CARD_HEIGHT = isVertical ? 3.375 * PPI : 2.125 * PPI;
  const [scale, setScale] = useState(isRenderMode ? 1 : isVertical ? 1.5 : 2);

  const previewStudent = previewMode ? DESIGNER_MOCK_STUDENT : student;
  const displayElements = useMemo(
    () => scaleElementsForPpi(elements.filter((e) => e.visible !== false), PPI, DESIGN_PPI),
    [elements, PPI, historyVersion],
  );
  const selected = elements.find((el) => el.id === selectedId) ?? null;
  const cropElement = elements.find((el) => el.id === cropElementId);
  const mediaOptions = { usePlaceholder: !isRenderMode || previewMode };
  const cropImageUrl = cropElement ? getElementImageUrl(cropElement, previewStudent, mediaOptions) : '';

  useEffect(() => {
    if (selectedId && transformerRef.current && stageRef.current) {
      const el = elements.find((e) => e.id === selectedId);
      if (!el || usesFrameOnlySelection(el) || isShapeElement(el)) {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
        return;
      }
      const node = stageRef.current.findOne('#' + selectedId);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else {
      transformerRef.current?.nodes([]);
    }
  }, [selectedId, selected?.type, selected?.width, selected?.height, activeSide, historyVersion]);

  useEffect(() => {
    if (!templateId || isRenderMode || !onSave) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const draft = {
        front: frontElements,
        back: backElements,
        updatedAt: Date.now(),
      };
      try {
        localStorage.setItem(`template-draft-${templateId}`, JSON.stringify(draft));
      } catch {
        /* quota */
      }
    }, 2000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [frontElements, backElements, templateId, isRenderMode, onSave]);

  const updateElement = (id: string, patch: Partial<DesignerElement>, recordHistory = false) => {
    applyElements(
      (prev) =>
        prev.map((el) => {
          if (el.id !== id) return el;
          const merged = { ...el, ...patch } as DesignerElement;
          return sanitizeElement(merged, orientation);
        }),
      recordHistory,
    );
  };

  const handleSaveClick = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await Promise.resolve(onSave(frontElements, { side: 'front' }));
      if (backBgUrl || backElements.length > 0) {
        await Promise.resolve(onSave(backElements, { side: 'back' }));
      }
      if (templateId) {
        localStorage.removeItem(`template-draft-${templateId}`);
      }
      toast.success('Template saved');
    } catch {
      /* parent handles toast */
    } finally {
      setSaving(false);
    }
  };

  const insertDesignerElement = (
    partial: Partial<DesignerElement> & Pick<DesignerElement, 'type'>,
    placementFieldType?: string,
  ) => {
    const placement = getDefaultPlacement(
      placementFieldType ?? partial.fieldType,
      partial.type,
      orientation,
      elements.length,
    );
    const snapStep = DESIGN_GRID_STEP;
    const rawX = partial.x ?? placement.x ?? 28;
    const rawY = partial.y ?? placement.y ?? 48;
    const newElement = clampElementToCard(
      {
        id: Math.random().toString(36).slice(2, 11),
        x: Math.round(rawX / snapStep) * snapStep,
        y: Math.round(rawY / snapStep) * snapStep,
        ...(placement.width != null && partial.width == null ? { width: placement.width } : {}),
        ...(placement.height != null && partial.height == null ? { height: placement.height } : {}),
        ...(placement.fontSize != null && partial.fontSize == null ? { fontSize: placement.fontSize } : {}),
        ...(placement.fontFamily && !partial.fontFamily ? { fontFamily: placement.fontFamily } : {}),
        ...(placement.fill && !partial.fill ? { fill: placement.fill } : {}),
        ...partial,
      },
      orientation,
    );
    applyElements((prev) => [...prev, newElement], true);
    setSelectedId(newElement.id);
    return newElement;
  };

  const findAssetReplaceTarget = useCallback(
    (kind: 'schoolLogo' | 'schoolSignature', explicitId: string | null): string | null => {
      if (explicitId) return explicitId;
      if (selectedId) {
        const sel = elements.find((e) => e.id === selectedId);
        if (sel?.fieldType === kind) return selectedId;
      }
      const matches = elements.filter((e) => e.fieldType === kind);
      if (matches.length === 1) return matches[0].id;
      return null;
    },
    [elements, selectedId],
  );

  const openAssetUpload = useCallback(
    (kind: 'schoolLogo' | 'schoolSignature', replaceElementId?: string | null) => {
      if (!assetUploadScope) {
        toast.error('Select a school before uploading logo or signature');
        return;
      }
      pendingAssetKind.current = kind;
      pendingReplaceElementId.current = replaceElementId ?? null;
      assetInputRef.current?.click();
    },
    [assetUploadScope],
  );

  const addElementFromAction = (action: ElementCatalogAction, extra?: Partial<DesignerElement>) => {
    if (action.kind === 'asset') {
      openAssetUpload(action.asset);
      return;
    }
    if (action.kind === 'image') {
      if (!assetUploadScope) {
        toast.error('Select a school before uploading an image');
        return;
      }
      imageInputRef.current?.click();
      return;
    }

    const type = catalogActionToElementType(action);
    const fieldType =
      action.kind === 'text'
        ? action.fieldType
        : action.kind === 'divider'
          ? 'divider'
          : action.kind === 'photo'
            ? 'studentPhoto'
            : undefined;
    const text =
      action.kind === 'text'
        ? action.text
        : action.kind === 'qr'
          ? 'QR'
          : action.kind === 'barcode'
            ? 'Barcode'
            : undefined;

    const shapeDefaults =
      action.kind === 'shape'
        ? { fill: '#3b82f6', width: 80, height: 40, cornerRadius: 8 }
        : action.kind === 'divider'
          ? { fill: '#94a3b8', width: 140, height: 2, fieldType: 'divider' as const }
          : {};

    insertDesignerElement(
      {
      type,
        ...(fieldType ? { fieldType } : {}),
        ...(text ? { text } : {}),
        ...shapeDefaults,
        ...extra,
      },
      fieldType,
    );
  };

  const handleAssetFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!assetUploadScope) {
      toast.error('Select a school before uploading logo or signature');
      return;
    }
    const kind = pendingAssetKind.current;
    const replaceId = findAssetReplaceTarget(kind, pendingReplaceElementId.current);
    pendingReplaceElementId.current = null;
    try {
      const url = await uploadDesignerAsset(file, assetUploadScope, kind);
      if (replaceId) {
        updateElement(
          replaceId,
          {
            type: 'image',
            fieldType: kind,
            imageUrl: url,
            text: kind === 'schoolLogo' ? 'School Logo' : 'Signature',
            photoShape: kind === 'schoolLogo' ? 'circle' : 'rectangle',
          },
          true,
        );
        setSelectedId(replaceId);
        toast.success(kind === 'schoolLogo' ? 'Logo updated' : 'Signature updated');
        return;
      }
      const assetDefaults =
        kind === 'schoolSignature' ? getSignatureDefaults(orientation) : getLogoDefaults(orientation);
      insertDesignerElement(
        {
          type: 'image',
          fieldType: kind,
          imageUrl: url,
          text: kind === 'schoolLogo' ? 'School Logo' : 'Signature',
          photoShape: kind === 'schoolLogo' ? 'circle' : 'rectangle',
          ...assetDefaults,
        },
        kind,
      );
      toast.success(kind === 'schoolLogo' ? 'Logo added' : 'Signature added');
    } catch {
      toast.error('Failed to upload image');
    }
  };

  const handleGenericImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!assetUploadScope) {
      toast.error('Select a school before uploading an image');
      return;
    }
    try {
      const url = await uploadDesignerAsset(file, assetUploadScope, 'schoolLogo');
      insertDesignerElement({
        type: 'image',
        imageUrl: url,
        width: 72,
        height: 72,
      });
      toast.success('Image added');
    } catch {
      toast.error('Failed to upload image');
    }
  };

  const updatePosition = (id: string, x: number, y: number) => {
    applyElements(
      (prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return clampElementToCard(
            { ...item, x: x / ppiRatio, y: y / ppiRatio },
            orientation,
          );
        }),
      true,
    );
  };

  const constrainTransformBox = (oldBox: TransformerBox, newBox: TransformerBox): TransformerBox => {
    const nw = newBox.width ?? 0;
    const nh = newBox.height ?? 0;
    if (nw < 20 || nh < 12) return oldBox;
    const width = Math.min(nw, CARD_WIDTH);
    const height = Math.min(nh, CARD_HEIGHT);
    const x = Math.max(0, Math.min(CARD_WIDTH - width, newBox.x ?? 0));
    const y = Math.max(0, Math.min(CARD_HEIGHT - height, newBox.y ?? 0));
    return {
      ...newBox,
      x,
      y,
      width: Math.min(width, CARD_WIDTH - x),
      height: Math.min(height, CARD_HEIGHT - y),
      rotation: newBox.rotation ?? 0,
    };
  };

  const handleTransformEnd = (id: string, node: Konva.Node) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    applyElements(
      (prev) =>
        prev.map((el) => {
          if (el.id !== id) return el;
          if (el.type === 'text') {
            const designNodeW = node.width() / ppiRatio;
            const next: DesignerElement = {
              ...el,
              x: node.x() / ppiRatio,
              y: node.y() / ppiRatio,
            };
            if (el.fontSize != null || scaleY !== 1) {
              next.fontSize = Math.max(6, Math.round((el.fontSize ?? 12) * scaleY));
            }
            if (el.width != null || scaleX !== 1) {
              const baseW = el.width ?? designNodeW;
              next.width = Math.max(20, Math.round(baseW * scaleX));
            }
            return clampElementToCard(next, orientation);
          }
          const { width: baseW, height: baseH } = getElementSize(el);
          const { width: cardW, height: cardH } = getCardSize(orientation);
          let nextW = Math.max(20, Math.round(baseW * scaleX));
          let nextH = Math.max(20, Math.round(baseH * scaleY));
          if (el.fieldType === 'schoolSignature') {
            const sig = getSignatureDefaults(orientation);
            nextW = Math.min(nextW, Math.round(cardW * 0.65), sig.width ?? nextW);
            nextH = Math.min(nextH, Math.round(cardH * 0.28), (sig.height ?? 40) * 2);
          } else if (el.fieldType === 'schoolLogo') {
            const logo = getLogoDefaults(orientation);
            nextW = Math.min(nextW, Math.round(cardW * 0.5), (logo.width ?? 56) * 2);
            nextH = Math.min(nextH, Math.round(cardH * 0.35), (logo.height ?? 56) * 2);
          }
          return sanitizeElement(
            {
              ...el,
              x: node.x() / ppiRatio,
              y: node.y() / ppiRatio,
              width: nextW,
              height: nextH,
            },
            orientation,
          );
        }),
      true,
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    applyElements((prev) => prev.filter((e) => e.id !== selectedId), true);
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const copy: DesignerElement = {
      ...selected,
      id: Math.random().toString(36).slice(2, 11),
      x: selected.x + 12,
      y: selected.y + 12,
    };
    applyElements((prev) => [...prev, clampElementToCard(copy, orientation)], true);
    setSelectedId(copy.id);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-designer-element');
    if (!raw) return;
    try {
      const action = JSON.parse(raw) as ElementCatalogAction;
      addElementFromAction(action);
    } catch {
      /* ignore */
    }
  };

  const handleExportPng = () => {
    if (restrictedPreview) {
      toast.error('Download is not allowed in preview mode.');
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    try {
      exportStageToPng(stage, `${templateName.replace(/\s+/g, '_')}_${activeSide}.png`);
      toast.success('PNG exported');
    } catch (err) {
      toast.error(err instanceof DesignerExportError ? err.message : 'PNG export failed');
    }
  };

  const handleExportPdf = () => {
    if (restrictedPreview) {
      toast.error('Download is not allowed in preview mode.');
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    void exportStageToPdf(stage, `${templateName.replace(/\s+/g, '_')}_${activeSide}.pdf`, orientation)
      .then(() => toast.success('PDF exported'))
      .catch((err) => {
        toast.error(err instanceof DesignerExportError ? err.message : 'PDF export failed');
      });
  };

  useEffect(() => {
    if (isRenderMode || !onSave) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void handleSaveClick();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        deleteSelected();
      }
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (!selectedId) return;
        const el = elements.find((item) => item.id === selectedId);
        if (!el || el.locked) return;
        e.preventDefault();
        const step = e.shiftKey ? DESIGN_GRID_STEP : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        updateElement(selectedId, { x: el.x + dx, y: el.y + dy }, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!isRenderMode || !onRenderReady) return;
    if (parsedBg.mode === 'image' && imageSrc && bgStatus === 'loading') return;
    const timer = setTimeout(() => onRenderReady(), 800);
    return () => clearTimeout(timer);
  }, [
    isRenderMode,
    onRenderReady,
    parsedBg.mode,
    imageSrc,
    bgStatus,
    backgroundImage,
    displayElements,
    historyVersion,
  ]);

  if (isRenderMode) {
  return (
      <div
        id="id-card-canvas"
        className="bg-white overflow-hidden"
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT, margin: 0, padding: 0 }}
      >
        <Stage width={CARD_WIDTH} height={CARD_HEIGHT} ref={stageRef}>
          <Layer clipX={0} clipY={0} clipWidth={CARD_WIDTH} clipHeight={CARD_HEIGHT}>
            {parsedBg.mode === 'solid' && (
              <Rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={parsedBg.solidColor || '#1e40af'} />
            )}
            {parsedBg.mode === 'gradient' && parsedBg.gradient && (() => {
              const { start, end } = gradientEndPoint(parsedBg.gradient!.angle, CARD_WIDTH, CARD_HEIGHT);
              return (
                <Rect
                  width={CARD_WIDTH}
                  height={CARD_HEIGHT}
                  fillLinearGradientStartPoint={start}
                  fillLinearGradientEndPoint={end}
                  fillLinearGradientColorStops={[0, parsedBg.gradient!.colorStart, 1, parsedBg.gradient!.colorEnd]}
                />
              );
            })()}
            {backgroundImage && <Image image={backgroundImage} width={CARD_WIDTH} height={CARD_HEIGHT} />}
            {displayElements.map((el) => {
              const displayText = student ? resolveStudentField(student, el.fieldType, el.text) : el.text || '';
              if (el.type === 'text') {
                return (
                  <DesignerTextLayer
                    key={el.id}
                    el={el}
                    text={displayText}
                    selected={false}
                    ppiRatio={ppiRatio}
                    cardWidth={CARD_WIDTH}
                    cardHeight={CARD_HEIGHT}
                    orientation={orientation}
                    showFrame={false}
                    draggable={false}
                    onSelect={() => {}}
                    onDragEnd={() => {}}
                    onTransformEnd={() => {}}
                  />
                );
              }
              if (isMediaElement(el)) {
                return (
                  <DesignerMediaLayer
                    key={el.id}
                    el={el}
                    imageUrl={getElementImageUrl(el, student, mediaOptions)}
                    selected={false}
                    ppiRatio={ppiRatio}
                    cardWidth={CARD_WIDTH}
                    cardHeight={CARD_HEIGHT}
                    orientation={orientation}
                    draggable={false}
                    onSelect={() => {}}
                    onDragEnd={() => {}}
                  />
                );
              }
              if (isShapeElement(el)) {
                return (
                  <DesignerShapeLayer
                    key={el.id}
                    el={el}
                    selected={false}
                    ppiRatio={ppiRatio}
                    cardWidth={CARD_WIDTH}
                    cardHeight={CARD_HEIGHT}
                    orientation={orientation}
                    draggable={false}
                    onSelect={() => {}}
                    onDragEnd={() => {}}
                    onTransformEnd={() => {}}
                  />
                );
              }
              if (el.type === 'qr' || el.type === 'barcode') {
                return (
                  <DesignerBoxLayer
                    key={el.id}
                    el={el}
                    selected={false}
                    ppiRatio={ppiRatio}
                    cardWidth={CARD_WIDTH}
                    cardHeight={CARD_HEIGHT}
                    orientation={orientation}
                    draggable={false}
                    onSelect={() => {}}
                    onDragEnd={() => {}}
                    onTransformEnd={() => {}}
                  />
                );
              }
              return null;
            })}
          </Layer>
        </Stage>
          </div>
    );
  }

  return (
    <DesignerSnapProvider
      cardWidth={CARD_WIDTH}
      cardHeight={CARD_HEIGHT}
      ppiRatio={ppiRatio}
      displayElements={displayElements}
      orientation={orientation}
    >
      <DesignerEditorShell
        templateName={templateName}
        activeSide={activeSide}
        previewMode={previewMode}
        scale={scale}
        saving={saving}
        canUndo={canUndo}
        canRedo={canRedo}
        hasSelection={!!selectedId}
        onClose={onClose}
        onSave={() => void handleSaveClick()}
        onSaveAs={onSaveAs}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        onTogglePreview={() => setPreviewMode((p) => !p)}
        onUndo={undo}
        onRedo={redo}
        onZoomIn={() => setScale((s) => Math.min(5, s + 0.25))}
        onZoomOut={() => setScale((s) => Math.max(0.5, s - 0.25))}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
        onToggleSide={() => {
          if (activeSide === 'front' && !backBgUrl) {
            toast.info('Back side uses the same background. Add backConfig via save.');
          }
          setActiveSide((s) => (s === 'front' ? 'back' : 'front'));
          setSelectedId(null);
        }}
        assetInputRef={assetInputRef}
        imageInputRef={imageInputRef}
        onAssetFile={handleAssetFile}
        onGenericImageFile={handleGenericImageFile}
        onSaveProp={onSave}
        addElementFromAction={addElementFromAction}
        canvasScrollRef={canvasScrollRef}
        previewModeBanner={previewMode}
        cardWidth={CARD_WIDTH}
        cardHeight={CARD_HEIGHT}
        stageRef={stageRef}
        onUploadAsset={openAssetUpload}
        onUploadImage={() => {
          if (!assetUploadScope) {
            toast.error('Select a school before uploading an image');
            return;
          }
          imageInputRef.current?.click();
        }}
        setSelectedId={setSelectedId}
        parsedBg={parsedBg}
        backgroundImage={backgroundImage}
        imageSrc={imageSrc}
        bgStatus={bgStatus}
        displayElements={displayElements}
        previewStudent={previewStudent}
        mediaOptions={mediaOptions}
        selectedId={selectedId}
        ppiRatio={ppiRatio}
        updatePosition={updatePosition}
        handleTransformEnd={handleTransformEnd}
        transformerRef={transformerRef}
        constrainTransformBox={constrainTransformBox}
        selected={selected}
        updateElement={updateElement}
        deleteSelected={deleteSelected}
        orientation={orientation}
        previewStudentForPanel={previewStudent}
        cropElementId={cropElementId}
        cropImageUrl={cropImageUrl}
        cropElement={cropElement}
        setCropElementId={setCropElementId}
        handleCanvasDrop={handleCanvasDrop}
        restrictedPreview={restrictedPreview}
      />
    </DesignerSnapProvider>
  );
}

type DesignerEditorShellProps = {
  templateName: string;
  activeSide: 'front' | 'back';
  previewMode: boolean;
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
  assetInputRef: React.RefObject<HTMLInputElement | null>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  onAssetFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGenericImageFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadAsset: (kind: 'schoolLogo' | 'schoolSignature', replaceElementId?: string | null) => void;
  onUploadImage: () => void;
  onSaveProp?: (elements: DesignerElement[], meta?: { side: 'front' | 'back' }) => void | Promise<void>;
  addElementFromAction: (action: ElementCatalogAction, extra?: Partial<DesignerElement>) => void;
  canvasScrollRef: React.RefObject<HTMLDivElement | null>;
  previewModeBanner: boolean;
  cardWidth: number;
  cardHeight: number;
  stageRef: React.RefObject<Konva.Stage | null>;
  setSelectedId: (id: string | null) => void;
  parsedBg: ReturnType<typeof parseBackground>;
  backgroundImage: HTMLImageElement | undefined;
  imageSrc: string | undefined;
  bgStatus: string;
  displayElements: DesignerElement[];
  previewStudent: Record<string, unknown> | undefined;
  mediaOptions: { usePlaceholder?: boolean };
  selectedId: string | null;
  ppiRatio: number;
  updatePosition: (id: string, x: number, y: number) => void;
  handleTransformEnd: (id: string, node: Konva.Node) => void;
  transformerRef: React.RefObject<Konva.Transformer | null>;
  constrainTransformBox: (oldBox: TransformerBox, newBox: TransformerBox) => TransformerBox;
  selected: DesignerElement | null;
  updateElement: (id: string, patch: Partial<DesignerElement>, recordHistory?: boolean) => void;
  deleteSelected: () => void;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  previewStudentForPanel: Record<string, unknown> | undefined;
  cropElementId: string | null;
  cropImageUrl: string;
  cropElement: DesignerElement | undefined;
  setCropElementId: (id: string | null) => void;
  handleCanvasDrop: (e: React.DragEvent) => void;
  restrictedPreview: boolean;
};

function DesignerEditorShell(props: DesignerEditorShellProps) {
  const { showGrid, setShowGrid, snapEnabled, setSnapEnabled } = useDesignerSnap();
  const p = props;
  useRestrictedPreviewGuards(p.restrictedPreview);

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#08080c] flex flex-col overflow-hidden"
      data-restricted-preview-root={p.restrictedPreview ? '' : undefined}
    >
      <DesignerToolbar
        templateName={p.templateName}
        activeSide={p.activeSide}
        previewMode={p.previewMode}
        showGrid={showGrid}
        scale={p.scale}
        saving={p.saving}
        canUndo={p.canUndo}
        canRedo={p.canRedo}
        hasSelection={p.hasSelection}
        onClose={p.onClose}
        onSave={p.onSave}
        onSaveAs={p.onSaveAs}
        onExportPng={p.onExportPng}
        onExportPdf={p.onExportPdf}
        onTogglePreview={p.onTogglePreview}
        onUndo={p.onUndo}
        onRedo={p.onRedo}
        onZoomIn={p.onZoomIn}
        onZoomOut={p.onZoomOut}
        onDelete={p.onDelete}
        onDuplicate={p.onDuplicate}
        onToggleSide={p.onToggleSide}
        onToggleGrid={() => setShowGrid((g) => !g)}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        readOnlyPreview={p.restrictedPreview}
        restrictExport={p.restrictedPreview}
      />

      <input ref={p.assetInputRef} type="file" accept="image/*" className="hidden" onChange={p.onAssetFile} />
      <input ref={p.imageInputRef} type="file" accept="image/*" className="hidden" onChange={p.onGenericImageFile} />

      <div className="flex-1 flex min-h-0">
        {p.onSaveProp && (
          <DesignerElementsSidebar
            onAdd={p.addElementFromAction}
            onUploadImage={p.onUploadImage}
            onUploadAsset={p.onUploadAsset}
          />
        )}

        <div
          ref={p.canvasScrollRef}
          tabIndex={0}
          className="flex-1 relative overflow-auto designer-scroll flex items-center justify-center p-8 bg-[#121218] outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={p.handleCanvasDrop}
          onMouseDown={() => p.canvasScrollRef.current?.focus({ preventScroll: true })}
          onContextMenu={p.restrictedPreview ? (e) => e.preventDefault() : undefined}
        >
          {p.previewModeBanner && !p.restrictedPreview && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-[10px] font-bold text-amber-200 uppercase tracking-wider">
              Preview — sample student data
            </div>
          )}
          {showGrid && (
            <div className="absolute bottom-4 left-4 z-10 text-[10px] font-medium text-white/40 pointer-events-none max-w-xs">
              Drag freely · Arrow keys move selection (Shift = 8px) · Snap via toolbar magnet
          </div>
        )}
          <div
            style={{ width: p.cardWidth * p.scale, height: p.cardHeight * p.scale }}
            id="id-card-canvas"
            className={cn(
              'bg-white relative shadow-2xl shadow-black/50 ring-1 ring-white/10 rounded-sm',
              p.restrictedPreview && 'restricted-id-card-canvas',
            )}
          >
            <Stage
              width={p.cardWidth * p.scale}
              height={p.cardHeight * p.scale}
              scaleX={p.scale}
              scaleY={p.scale}
              ref={p.stageRef}
              listening={!p.restrictedPreview}
              onMouseDown={(e) => {
                if (p.restrictedPreview) return;
                p.canvasScrollRef.current?.focus({ preventScroll: true });
                if (e.target === e.target.getStage()) p.setSelectedId(null);
              }}
            >
              <Layer clipX={0} clipY={0} clipWidth={p.cardWidth} clipHeight={p.cardHeight}>
                {p.parsedBg.mode === 'solid' && (
                  <Rect width={p.cardWidth} height={p.cardHeight} fill={p.parsedBg.solidColor || '#1e40af'} />
                )}
                {p.parsedBg.mode === 'gradient' && p.parsedBg.gradient && (() => {
                  const { start, end } = gradientEndPoint(p.parsedBg.gradient!.angle, p.cardWidth, p.cardHeight);
                  return (
                    <Rect
                      width={p.cardWidth}
                      height={p.cardHeight}
                      fillLinearGradientStartPoint={start}
                      fillLinearGradientEndPoint={end}
                      fillLinearGradientColorStops={[0, p.parsedBg.gradient!.colorStart, 1, p.parsedBg.gradient!.colorEnd]}
                    />
                  );
                })()}
                {p.backgroundImage && <Image image={p.backgroundImage} width={p.cardWidth} height={p.cardHeight} />}
                {p.parsedBg.mode === 'image' && !p.backgroundImage && p.imageSrc && p.bgStatus === 'loading' && (
                  <Text text="Loading…" x={20} y={20} fontSize={14} fill="#94a3b8" />
                )}
                <DesignerCanvasGrid cardWidth={p.cardWidth} cardHeight={p.cardHeight} />
                {p.displayElements.map((el) => {
                  const sourceId = el.id;
                  const displayText = p.previewStudent
                    ? resolveStudentField(p.previewStudent, el.fieldType, el.text)
                    : el.text || '';

                  if (el.type === 'text') {
                    return (
                      <DesignerTextLayer
                        key={el.id}
                        el={el}
                        text={displayText}
                        selected={p.selectedId === sourceId}
                        ppiRatio={p.ppiRatio}
                        cardWidth={p.cardWidth}
                        cardHeight={p.cardHeight}
                        orientation={p.orientation}
                        showFrame={!!p.onSaveProp}
                        draggable={!!p.onSaveProp && !el.locked}
                        onSelect={() => p.setSelectedId(sourceId)}
                        onDragEnd={(x, y) => p.updatePosition(sourceId, x, y)}
                        onTransformEnd={(node) => p.handleTransformEnd(sourceId, node)}
                      />
                    );
                  }
                  if (isMediaElement(el)) {
                    return (
                      <DesignerMediaLayer
                        key={el.id}
                        el={el}
                        imageUrl={getElementImageUrl(el, p.previewStudent, p.mediaOptions)}
                        selected={p.selectedId === sourceId}
                        ppiRatio={p.ppiRatio}
                        cardWidth={p.cardWidth}
                        cardHeight={p.cardHeight}
                        orientation={p.orientation}
                        showFrame={!!p.onSaveProp}
                        draggable={!!p.onSaveProp && !el.locked}
                        onSelect={() => p.setSelectedId(sourceId)}
                        onDragEnd={(x, y) => p.updatePosition(sourceId, x, y)}
                        onTransformEnd={(node) => p.handleTransformEnd(sourceId, node)}
                      />
                    );
                  }
                  if (isShapeElement(el)) {
                    return (
                      <DesignerShapeLayer
                        key={el.id}
                        el={el}
                        selected={p.selectedId === sourceId}
                        ppiRatio={p.ppiRatio}
                        cardWidth={p.cardWidth}
                        cardHeight={p.cardHeight}
                        orientation={p.orientation}
                        draggable={!!p.onSaveProp && !el.locked}
                        onSelect={() => p.setSelectedId(sourceId)}
                        onDragEnd={(x, y) => p.updatePosition(sourceId, x, y)}
                        onTransformEnd={(node) => p.handleTransformEnd(sourceId, node)}
                      />
                    );
                  }
                  if (el.type === 'qr' || el.type === 'barcode') {
                    return (
                      <DesignerBoxLayer
                        key={el.id}
                        el={el}
                        selected={p.selectedId === sourceId}
                        ppiRatio={p.ppiRatio}
                        cardWidth={p.cardWidth}
                        cardHeight={p.cardHeight}
                        orientation={p.orientation}
                        draggable={!!p.onSaveProp && !el.locked}
                        onSelect={() => p.setSelectedId(sourceId)}
                        onDragEnd={(x, y) => p.updatePosition(sourceId, x, y)}
                        onTransformEnd={(node) => p.handleTransformEnd(sourceId, node)}
                      />
                    );
                  }
                  return null;
                })}
                {p.onSaveProp && !p.restrictedPreview && (
                  <Transformer ref={p.transformerRef} boundBoxFunc={p.constrainTransformBox} />
                )}
              </Layer>
            </Stage>
            {p.restrictedPreview && <DesignerRestrictedWatermark />}
          </div>
        </div>

        {p.onSaveProp && (
          <aside className="w-[300px] shrink-0 border-l border-white/[0.08] bg-[#0d0d12] overflow-y-auto designer-scroll">
            <div className="px-4 py-3 border-b border-white/[0.08]">
              <p className="text-xs font-black text-white/90">Properties</p>
              </div>
            <DesignerPropertiesPanel
              selected={p.selected}
              onUpdate={(patch) => p.selectedId && p.updateElement(p.selectedId, patch, true)}
              onRemove={p.deleteSelected}
              orientation={p.orientation}
              onCenterOnCard={() => {
                if (!p.selectedId || !p.selected) return;
                if (p.selected.fieldType === 'schoolSignature') {
                  p.updateElement(p.selectedId, getSignatureDefaults(p.orientation), true);
                } else if (p.selected.fieldType === 'schoolLogo') {
                  p.updateElement(p.selectedId, getLogoDefaults(p.orientation), true);
                } else {
                  const { width, height } = getElementSize(p.selected);
                  p.updateElement(p.selectedId, getCenteredPlacement(p.orientation, width, height), true);
                }
              }}
              onOpenCrop={() => {
                if (!p.selected || !isMediaElement(p.selected)) return;
                const url = getElementImageUrl(p.selected, p.previewStudentForPanel, p.mediaOptions);
                if (!url) {
                  toast.error('Add an image before cropping');
                  return;
                }
                p.setCropElementId(p.selected.id);
              }}
              onReplaceAsset={
                p.selected?.fieldType === 'schoolLogo' || p.selected?.fieldType === 'schoolSignature'
                  ? (kind) => {
                      if (!p.selectedId) return;
                      p.onUploadAsset(kind, p.selectedId);
                    }
                  : undefined
              }
            />
          </aside>
        )}
      </div>

      {p.cropElementId && p.cropImageUrl && (
        <ImageCropDialog
          imageUrl={p.cropImageUrl}
          initialCrop={p.cropElement?.crop}
          onClose={() => p.setCropElementId(null)}
          onApply={(crop) => {
            if (!p.cropElementId) return;
            p.updateElement(p.cropElementId, { crop: clampCrop(crop) }, true);
            p.setCropElementId(null);
            toast.success('Crop applied');
          }}
        />
      )}

      <style jsx global>{`
        .designer-scroll {
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }
        .designer-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .designer-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .designer-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 999px;
        }
        @media print {
          [data-restricted-preview-root],
          .restricted-id-card-canvas {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

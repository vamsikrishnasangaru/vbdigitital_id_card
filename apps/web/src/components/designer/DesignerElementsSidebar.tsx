'use client';

import { cn } from '@/lib/utils';
import {
  BASIC_ELEMENTS,
  SCHOOL_ASSETS,
  STUDENT_FIELDS,
  type CatalogItem,
  type ElementCatalogAction,
} from './designer-elements-catalog';

interface DesignerElementsSidebarProps {
  onAdd: (action: ElementCatalogAction) => void;
  onUploadImage: () => void;
  onUploadAsset: (kind: 'schoolLogo' | 'schoolSignature', replaceElementId?: string | null) => void;
  className?: string;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold text-white/35 uppercase tracking-[0.2em] px-1">{title}</h4>
      {children}
    </div>
  );
}

function ElementButton({
  item,
  onClick,
}: {
  item: CatalogItem;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-designer-element', JSON.stringify(item.action));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border border-white/[0.06]',
        'bg-white/[0.04] hover:bg-white/[0.09] hover:border-white/15 transition-all',
        'text-[10px] font-bold text-white/55 hover:text-white/90 cursor-grab active:cursor-grabbing',
      )}
      title={item.hint}
    >
      <Icon className="h-4 w-4 shrink-0 text-primary/80" />
      <span className="text-center leading-tight line-clamp-2">{item.label}</span>
    </button>
  );
}

export function DesignerElementsSidebar({
  onAdd,
  onUploadImage,
  onUploadAsset,
  className,
}: DesignerElementsSidebarProps) {
  return (
    <aside
      className={cn(
        'w-[260px] shrink-0 border-r border-white/[0.08] bg-[#0d0d12] flex flex-col min-h-0 h-full max-h-full overflow-hidden',
        className,
      )}
    >
      <div className="px-4 py-3 border-b border-white/[0.08] shrink-0">
        <p className="text-xs font-black text-white/90">Elements</p>
        <p className="text-[10px] text-white/40 mt-0.5">Click or drag onto the card</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain designer-scroll p-3 space-y-5 [-webkit-overflow-scrolling:touch]">
        <Section title="Basic">
          <div className="grid grid-cols-2 gap-2">
            {BASIC_ELEMENTS.map((item) => (
              <ElementButton
                key={item.id}
                item={item}
                onClick={() => {
                  if (item.action.kind === 'image') onUploadImage();
                  else if (item.action.kind === 'asset') onUploadAsset(item.action.asset);
                  else onAdd(item.action);
                }}
              />
            ))}
          </div>
        </Section>

        <Section title="School assets">
          <div className="space-y-1.5">
            {SCHOOL_ASSETS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onUploadAsset(item.action.kind === 'asset' ? item.action.asset : 'schoolLogo')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.06] text-[11px] font-medium text-white/70"
              >
                <item.icon className="h-4 w-4 text-primary/80 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Student fields">
          <div className="space-y-1 pr-0.5">
            {STUDENT_FIELDS.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-designer-element', JSON.stringify(item.action));
                }}
                onClick={() => onAdd(item.action)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-left group"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <item.icon className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                  <span className="text-[11px] font-medium text-white/65 truncate">{item.label}</span>
                </span>
                {item.hint && (
                  <span className="text-[9px] font-mono text-white/25 shrink-0 hidden group-hover:inline">
                    {item.hint.replace(/\{\{|\}\}/g, '')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
}

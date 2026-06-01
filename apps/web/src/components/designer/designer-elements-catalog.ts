import type { LucideIcon } from 'lucide-react';
import {
  Type, ImageIcon, User, QrCode, Barcode, Square, Minus, Stamp, Building2,
  GraduationCap, Hash, Droplets, Phone, MapPin, Calendar, Radio,
} from 'lucide-react';
import type { DesignerElement } from '@/lib/designer-utils';
import { STUDENT_FIELD_CATALOG } from '@/lib/designer-mock-student';

export type ElementCatalogAction =
  | { kind: 'text'; fieldType?: string; text?: string }
  | { kind: 'photo' }
  | { kind: 'image' }
  | { kind: 'qr' }
  | { kind: 'barcode' }
  | { kind: 'shape' }
  | { kind: 'divider' }
  | { kind: 'asset'; asset: 'schoolLogo' | 'schoolSignature' };

export interface CatalogItem {
  id: string;
  label: string;
  icon: LucideIcon;
  action: ElementCatalogAction;
  hint?: string;
}

const FIELD_ICONS: Record<string, LucideIcon> = {
  fullName: GraduationCap,
  admissionNo: Hash,
  rollNo: Hash,
  classSection: GraduationCap,
  bloodGroup: Droplets,
  aadharCard: Hash,
  parentName: User,
  parentPhone: Phone,
  address: MapPin,
  dob: Calendar,
  rfid: Radio,
};

export const BASIC_ELEMENTS: CatalogItem[] = [
  { id: 'text', label: 'Text', icon: Type, action: { kind: 'text', fieldType: 'custom', text: 'New Text' } },
  { id: 'image', label: 'Image', icon: ImageIcon, action: { kind: 'image' } },
  { id: 'photo', label: 'Student Photo', icon: User, action: { kind: 'photo' } },
  { id: 'qr', label: 'QR Code', icon: QrCode, action: { kind: 'qr' } },
  { id: 'barcode', label: 'Barcode', icon: Barcode, action: { kind: 'barcode' } },
  { id: 'shape', label: 'Shape', icon: Square, action: { kind: 'shape' } },
  { id: 'divider', label: 'Divider', icon: Minus, action: { kind: 'divider' } },
  { id: 'logo', label: 'Logo', icon: Building2, action: { kind: 'asset', asset: 'schoolLogo' } },
  { id: 'signature', label: 'Signature', icon: Stamp, action: { kind: 'asset', asset: 'schoolSignature' } },
];

export const SCHOOL_ASSETS: CatalogItem[] = [
  { id: 'logo-upload', label: 'Upload Logo', icon: Building2, action: { kind: 'asset', asset: 'schoolLogo' } },
  { id: 'signature-upload', label: 'Upload Signature', icon: Stamp, action: { kind: 'asset', asset: 'schoolSignature' } },
];

export const STUDENT_FIELDS: CatalogItem[] = STUDENT_FIELD_CATALOG.map((f) => ({
  id: f.fieldType,
  label: f.label,
  icon: FIELD_ICONS[f.fieldType] ?? Type,
  action: { kind: 'text' as const, fieldType: f.fieldType, text: f.label },
  hint: f.placeholder,
}));

export function catalogActionToElementType(action: ElementCatalogAction): DesignerElement['type'] {
  switch (action.kind) {
    case 'text':
      return 'text';
    case 'photo':
      return 'photo';
    case 'image':
      return 'image';
    case 'qr':
      return 'qr';
    case 'barcode':
      return 'barcode';
    case 'shape':
    case 'divider':
      return 'shape';
    default:
      return 'image';
  }
}

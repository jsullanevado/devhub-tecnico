import { BaseResource, BaseResourceInput } from './common.models';

// Mantener sincronizado con el CHECK manuals_category_valid.
export const MANUAL_CATEGORIES = [
  { value: 'manual', label: 'Manual' },
  { value: 'architecture', label: 'Arquitectura' },
  { value: 'reference', label: 'Referencia' },
  { value: 'guide', label: 'Guía' },
  { value: 'other', label: 'Otros' },
] as const;

export type ManualCategory = (typeof MANUAL_CATEGORIES)[number]['value'];

/**
 * Tipos de archivo permitidos. Mantener sincronizado con el bucket
 * devhub-documents, la política de subida y el CHECK manuals_mime_type_valid.
 * `aliases`: MIME alternativos que algunos navegadores asignan al mismo formato.
 */
export const MANUAL_FILE_TYPES = [
  { extension: 'pdf', mime: 'application/pdf', label: 'PDF', aliases: [] },
  {
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word',
    aliases: [],
  },
  {
    extension: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel',
    aliases: [],
  },
  {
    extension: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint',
    aliases: [],
  },
  { extension: 'txt', mime: 'text/plain', label: 'Texto', aliases: [] },
  {
    extension: 'md',
    mime: 'text/markdown',
    label: 'Markdown',
    aliases: ['text/x-markdown', 'text/plain'],
  },
  { extension: 'png', mime: 'image/png', label: 'PNG', aliases: [] },
  { extension: 'jpg', mime: 'image/jpeg', label: 'JPEG', aliases: [] },
  { extension: 'jpeg', mime: 'image/jpeg', label: 'JPEG', aliases: [] },
  { extension: 'webp', mime: 'image/webp', label: 'WebP', aliases: [] },
] as const satisfies readonly ManualFileType[];

export interface ManualFileType {
  extension: string;
  mime: string;
  label: string;
  aliases: readonly string[];
}

/** Sincronizado con el bucket y manuals_file_size_range (migración 20261009000000). */
export const MANUAL_MAX_FILE_MB = 50;
export const MANUAL_MAX_FILE_BYTES = MANUAL_MAX_FILE_MB * 1024 * 1024;

/** Valor para <input type="file" accept="...">. */
export const MANUAL_ACCEPT_ATTRIBUTE = MANUAL_FILE_TYPES.map((type) => `.${type.extension}`).join(
  ',',
);

export interface Manual extends BaseResource {
  category: ManualCategory;
  version: string | null;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  download_count: number;
}

/** Metadatos editables por el usuario (el archivo se gestiona aparte). */
export interface ManualInput extends BaseResourceInput {
  category?: ManualCategory;
  version?: string | null;
}

/** Fila completa que se inserta tras subir el archivo. */
export interface ManualRecordInput extends ManualInput {
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
}

export interface ManualFilters {
  category?: ManualCategory;
}

/** Tipo de vista previa que admite el navegador para cada MIME (null = solo descarga). */
export type ManualPreviewKind = 'pdf' | 'image' | 'text' | 'markdown';

export function manualPreviewKind(mime: string): ManualPreviewKind | null {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
      return 'image';
    case 'text/plain':
      return 'text';
    case 'text/markdown':
      return 'markdown';
    default:
      return null;
  }
}

export function manualFileLabel(mime: string): string {
  return MANUAL_FILE_TYPES.find((type) => type.mime === mime)?.label ?? 'Archivo';
}

export type ManualFileValidation =
  { valid: true; type: ManualFileType } | { valid: false; message: string };

/**
 * Validación en cliente por extensión, MIME declarado y tamaño.
 * El contenido real no se inspecciona aquí; la autoridad final son el bucket y la BD.
 */
export function validateManualFile(
  file: Pick<File, 'name' | 'size' | 'type'>,
): ManualFileValidation {
  const extension = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';
  const type = MANUAL_FILE_TYPES.find((candidate) => candidate.extension === extension);

  if (!type) {
    const allowed = MANUAL_FILE_TYPES.map((candidate) => candidate.extension).join(', ');
    return {
      valid: false,
      message: `Tipo de archivo no permitido. Formatos aceptados: ${allowed}.`,
    };
  }
  if (file.size <= 0) {
    return { valid: false, message: 'El archivo está vacío.' };
  }
  if (file.size > MANUAL_MAX_FILE_BYTES) {
    return { valid: false, message: `El archivo supera el tamaño máximo de ${MANUAL_MAX_FILE_MB} MB.` };
  }

  // Algunos navegadores no informan el MIME (cadena vacía u octet-stream): se usa el de la extensión.
  const declared = file.type.toLowerCase();
  const isGeneric = declared === '' || declared === 'application/octet-stream';
  const aliases: readonly string[] = type.aliases;
  if (!isGeneric && declared !== type.mime && !aliases.includes(declared)) {
    return { valid: false, message: 'El tipo del archivo no coincide con su extensión.' };
  }

  return { valid: true, type };
}

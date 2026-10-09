import { BaseResource, BaseResourceInput } from './common.models';

// Mantener sincronizado con los CHECK de lessons_learned.
export const LESSON_SEVERITIES = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
] as const;

export const LESSON_CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'performance', label: 'Rendimiento' },
  { value: 'security', label: 'Seguridad' },
  { value: 'infrastructure', label: 'Infraestructura' },
  { value: 'integration', label: 'Integración' },
  { value: 'configuration', label: 'Configuración' },
  { value: 'process', label: 'Proceso' },
  { value: 'other', label: 'Otros' },
] as const;

export const LESSON_STATUSES = [
  { value: 'open', label: 'Abierta' },
  { value: 'resolved', label: 'Resuelta' },
  { value: 'archived', label: 'Archivada' },
] as const;

export type LessonSeverity = (typeof LESSON_SEVERITIES)[number]['value'];
export type LessonCategory = (typeof LESSON_CATEGORIES)[number]['value'];
export type LessonStatus = (typeof LESSON_STATUSES)[number]['value'];

export const LESSON_LIMITS = {
  textMax: 20_000,
  technologyMax: 60,
} as const;

/** Versión de listado: sin los campos de texto largos. */
export interface LessonSummary extends BaseResource {
  severity: LessonSeverity;
  technology: string | null;
  category: LessonCategory;
  status: LessonStatus;
  occurred_on: string | null;
}

export interface LessonLearned extends LessonSummary {
  problem: string;
  root_cause: string | null;
  solution: string | null;
  conclusion: string | null;
}

export interface LessonInput extends BaseResourceInput {
  problem: string;
  root_cause?: string | null;
  /** Obligatoria cuando status = 'resolved'. */
  solution?: string | null;
  conclusion?: string | null;
  severity?: LessonSeverity;
  technology?: string | null;
  category?: LessonCategory;
  status?: LessonStatus;
  /** Fecha ISO (YYYY-MM-DD). */
  occurred_on?: string | null;
}

export interface LessonFilters {
  severity?: LessonSeverity;
  category?: LessonCategory;
  status?: LessonStatus;
  technology?: string;
}

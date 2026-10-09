import { BaseResource, BaseResourceInput } from './common.models';

// Mantener sincronizado con el CHECK scripts_category_valid.
export const SCRIPT_CATEGORIES = [
  { value: 'soap', label: 'SOAP' },
  { value: 'rest', label: 'REST' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'other', label: 'Otros' },
] as const;

export type ScriptCategory = (typeof SCRIPT_CATEGORIES)[number]['value'];

/** Identificador de lenguaje para el resaltado de sintaxis. */
export const SCRIPT_LANGUAGE_PATTERN = /^[a-z0-9+#-]{1,30}$/;

/** Lenguajes ofrecidos en la interfaz (resaltado de sintaxis y extensión de descarga). */
export const SCRIPT_LANGUAGES = [
  { value: 'plaintext', label: 'Texto plano', extension: 'txt' },
  { value: 'xml', label: 'XML / SOAP', extension: 'xml' },
  { value: 'json', label: 'JSON', extension: 'json' },
  { value: 'sql', label: 'SQL', extension: 'sql' },
  { value: 'bash', label: 'Bash / Shell', extension: 'sh' },
  { value: 'powershell', label: 'PowerShell', extension: 'ps1' },
  { value: 'python', label: 'Python', extension: 'py' },
  { value: 'javascript', label: 'JavaScript', extension: 'js' },
  { value: 'typescript', label: 'TypeScript', extension: 'ts' },
  { value: 'java', label: 'Java', extension: 'java' },
  { value: 'yaml', label: 'YAML', extension: 'yaml' },
  { value: 'graphql', label: 'GraphQL', extension: 'graphql' },
] as const;

export type ScriptLanguage = (typeof SCRIPT_LANGUAGES)[number]['value'];

/** Lenguaje sugerido al elegir categoría. */
export const DEFAULT_LANGUAGE_BY_CATEGORY: Record<ScriptCategory, ScriptLanguage> = {
  soap: 'xml',
  rest: 'json',
  sql: 'sql',
  bash: 'bash',
  powershell: 'powershell',
  python: 'python',
  javascript: 'javascript',
  graphql: 'graphql',
  other: 'plaintext',
};

export function scriptLanguageLabel(language: string): string {
  return SCRIPT_LANGUAGES.find((item) => item.value === language)?.label ?? language;
}

/** Nombre de archivo para descargar: título sin tildes ni símbolos + extensión del lenguaje. */
export function scriptFileName(script: { title: string; language: string }): string {
  const slug = script.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const extension = SCRIPT_LANGUAGES.find((item) => item.value === script.language)?.extension;
  return `${slug || 'script'}.${extension ?? 'txt'}`;
}

export const SCRIPT_LIMITS = {
  contentMax: 200_000,
} as const;

/** Versión de listado: sin `content` para aligerar la carga. */
export interface ScriptSummary extends BaseResource {
  category: ScriptCategory;
  language: string;
  is_template: boolean;
}

export interface Script extends ScriptSummary {
  content: string;
}

export interface ScriptInput extends BaseResourceInput {
  content: string;
  category: ScriptCategory;
  language?: string;
  is_template?: boolean;
}

export interface ScriptFilters {
  category?: ScriptCategory;
  language?: string;
  isTemplate?: boolean;
}

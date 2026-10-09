/**
 * Comparación de dos carpetas por CONTENIDO (SHA-256), nunca por fechas.
 * Lógica pura e independiente del origen de los archivos: el servicio
 * (folder-compare.service.ts) adapta las carpetas elegidas en el navegador a
 * FolderSnapshot. Nada se envía a ningún servidor.
 */

/** Carpetas que se ignoran en cualquier nivel (pesadas o autogeneradas). */
export const FOLDER_COMPARE_EXCLUDED = [
  'node_modules',
  '.angular',
  'dist',
  '.vscode',
  'coverage',
  '.git',
  '.idea',
  'docs',
] as const;

const EXCLUDED = new Set<string>(FOLDER_COMPARE_EXCLUDED.map((name) => name.toLowerCase()));

/** Archivos que se leen a la vez al calcular hashes. */
const HASH_CONCURRENCY = 4;

export interface FolderFile {
  /** Ruta relativa a la carpeta elegida, con "/" (p. ej. "src/app/app.ts"). */
  path: string;
  size: number;
  read(): Promise<ArrayBuffer>;
}

export interface FolderSnapshot {
  /** Nombre de la carpeta elegida (solo informativo). */
  name: string;
  files: FolderFile[];
}

export interface FolderComparison {
  /** Rutas presentes en ambas carpetas con contenido distinto. */
  modified: string[];
  onlyInOrigin: string[];
  onlyInTarget: string[];
  identical: number;
  /** Archivos presentes en ambas carpetas (comparados). */
  compared: number;
  durationMs: number;
}

export interface CompareProgress {
  done: number;
  total: number;
}

export interface CompareOptions {
  signal?: AbortSignal;
  onProgress?: (progress: CompareProgress) => void;
  /** Inyectable para pruebas; por defecto SHA-256 con Web Crypto. */
  hash?: (data: ArrayBuffer) => Promise<string>;
}

/** ¿Está la ruta (o alguna carpeta que la contiene) en la lista de exclusiones? */
export function isExcludedPath(path: string): boolean {
  const segments = path.split(/[\\/]/).filter(Boolean);
  // El último segmento es el archivo: solo se excluyen carpetas.
  return segments.slice(0, -1).some((segment) => EXCLUDED.has(segment.toLowerCase()));
}

export function isExcludedFolder(name: string): boolean {
  return EXCLUDED.has(name.toLowerCase());
}

/** "src/app/app.ts" → "\src\app\app.ts" (formato de salida pedido). */
export function toDisplayPath(path: string): string {
  return '\\' + path.split(/[\\/]/).filter(Boolean).join('\\');
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Clave de emparejamiento: Windows no distingue mayúsculas en las rutas. */
const keyOf = (path: string) => path.split(/[\\/]/).filter(Boolean).join('/').toLowerCase();

const byPath = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });

/**
 * Compara dos carpetas. Un archivo es "modificado" si está en ambas y su
 * contenido difiere. Si los tamaños ya son distintos, el contenido difiere sin
 * necesidad de leerlo; si coinciden, se compara el hash SHA-256 de ambos.
 */
export async function compareFolders(
  origin: FolderSnapshot,
  target: FolderSnapshot,
  options: CompareOptions = {},
): Promise<FolderComparison> {
  const started = performance.now();
  const hash = options.hash ?? sha256Hex;
  const originFiles = new Map(
    origin.files
      .filter((file) => !isExcludedPath(file.path))
      .map((file) => [keyOf(file.path), file]),
  );
  const targetFiles = new Map(
    target.files
      .filter((file) => !isExcludedPath(file.path))
      .map((file) => [keyOf(file.path), file]),
  );

  const pairs: [FolderFile, FolderFile][] = [];
  const onlyInOrigin: string[] = [];
  for (const [key, file] of originFiles) {
    const other = targetFiles.get(key);
    if (other) {
      pairs.push([file, other]);
    } else {
      onlyInOrigin.push(file.path);
    }
  }
  const onlyInTarget = [...targetFiles]
    .filter(([key]) => !originFiles.has(key))
    .map(([, file]) => file.path);

  const modified: string[] = [];
  let done = 0;
  options.onProgress?.({ done, total: pairs.length });

  let next = 0;
  const worker = async () => {
    while (next < pairs.length) {
      options.signal?.throwIfAborted();
      const [a, b] = pairs[next++];
      if (a.size !== b.size) {
        modified.push(a.path);
      } else {
        const [hashA, hashB] = await Promise.all([a.read().then(hash), b.read().then(hash)]);
        if (hashA !== hashB) {
          modified.push(a.path);
        }
      }
      options.onProgress?.({ done: ++done, total: pairs.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(HASH_CONCURRENCY, pairs.length) }, worker));
  options.signal?.throwIfAborted();

  return {
    modified: modified.sort(byPath),
    onlyInOrigin: onlyInOrigin.sort(byPath),
    onlyInTarget: onlyInTarget.sort(byPath),
    identical: pairs.length - modified.length,
    compared: pairs.length,
    durationMs: Math.round(performance.now() - started),
  };
}

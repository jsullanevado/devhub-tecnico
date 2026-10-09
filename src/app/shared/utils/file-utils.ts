import { AppError } from '../../core/errors/app-error';

/** Descarga texto generado en el navegador (no pasa por el servidor). */
export function downloadTextFile(fileName: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Abre una URL de descarga (p. ej. URL firmada de Storage con
 * Content-Disposition: attachment) sin abandonar la aplicación.
 */
export function openDownloadUrl(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  document.body.append(link);
  link.click();
  link.remove();
}

export async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new AppError(
      'unknown',
      'El portapapeles no está disponible (requiere HTTPS o localhost).',
    );
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    throw new AppError('forbidden', 'El navegador no permitió copiar al portapapeles.', {
      cause: error,
    });
  }
}

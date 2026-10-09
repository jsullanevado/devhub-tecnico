const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Tamaño legible en español: 1536 → "1,5 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const formatted = new Intl.NumberFormat('es', {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(value);
  return `${formatted} ${UNITS[exponent]}`;
}

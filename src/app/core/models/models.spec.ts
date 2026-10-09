import { STORAGE_QUOTA_BYTES, storageUsagePercent } from './dashboard.models';
import { areTagsValid, normalizeTags } from './common.models';
import { MANUAL_MAX_FILE_BYTES, validateManualFile } from './manual.models';

describe('normalizeTags', () => {
  it('replica private.normalize_tags', () => {
    expect(normalizeTags(['SQL', '  Oracle ', 'sql', ''])).toEqual(['oracle', 'sql']);
  });
});

describe('areTagsValid', () => {
  it('acepta etiquetas técnicas con tildes y símbolos', () => {
    expect(areTagsValid(['spring-boot', 'c#', '.net', 'autenticación'])).toBe(true);
  });

  it('rechaza espacios y exceso de etiquetas', () => {
    expect(areTagsValid(['con espacio'])).toBe(false);
    expect(areTagsValid(Array.from({ length: 21 }, (_, i) => `t${i}`))).toBe(false);
  });
});

describe('validateManualFile', () => {
  const file = (name: string, size: number, type: string) => ({ name, size, type });

  it('acepta un PDF válido', () => {
    const result = validateManualFile(file('guia.pdf', 1024, 'application/pdf'));
    expect(result.valid).toBe(true);
  });

  it('acepta Markdown sin MIME declarado y usa text/markdown', () => {
    const result = validateManualFile(file('README.md', 10, ''));
    expect(result.valid && result.type.mime).toBe('text/markdown');
  });

  it('rechaza extensiones no permitidas, vacíos y archivos grandes', () => {
    expect(validateManualFile(file('logo.svg', 10, 'image/svg+xml')).valid).toBe(false);
    expect(validateManualFile(file('vacio.pdf', 0, 'application/pdf')).valid).toBe(false);
    expect(
      validateManualFile(file('enorme.pdf', MANUAL_MAX_FILE_BYTES + 1, 'application/pdf')).valid,
    ).toBe(false);
  });

  it('rechaza MIME que no coincide con la extensión', () => {
    expect(validateManualFile(file('falso.pdf', 10, 'text/html')).valid).toBe(false);
  });
});

describe('storageUsagePercent', () => {
  it('calcula el porcentaje de la cuota con un decimal y lo limita a 0–100', () => {
    expect(storageUsagePercent(0)).toBe(0);
    expect(storageUsagePercent(300 * 1024 ** 2)).toBe(29.3);
    expect(storageUsagePercent(-5)).toBe(0);
    expect(storageUsagePercent(STORAGE_QUOTA_BYTES * 2)).toBe(100);
  });
});

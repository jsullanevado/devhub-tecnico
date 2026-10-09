import { matchesFileSignature } from './file-signature';

const blob = (...parts: (number[] | string)[]) =>
  new Blob(parts.map((part) => (typeof part === 'string' ? part : new Uint8Array(part))));

describe('matchesFileSignature', () => {
  it('reconoce un PDF real', async () => {
    expect(await matchesFileSignature(blob('%PDF-1.7\n...'), 'pdf')).toBe(true);
  });

  it('rechaza HTML renombrado a .pdf', async () => {
    expect(await matchesFileSignature(blob('<html><script>alert(1)</script>'), 'pdf')).toBe(false);
  });

  it('reconoce PNG, JPEG, WebP y documentos Office (ZIP)', async () => {
    expect(
      await matchesFileSignature(blob([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'png'),
    ).toBe(true);
    expect(await matchesFileSignature(blob([0xff, 0xd8, 0xff, 0xe0]), 'jpg')).toBe(true);
    expect(await matchesFileSignature(blob('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), 'webp')).toBe(true);
    expect(await matchesFileSignature(blob([0x50, 0x4b, 0x03, 0x04, 0x14]), 'docx')).toBe(true);
  });

  it('acepta texto y rechaza binarios con extensión .txt/.md', async () => {
    expect(await matchesFileSignature(blob('# Título\nTexto con tildes: ñáé'), 'md')).toBe(true);
    expect(await matchesFileSignature(blob([0x4d, 0x5a, 0x00, 0x90]), 'txt')).toBe(false);
  });

  it('rechaza archivos vacíos o extensiones desconocidas', async () => {
    expect(await matchesFileSignature(blob(''), 'pdf')).toBe(false);
    expect(await matchesFileSignature(blob('%PDF-'), 'exe')).toBe(false);
  });
});

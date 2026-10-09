/** Bytes iniciales que se inspeccionan (suficiente para todas las firmas y la heurística de texto). */
const HEAD_BYTES = 4096;

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" en el offset 8
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx/xlsx/pptx son contenedores ZIP

/**
 * Comprueba que el contenido real del archivo corresponda a su extensión
 * ("magic numbers"). Evita, por ejemplo, subir un HTML renombrado a .pdf.
 * Para .txt/.md exige texto (sin bytes nulos en el inicio).
 */
export async function matchesFileSignature(file: Blob, extension: string): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  switch (extension) {
    case 'pdf':
      return startsWith(head, PDF);
    case 'png':
      return startsWith(head, PNG);
    case 'jpg':
    case 'jpeg':
      return startsWith(head, JPEG);
    case 'webp':
      return startsWith(head, RIFF) && startsWith(head, WEBP, 8);
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return startsWith(head, ZIP);
    case 'txt':
    case 'md':
      return !head.includes(0);
    default:
      return false;
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return (
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte)
  );
}

/**
 * Formateo, minificación y validación de XML con el DOMParser del navegador.
 * - Valida que el XML esté bien formado (no valida contra XSD/DTD).
 * - No resuelve entidades externas ni ejecuta nada: es seguro con entradas no confiables.
 * - Al formatear se recortan los espacios de los nodos de texto.
 */

export const XML_MAX_LENGTH = 2_000_000;

export type XmlIndent = '  ' | '    ' | '\t';

export type XmlResult = { ok: true; output: string } | { ok: false; error: string };

export type XmlParseResult = { ok: true; document: Document } | { ok: false; error: string };

export function parseXml(source: string): XmlParseResult {
  if (!source.trim()) {
    return { ok: false, error: 'Introduce un XML.' };
  }
  if (source.length > XML_MAX_LENGTH) {
    return { ok: false, error: 'El XML supera el tamaño máximo (2 MB).' };
  }
  const document = new DOMParser().parseFromString(source, 'application/xml');
  const parserError = document.getElementsByTagName('parsererror')[0];
  if (parserError) {
    return { ok: false, error: describeParserError(parserError.textContent ?? '') };
  }
  return { ok: true, document };
}

export function formatXml(source: string, indent: XmlIndent = '  '): XmlResult {
  return serialize(source, { indent, newline: '\n' });
}

export function minifyXml(source: string): XmlResult {
  return serialize(source, { indent: '', newline: '' });
}

interface SerializeOptions {
  indent: string;
  newline: string;
}

function serialize(source: string, options: SerializeOptions): XmlResult {
  const parsed = parseXml(source);
  if (!parsed.ok) {
    return parsed;
  }
  const lines: string[] = [];
  const declaration = /^\s*(<\?xml[^?]*\?>)/.exec(source)?.[1];
  if (declaration) {
    lines.push(declaration);
  }
  for (const node of Array.from(parsed.document.childNodes)) {
    writeNode(node, 0, options, lines);
  }
  return { ok: true, output: lines.join(options.newline) };
}

function writeNode(node: Node, depth: number, options: SerializeOptions, lines: string[]): void {
  const pad = options.indent.repeat(depth);
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      writeElement(node as Element, depth, options, lines);
      break;
    case Node.TEXT_NODE: {
      const text = node.textContent?.trim();
      if (text) {
        lines.push(pad + escapeText(text));
      }
      break;
    }
    case Node.CDATA_SECTION_NODE:
      lines.push(`${pad}<![CDATA[${node.textContent ?? ''}]]>`);
      break;
    case Node.COMMENT_NODE:
      lines.push(`${pad}<!--${node.textContent ?? ''}-->`);
      break;
    case Node.PROCESSING_INSTRUCTION_NODE: {
      const pi = node as ProcessingInstruction;
      lines.push(`${pad}<?${pi.target} ${pi.data}?>`);
      break;
    }
    case Node.DOCUMENT_TYPE_NODE:
      lines.push(pad + new XMLSerializer().serializeToString(node));
      break;
  }
}

function writeElement(
  element: Element,
  depth: number,
  options: SerializeOptions,
  lines: string[],
): void {
  const pad = options.indent.repeat(depth);
  const attributes = Array.from(element.attributes)
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join('');
  const open = `<${element.tagName}${attributes}`;
  const children = Array.from(element.childNodes).filter(
    (child) => child.nodeType !== Node.TEXT_NODE || child.textContent?.trim(),
  );

  if (children.length === 0) {
    lines.push(`${pad}${open}/>`);
    return;
  }
  // Un único texto: en la misma línea (<a>valor</a>).
  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    lines.push(
      `${pad}${open}>${escapeText(children[0].textContent?.trim() ?? '')}</${element.tagName}>`,
    );
    return;
  }
  lines.push(`${pad}${open}>`);
  for (const child of children) {
    writeNode(child, depth + 1, options, lines);
  }
  lines.push(`${pad}</${element.tagName}>`);
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

/** Los navegadores devuelven mensajes distintos; se resume y se limita su longitud. */
function describeParserError(raw: string): string {
  const message = raw
    .replace(/This page contains the following errors:/i, '')
    .replace(/Below is a rendering of the page up to the first error\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `XML mal formado: ${message.slice(0, 300) || 'error de sintaxis.'}`;
}

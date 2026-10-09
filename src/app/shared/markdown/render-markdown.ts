import { Marked } from 'marked';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Markdown (GFM) → HTML con dos capas de seguridad:
 *  1. El HTML escrito por el usuario se muestra como texto (no se interpreta).
 *  2. El resultado se inserta con [innerHTML], que pasa por el sanitizador de
 *     Angular (elimina scripts, manejadores de eventos y URLs javascript:).
 * Los enlaces externos se abren en otra pestaña con rel="noopener noreferrer".
 */
const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      const external = /^https?:\/\//i.test(href);
      const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapeHtml(href)}"${titleAttr}${target}>${text}</a>`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
}

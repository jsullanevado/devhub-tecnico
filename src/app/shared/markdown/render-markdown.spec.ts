import { renderMarkdown } from './render-markdown';

describe('renderMarkdown', () => {
  it('convierte Markdown básico', () => {
    const html = renderMarkdown('# Título\n\n**negrita** y `código`');
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<strong>negrita</strong>');
    expect(html).toContain('<code>código</code>');
  });

  it('no interpreta HTML escrito por el usuario', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('abre enlaces externos en otra pestaña de forma segura', () => {
    const html = renderMarkdown('[web](https://ejemplo.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('mantiene los enlaces internos sin target', () => {
    const html = renderMarkdown('[otra nota](/notes/123)');
    expect(html).toContain('href="/notes/123"');
    expect(html).not.toContain('target=');
  });

  it('escapa comillas en href para no romper el atributo', () => {
    const html = renderMarkdown('[x](https://a.com/"onmouseover="alert(1))');
    expect(html).not.toContain('"onmouseover="');
  });
});

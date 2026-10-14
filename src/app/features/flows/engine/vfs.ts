// Sistema de archivos virtual en memoria: sustituye a node:fs/node:path en el navegador.

export interface VfsEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

const norm = (value: string): string => value.replace(/\\/g, '/');

function split(value: string): string[] {
  const out: string[] = [];
  for (const part of norm(value).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out;
}

export const path = {
  sep: '/',
  join: (...parts: string[]): string => split(parts.join('/')).join('/'),
  resolve: (...parts: string[]): string => split(parts.join('/')).join('/'),
  basename: (value: string): string => split(value).pop() ?? '',
  dirname: (value: string): string => split(value).slice(0, -1).join('/'),
  extname: (value: string): string => {
    const name = split(value).pop() ?? '';
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot) : '';
  },
  relative: (from: string, to: string): string => {
    const a = split(from);
    const b = split(to);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
  },
};

/** Archivos de texto del repositorio (ruta relativa con "/") ya leídos en memoria. */
export class Vfs {
  private readonly files = new Map<string, string>();
  private readonly sizes = new Map<string, number>();
  private readonly dirs = new Map<string, Set<string>>();

  add(file: string, text: string, size = text.length): void {
    const key = path.join(file);
    this.files.set(key, text);
    this.sizes.set(key, size);
    const parts = split(key);
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      let children = this.dirs.get(parent);
      if (!children) {
        children = new Set();
        this.dirs.set(parent, children);
      }
      children.add(parts[i]);
    }
  }

  get size(): number {
    return this.files.size;
  }

  paths(): string[] {
    return [...this.files.keys()];
  }

  readText(file: string): string {
    const text = this.files.get(path.join(file));
    if (text === undefined) throw new Error(`No existe: ${file}`);
    return text;
  }

  existsSync(file: string): boolean {
    const key = path.join(file);
    return this.files.has(key) || this.dirs.has(key);
  }

  statSize(file: string): number {
    return this.sizes.get(path.join(file)) ?? 0;
  }

  readdirSync(dir: string): VfsEntry[] {
    const key = path.join(dir);
    const children = this.dirs.get(key);
    if (!children) throw new Error(`No existe: ${dir}`);
    return [...children].map((name) => {
      const full = key ? `${key}/${name}` : name;
      const isFile = this.files.has(full);
      return { name, isDirectory: () => !isFile, isFile: () => isFile };
    });
  }
}

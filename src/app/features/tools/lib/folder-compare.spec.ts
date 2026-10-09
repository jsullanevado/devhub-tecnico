import {
  compareFolders,
  FolderSnapshot,
  isExcludedFolder,
  isExcludedPath,
  parseExtraExclusions,
  sha256Hex,
  toDisplayPath,
} from './folder-compare';

const encoder = new TextEncoder();

function folder(name: string, files: Record<string, string>): FolderSnapshot {
  return {
    name,
    files: Object.entries(files).map(([path, content]) => {
      const bytes = encoder.encode(content);
      return { path, size: bytes.byteLength, read: async () => bytes.buffer as ArrayBuffer };
    }),
  };
}

describe('isExcludedPath / isExcludedFolder', () => {
  it('excluye las carpetas pesadas en cualquier nivel, sin distinguir mayúsculas', () => {
    expect(isExcludedPath('node_modules/rxjs/index.js')).toBe(true);
    expect(isExcludedPath('src/app/.angular/cache/x')).toBe(true);
    expect(isExcludedPath('Dist/main.js')).toBe(true);
    expect(isExcludedPath('docs\\manual.md')).toBe(true);
    expect(isExcludedFolder('.git')).toBe(true);
  });

  it('excluye las carpetas de compilación .NET (bin, obj, Debug) y .vs', () => {
    expect(isExcludedPath('Claro.Base/bin/Release/Claro.Base.pdb')).toBe(true);
    expect(isExcludedPath('Claro.Base/obj/Debug/x.cache')).toBe(true);
    expect(isExcludedPath('Proyecto/debug/log.txt')).toBe(true);
    expect(isExcludedPath('.vs/Proyecto/v17/.suo')).toBe(true);
    expect(isExcludedPath('Claro.Base/Clases/Cliente.cs')).toBe(false);
  });

  it('admite carpetas adicionales indicadas por el usuario', () => {
    expect(isExcludedPath('Proyecto/Release/app.dll', ['Release'])).toBe(true);
    expect(isExcludedPath('Proyecto/Release/app.dll')).toBe(false);
  });

  it('no excluye archivos que solo se llaman igual que una carpeta excluida', () => {
    expect(isExcludedPath('src/app/app.ts')).toBe(false);
    expect(isExcludedPath('scripts/dist')).toBe(false);
    expect(isExcludedPath('src/docs-helper.ts')).toBe(false);
  });
});

describe('parseExtraExclusions', () => {
  it('separa por comas, punto y coma o espacios, quita barras y duplicados', () => {
    expect(parseExtraExclusions(' Release, packages;TestResults  \\release\\ /tmp/ ')).toEqual([
      'Release',
      'packages',
      'TestResults',
      'tmp',
    ]);
    expect(parseExtraExclusions('a/b, , ')).toEqual([]);
  });
});

describe('toDisplayPath', () => {
  it('antepone una barra invertida y usa "\\" como separador', () => {
    expect(toDisplayPath('supabase/migrations/20261010000000_dashboard_resumen.sql')).toBe(
      '\\supabase\\migrations\\20261010000000_dashboard_resumen.sql',
    );
    expect(toDisplayPath('src\\app\\app.component.ts')).toBe('\\src\\app\\app.component.ts');
  });
});

describe('sha256Hex', () => {
  it('calcula el SHA-256 en hexadecimal', async () => {
    expect(await sha256Hex(encoder.encode('abc').buffer as ArrayBuffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('compareFolders', () => {
  const origin = folder('fuente1', {
    'src/app/app.ts': 'original',
    'src/app/same.ts': 'igual',
    'src/app/same-size.ts': 'AAAA',
    'src/only-origin.ts': 'x',
    'node_modules/lib/index.js': 'ignorado',
    'Proyecto/bin/Debug/app.pdb': 'binario 1',
  });
  const target = folder('fuente2', {
    'src/app/app.ts': 'cambiado y más largo',
    'SRC/APP/same.ts': 'igual',
    'src/app/same-size.ts': 'BBBB',
    'src/only-target.ts': 'y',
    'node_modules/lib/index.js': 'distinto pero ignorado',
    'Proyecto/bin/Debug/app.pdb': 'binario 2 distinto',
  });

  it('detecta modificados por contenido (también con el mismo tamaño) y archivos únicos', async () => {
    const result = await compareFolders(origin, target);
    expect(result.modified).toEqual(['src/app/app.ts', 'src/app/same-size.ts']);
    expect(result.onlyInOrigin).toEqual(['src/only-origin.ts']);
    expect(result.onlyInTarget).toEqual(['src/only-target.ts']);
    expect(result.compared).toBe(3);
    expect(result.identical).toBe(1);
  });

  it('solo calcula hashes cuando los tamaños coinciden e informa del progreso', async () => {
    const hashed: number[] = [];
    const progress: number[] = [];
    await compareFolders(origin, target, {
      hash: async (data) => {
        hashed.push(data.byteLength);
        return sha256Hex(data);
      },
      onProgress: ({ done }) => progress.push(done),
    });
    // same.ts y same-size.ts: 2 archivos × 2 carpetas. app.ts difiere en tamaño: sin hash.
    expect(hashed).toHaveLength(4);
    expect(progress.at(-1)).toBe(3);
  });

  it('ignora también las carpetas adicionales', async () => {
    const result = await compareFolders(origin, target, { extraExcluded: ['app'] });
    expect(result.modified).toEqual([]);
    expect(result.compared).toBe(0);
  });

  it('se puede cancelar', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(compareFolders(origin, target, { signal: controller.signal })).rejects.toThrow();
  });
});

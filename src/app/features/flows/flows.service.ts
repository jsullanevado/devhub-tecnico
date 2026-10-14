import { Injectable, inject } from '@angular/core';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { RelationsService } from '../../core/data/relations.service';
import { analyzePage, listPages, setVfs } from './engine/flow-analyzer';
import { buildEventFlows } from './engine/flow-builder';
import { Vfs } from './engine/vfs';
import { FlowAnalysis, FlowDiagram, FlowEvent, FlowInventoryRow } from './flows.models';

interface FileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
}
interface DirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<DirectoryHandle | FileHandle>;
}
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' }) => Promise<DirectoryHandle>;
};

const SKIP_DIRS = new Set(['bin', 'obj', 'packages', 'node_modules', '.git', '.vs', 'testresults', '.svn', 'debug', 'release']);
/** Solo se leen los archivos que usa el análisis (código, vistas, scripts y configuración). */
const READ_EXT = /\.(vb|cs|js|aspx|cshtml|vbhtml|config)$/i;
const MAX_CODE_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 60_000;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type ScanProgress = (files: number) => void;

/** UTF-8 (con o sin BOM); si no es válido (código antiguo) se lee como Windows-1252. */
export function decodeSource(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  const text = utf8.includes('\ufffd') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
  return text.replace(/^\ufeff/, '');
}

/**
 * Flujos BPMN desde el código. Todo ocurre en el navegador: la carpeta elegida se lee en
 * memoria y no se sube; solo se consulta el grafo de relaciones visible para el usuario.
 */
@Injectable({ providedIn: 'root' })
export class FlowsService {
  private readonly relations = inject(RelationsService);
  private repoName = '';

  get supportsDirectoryPicker(): boolean {
    return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
  }

  get repositoryName(): string {
    return this.repoName;
  }

  async pickDirectory(onProgress?: ScanProgress): Promise<string | null> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return null;
    let handle: DirectoryHandle;
    try {
      handle = await picker.call(window, { id: 'devhub-flows-repository', mode: 'read' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }
    const files: { path: string; file: File }[] = [];
    await this.walk(handle, '', files);
    return this.load(handle.name, files, onProgress);
  }

  async fromFileList(list: FileList, onProgress?: ScanProgress): Promise<string | null> {
    const all = Array.from(list);
    if (!all.length) return null;
    const files = all
      .map((file) => ({ path: file.webkitRelativePath.split('/').slice(1).join('/') || file.name, file }))
      .filter(({ path }) => !path.split('/').some((part) => SKIP_DIRS.has(part.toLowerCase())));
    return this.load(all[0].webkitRelativePath.split('/')[0] || 'repositorio', files, onProgress);
  }

  listPages(): string[] {
    return listPages('');
  }

  analyze(page: string): FlowAnalysis {
    if (!/\.(aspx|cshtml|vbhtml)$/i.test(page)) throw new Error('Elige una página .aspx o .cshtml.');
    return analyzePage('', page) as FlowAnalysis;
  }

  /** Diagramas (principal y subprocesos) de un evento, completados con lo registrado en DevHub. */
  async build(title: string, event: FlowEvent): Promise<FlowDiagram[]> {
    if (!event.groups.length) throw new Error('No hay pasos para generar el diagrama.');
    const graph = await this.relations.graph();
    return buildEventFlows({ title: title.slice(0, 120), event, graph }) as FlowDiagram[];
  }

  async downloadZip(title: string, event: FlowEvent): Promise<string> {
    const diagrams = await this.build(title, event);
    const zip = new JSZip();
    for (const diagram of diagrams) zip.file(diagram.fileName, diagram.xml);
    const fileName = diagrams[0].fileName.replace(/\.bpmn$/, '.zip');
    this.save(fileName, await zip.generateAsync({ type: 'blob' }));
    return fileName;
  }

  downloadDiagram(diagram: FlowDiagram): void {
    this.save(diagram.fileName, new Blob([diagram.xml], { type: 'application/xml' }));
  }

  /** Cuadro de insumos de la página en Excel. */
  async downloadInventory(analysis: FlowAnalysis): Promise<string> {
    const inventory = analysis.inventory;
    const mark = (row: { method: string; reachable: boolean }) => (row.reachable ? row.method : `${row.method} ⚠`);
    const workbook = new ExcelJS.Workbook();
    const sheet = (name: string, columns: [string, number][], rows: (string | number)[][]) => {
      const worksheet = workbook.addWorksheet(name);
      worksheet.columns = columns.map(([header, width]) => ({ header, width }));
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.getRow(1).font = { bold: true };
      rows.forEach((cells, index) => worksheet.addRow([index + 1, ...cells]));
    };
    const rowTail = (row: FlowInventoryRow) => [row.key ?? '', row.url ?? '', row.kind];
    sheet('Stored procedures', [['#', 5], ['Método en la página', 32], ['Operación WCF', 42], ['Paquete.SP', 55], ['Conexión', 14], ['Origen en el código', 60]],
      inventory.sp.map((row) => [mark(row), row.wcf ?? '', row.name, row.connection ?? '', row.doc]));
    sheet('DataPower', [['#', 5], ['Método en la página', 32], ['Operación WCF', 42], ['Clase backend', 28], ['Llave de URL', 30], ['URL', 60], ['Tipo', 8]],
      inventory.datapower.map((row) => [mark(row), row.wcf ?? '', row.backendClass ?? '', ...rowTail(row)]));
    sheet('Servicios', [['#', 5], ['Método en la página', 32], ['Operación WCF', 42], ['Servicio / método final', 50], ['Llave de URL', 30], ['URL', 60], ['Tipo', 8]],
      inventory.services.map((row) => [mark(row), row.wcf ?? '', row.name, ...rowTail(row)]));
    sheet('Sin insumos', [['#', 5], ['Método en la página', 40], ['Origen en el código', 60]],
      inventory.empty.map((row) => [mark(row), row.doc]));
    const base = (analysis.page.split('/').pop() ?? 'pagina').replace(/\.\w+$/, '');
    const fileName = `insumos_${base}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    this.save(fileName, new Blob([buffer], { type: XLSX_MIME }));
    return fileName;
  }

  private async load(name: string, files: { path: string; file: File }[], onProgress?: ScanProgress): Promise<string> {
    const vfs = new Vfs();
    const candidates = files.filter(({ path, file }) => READ_EXT.test(path) && !/\.dll\.config$/i.test(path) && file.size <= MAX_CODE_BYTES);
    let done = 0;
    for (let start = 0; start < candidates.length; start += 40) {
      await Promise.all(
        candidates.slice(start, start + 40).map(async ({ path, file }) => {
          vfs.add(path, decodeSource(new Uint8Array(await file.arrayBuffer())), file.size);
          onProgress?.(++done);
        }),
      );
    }
    setVfs(vfs);
    this.repoName = name;
    return name;
  }

  private async walk(directory: DirectoryHandle, prefix: string, files: { path: string; file: File }[]): Promise<void> {
    for await (const entry of directory.values()) {
      if (files.length >= MAX_FILES) return;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) await this.walk(entry, path, files);
      } else if (READ_EXT.test(entry.name)) {
        files.push({ path, file: await entry.getFile() });
      }
    }
  }

  private save(fileName: string, blob: Blob): void {
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
}

import { Injectable } from '@angular/core';
import {
  CompareOptions,
  compareFolders,
  FolderComparison,
  FolderFile,
  FolderSnapshot,
  isExcludedFolder,
  isExcludedPath,
} from './lib/folder-compare';

// File System Access API (Chrome/Edge). No está en lib.dom de TypeScript: tipos mínimos.
interface DirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<DirectoryHandle | FileHandle>;
}
interface FileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
}
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' }) => Promise<DirectoryHandle>;
};

/**
 * Lee carpetas locales elegidas por el usuario y las compara. Todo ocurre en el
 * navegador: los archivos no se suben a ningún servidor.
 *
 * - Chrome/Edge: selector de carpetas nativo (File System Access API); las
 *   carpetas excluidas ni siquiera se recorren.
 * - Otros navegadores: <input type="file" webkitdirectory> como alternativa.
 */
@Injectable({ providedIn: 'root' })
export class FolderCompareService {
  /** ¿Dispone el navegador del selector de carpetas nativo? */
  get supportsDirectoryPicker(): boolean {
    return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
  }

  /**
   * Abre el selector nativo y lista los archivos. Devuelve null si el usuario
   * cancela. `onScan` informa de cuántos archivos se llevan encontrados.
   */
  async pickDirectory(
    pickerId: string,
    onScan?: (count: number) => void,
  ): Promise<FolderSnapshot | null> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      return null;
    }
    let handle: DirectoryHandle;
    try {
      handle = await picker.call(window, { id: pickerId, mode: 'read' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
      throw error;
    }
    const files: FolderFile[] = [];
    await this.walk(handle, '', files, onScan);
    return { name: handle.name, files };
  }

  /** Alternativa para navegadores sin selector nativo (input con webkitdirectory). */
  fromFileList(list: FileList): FolderSnapshot | null {
    const all = Array.from(list);
    if (all.length === 0) {
      return null;
    }
    // webkitRelativePath = "<carpeta elegida>/sub/archivo": se quita el primer segmento.
    const name = all[0].webkitRelativePath.split('/')[0] || 'carpeta';
    const files = all
      .map((file) => ({
        file,
        path: file.webkitRelativePath.split('/').slice(1).join('/') || file.name,
      }))
      .filter(({ path }) => !isExcludedPath(path))
      .map(({ file, path }) => this.toFolderFile(path, file));
    return { name, files };
  }

  compare(
    origin: FolderSnapshot,
    target: FolderSnapshot,
    options: CompareOptions = {},
  ): Promise<FolderComparison> {
    return compareFolders(origin, target, options);
  }

  private async walk(
    directory: DirectoryHandle,
    prefix: string,
    files: FolderFile[],
    onScan?: (count: number) => void,
  ): Promise<void> {
    for await (const entry of directory.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        if (!isExcludedFolder(entry.name)) {
          await this.walk(entry, path, files, onScan);
        }
      } else {
        files.push(this.toFolderFile(path, await entry.getFile()));
        onScan?.(files.length);
      }
    }
  }

  private toFolderFile(path: string, file: File): FolderFile {
    return { path, size: file.size, read: () => file.arrayBuffer() };
  }
}

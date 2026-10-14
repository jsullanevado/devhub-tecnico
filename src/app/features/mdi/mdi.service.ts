import { Injectable, inject } from '@angular/core';
import git, { CommitObject, FsClient } from 'isomorphic-git';
import { createPatch } from 'diff';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth/auth.service';
import { toAppError } from '../../core/errors/error-mapper';
import { SUPABASE } from '../../core/supabase/supabase.client';
import { MdiBranchList, MdiChangedFile, MdiCommit, MdiCompareResult, MdiConfig, MdiFields, MdiHistoryItem, MdiTemplateData } from './mdi.models';

interface LocalFileHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
}

interface LocalDirectoryHandle {
  readonly kind: 'directory';
  values(): AsyncIterable<LocalDirectoryHandle | LocalFileHandle>;
  getFileHandle(name: string): Promise<LocalFileHandle>;
  getDirectoryHandle(name: string): Promise<LocalDirectoryHandle>;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' }) => Promise<LocalDirectoryHandle>;
};

interface FsStat {
  ctimeSeconds: number;
  ctimeNanoseconds: number;
  mtimeSeconds: number;
  mtimeNanoseconds: number;
  dev: number;
  ino: number;
  mode: number;
  uid: number;
  gid: number;
  size: number;
}

const VIRTUAL_ROOT = '/devhub-repository';
const REF_PATTERN = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/@+-]{1,250}$/;
const MAX_DIFF_FILE_BYTES = 4 * 1024 * 1024;
const TEMPLATE_BUCKET = 'devhub-documents';

const DEFAULT_CONFIG: MdiConfig = {
  targetBranch: '',
  excludes: ['bin/', 'obj/', 'packages/'],
  serversBack: '',
  serversFront: '',
  author: '',
};

function normalizePath(value: string): string[] {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.' || part === VIRTUAL_ROOT.slice(1)) continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts;
}

function errorWithCode(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function makeFs(root: LocalDirectoryHandle): FsClient {
  const resolve = async (path: string): Promise<LocalDirectoryHandle | LocalFileHandle> => {
    const parts = normalizePath(path);
    let current: LocalDirectoryHandle | LocalFileHandle = root;
    for (const part of parts) {
      if (current.kind !== 'directory') throw errorWithCode('ENOTDIR', `Not a directory: ${path}`);
      try {
        current = await current.getDirectoryHandle(part);
      } catch {
        try {
          current = await current.getFileHandle(part);
        } catch {
          throw errorWithCode('ENOENT', `No such file or directory: ${path}`);
        }
      }
    }
    return current;
  };
  const stat = async (path: string): Promise<FsStat> => {
    const entry = await resolve(path);
    const file = entry.kind === 'file' ? await entry.getFile() : null;
    const mode = entry.kind === 'directory' ? 0o40755 : 0o100644;
    return { ctimeSeconds: 0, ctimeNanoseconds: 0, mtimeSeconds: 0, mtimeNanoseconds: 0, dev: 0, ino: 0, mode, uid: 0, gid: 0, size: file?.size ?? 0 };
  };
  const readFile = async (path: string, options?: string | { encoding?: string }): Promise<Uint8Array | string> => {
    const entry = await resolve(path);
    if (entry.kind !== 'file') throw errorWithCode('EISDIR', `Is a directory: ${path}`);
    const file = await entry.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? new TextDecoder().decode(bytes) : bytes;
  };
  const readdir = async (path: string): Promise<string[]> => {
    const entry = await resolve(path);
    if (entry.kind !== 'directory') throw errorWithCode('ENOTDIR', `Not a directory: ${path}`);
    const names: string[] = [];
    for await (const child of entry.values()) {
      const handle = child as LocalDirectoryHandle & LocalFileHandle;
      const name = (handle as unknown as { name: string }).name;
      if (name) names.push(name);
    }
    return names;
  };
  const readOnly = async (): Promise<never> => { throw errorWithCode('EROFS', 'Repository access is read-only.'); };
  const fs = {
    promises: {
      readFile,
      readdir,
      stat,
      lstat: stat,
      writeFile: readOnly,
      unlink: readOnly,
      mkdir: readOnly,
      rmdir: readOnly,
    },
  };
  return fs as unknown as FsClient;
}

function lineCounts(before: string, after: string): { additions: number; deletions: number } {
  const patch = createPatch('file', before, after);
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

@Injectable({ providedIn: 'root' })
export class MdiService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly db = this.supabase as unknown as SupabaseClient;
  private root: LocalDirectoryHandle | null = null;
  private fs: FsClient | null = null;
  private readonly dir = VIRTUAL_ROOT;

  get supportsDirectoryPicker(): boolean {
    return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
  }

  async pickRepository(): Promise<string | null> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return null;
    try {
      this.root = await picker.call(window, { id: 'devhub-mdi-repository', mode: 'read' });
      this.fs = makeFs(this.root);
      const branches = await this.branches();
      if (!branches.local.length && !branches.remote.length) throw new Error('La carpeta elegida no contiene un clon Git reconocible.');
      return (this.root as unknown as { name: string }).name;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      this.root = null;
      this.fs = null;
      throw error;
    }
  }

  async branches(): Promise<MdiBranchList> {
    const fs = this.requireFs();
    const [local, remote, currentRef] = await Promise.all([
      git.listBranches({ fs, dir: this.dir }),
      git.listBranches({ fs, dir: this.dir, remote: 'origin' }).catch(() => []),
      git.resolveRef({ fs, dir: this.dir, ref: 'HEAD', depth: 1 }).catch(() => ''),
    ]);
    return { local, remote: remote.map((branch) => `origin/${branch}`), current: currentRef.replace(/^refs\/heads\//, '') || null };
  }

  async compare(source: string, target: string, excludes: string[] = []): Promise<MdiCompareResult> {
    this.assertRef(source);
    this.assertRef(target);
    const fs = this.requireFs();
    const [sourceOid, targetOid, sourceFiles, targetFiles, sourceLog, targetLog] = await Promise.all([
      git.resolveRef({ fs, dir: this.dir, ref: source }),
      git.resolveRef({ fs, dir: this.dir, ref: target }),
      git.listFiles({ fs, dir: this.dir, ref: source }),
      git.listFiles({ fs, dir: this.dir, ref: target }),
      git.log({ fs, dir: this.dir, ref: source, depth: 100 }),
      git.log({ fs, dir: this.dir, ref: target, depth: 100 }),
    ]);
    const targetCommits = new Set(targetLog.map((item) => item.oid));
    const commits = sourceLog.filter((item) => !targetCommits.has(item.oid)).map((item) => this.commitInfo(item.oid, item.commit));
    const sourceSet = new Set(sourceFiles);
    const targetSet = new Set(targetFiles);
    const paths = [...new Set([...sourceFiles, ...targetFiles])].filter((path) => !excludes.some((exclude) => path.startsWith(exclude.replace(/^\/+/, ''))));
    const files: MdiChangedFile[] = [];
    for (const path of paths) {
      const inSource = sourceSet.has(path);
      const inTarget = targetSet.has(path);
      const status = !inTarget ? 'added' : !inSource ? 'deleted' : 'modified';
      let before = '';
      let after = '';
      if (inTarget) before = await this.readText(targetOid, path);
      if (inSource) after = await this.readText(sourceOid, path);
      if (status === 'modified' && before === after) continue;
      const counts = lineCounts(before, after);
      files.push({ path, status, ...counts, ...this.classify(path) });
    }
    let mergeBase: string | null = null;
    try {
      mergeBase = (await git.findMergeBase({ fs, dir: this.dir, oids: [sourceOid, targetOid] }))[0] ?? null;
    } catch {
      mergeBase = null;
    }
    return { source, target, mergeBase, files, commits };
  }

  async fileDiff(source: string, target: string, path: string): Promise<string> {
    this.assertRef(source);
    this.assertRef(target);
    const fs = this.requireFs();
    const [sourceOid, targetOid] = await Promise.all([
      git.resolveRef({ fs, dir: this.dir, ref: source }),
      git.resolveRef({ fs, dir: this.dir, ref: target }),
    ]);
    const [before, after] = await Promise.all([
      this.readText(targetOid, path).catch(() => ''),
      this.readText(sourceOid, path).catch(() => ''),
    ]);
    return createPatch(path, before, after, target, source);
  }

  async config(app: string): Promise<MdiConfig> {
    this.assertApp(app);
    const { data, error } = await this.db.from('mdi_configs').select('config').eq('app', app).maybeSingle();
    if (error) throw toAppError(error);
    return { ...DEFAULT_CONFIG, ...((data?.config as Partial<MdiConfig>) ?? {}) };
  }

  async saveConfig(app: string, config: MdiConfig): Promise<void> {
    this.assertApp(app);
    const { error } = await this.db.from('mdi_configs').upsert({ app, config } as never, { onConflict: 'user_id,app' });
    if (error) throw toAppError(error);
  }

  async saveTemplate(app: string, file: File): Promise<void> {
    this.assertApp(app);
    if (!file.name.toLowerCase().endsWith('.docx') || file.size > 20 * 1024 * 1024) throw new Error('Elige una plantilla .docx de hasta 20 MB.');
    const userId = this.requireUserId();
    const path = `${userId}/${crypto.randomUUID()}.docx`;
    const { error: uploadError } = await this.supabase.storage.from(TEMPLATE_BUCKET).upload(path, file, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false });
    if (uploadError) throw toAppError(uploadError);
    const { error } = await this.db.from('mdi_templates').upsert({ app, file_path: path, file_name: file.name } as never, { onConflict: 'user_id,app' });
    if (error) {
      await this.supabase.storage.from(TEMPLATE_BUCKET).remove([path]);
      throw toAppError(error);
    }
  }

  async hasTemplate(app: string): Promise<boolean> {
    this.assertApp(app);
    const { data, error } = await this.db.from('mdi_templates').select('file_path').eq('app', app).maybeSingle();
    if (error) throw toAppError(error);
    return !!data?.file_path;
  }

  async generate(app: string, fields: MdiFields, comparison: MdiCompareResult): Promise<string> {
    this.assertApp(app);
    const templateRow = await this.db.from('mdi_templates').select('file_path,file_name').eq('app', app).maybeSingle();
    if (templateRow.error) throw toAppError(templateRow.error);
    if (!templateRow.data) throw new Error('Carga primero la plantilla Word de este aplicativo.');
    const { data: template, error } = await this.supabase.storage.from(TEMPLATE_BUCKET).download(templateRow.data.file_path);
    if (error) throw toAppError(error);
    const zip = new PizZip(await template.arrayBuffer());
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    const backFiles = comparison.files.filter((item) => /back|servicio|negocio|datos/i.test(item.path));
    const frontFiles = comparison.files.filter((item) => !backFiles.includes(item));
    const back = backFiles.map((item) => ({ component: item.component ?? '', path: item.path, state: item.status }));
    const front = frontFiles.map((item) => ({ component: item.component ?? '', path: item.path, state: item.status }));
    const paths = (items: { component: string; path: string }[]) => items.map((item) => item.component ? `${item.component}.dll` : item.path);
    const data: MdiTemplateData = {
      fields,
      back: { classes: back, backup: [...new Set(paths(back))], install: [...new Set(paths(back))], removals: back.filter((item) => item.state === 'added').map((item) => item.path) },
      front: { classes: front, backup: [...new Set(paths(front))], install: [...new Set(paths(front))], removals: front.filter((item) => item.state === 'added').map((item) => item.path) },
    };
    doc.render({ ...fields, BACKUP_BACK: data.back.backup.join('\n'), INSTALL_BACK: data.back.install.join('\n'), BACKUP_FRONT: data.front.backup.join('\n'), INSTALL_FRONT: data.front.install.join('\n'), CLASSES_BACK: data.back.classes.map((item) => `${item.component} · ${item.path} · ${item.state}`).join('\n'), CLASSES_FRONT: data.front.classes.map((item) => `${item.component} · ${item.path} · ${item.state}`).join('\n') });
    const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const fileName = `${fields.APP}_${fields.NOMBRE_PROYECTO || fields.PROYECTO}.docx`.replace(/[<>:"/\\|?*]/g, '_');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    const { error: historyError } = await this.db.from('mdi_history').insert({ app, layer: 'front', source_branch: comparison.source, target_branch: comparison.target, proyecto: fields.NOMBRE_PROYECTO || fields.PROYECTO, file_name: fileName, payload: { data, meta: { source: comparison.source, target: comparison.target } } } as never);
    if (historyError) throw toAppError(historyError);
    return fileName;
  }

  async history(): Promise<MdiHistoryItem[]> {
    const { data, error } = await this.db.from('mdi_history').select('id,app,layer,source_branch,target_branch,proyecto,file_name,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) throw toAppError(error);
    return (data ?? []) as MdiHistoryItem[];
  }

  async deleteHistory(id: string): Promise<void> {
    const { error } = await this.db.from('mdi_history').delete().eq('id', id);
    if (error) throw toAppError(error);
  }

  private async readText(oid: string, path: string): Promise<string> {
    const result = await git.readBlob({ fs: this.requireFs(), dir: this.dir, oid, filepath: path });
    if (result.blob.byteLength > MAX_DIFF_FILE_BYTES) return '[Archivo demasiado grande para mostrar]';
    return new TextDecoder('utf-8', { fatal: false }).decode(result.blob);
  }

  private classify(path: string): Pick<MdiChangedFile, 'component' | 'itemType'> {
    if (/\.(csproj|vbproj)$/i.test(path)) return { component: path.split('/').at(-1)!.replace(/\.(csproj|vbproj)$/i, ''), itemType: 'project' };
    if (/\.(cs|vb|resx|designer\.cs)$/i.test(path)) {
      const directory = path.split('/').slice(0, -1).join('/');
      return { component: directory.split('/').at(-1) || null, itemType: 'compile' };
    }
    if (/\.(aspx|ascx|cshtml|vbhtml|config|xml|json|css|js)$/i.test(path)) return { component: null, itemType: 'content' };
    return { component: null, itemType: 'other' };
  }

  private commitInfo(hash: string, commit: CommitObject): MdiCommit {
    return { hash, author: commit.author.name, date: new Date(commit.author.timestamp * 1000).toISOString(), subject: commit.message.split('\n')[0] };
  }

  private assertRef(ref: string): void {
    if (!REF_PATTERN.test(ref)) throw new Error('Nombre de rama no válido.');
  }

  private assertApp(app: string): void {
    if (!/^[A-Z0-9_]{2,40}$/.test(app)) throw new Error('Aplicativo no válido.');
  }

  private requireFs(): FsClient {
    if (!this.fs || !this.root) throw new Error('Elige primero una carpeta Git local.');
    return this.fs;
  }

  private requireUserId(): string {
    const id = this.auth.userId();
    if (!id) throw new Error('Inicia sesión para guardar la plantilla.');
    return id;
  }
}
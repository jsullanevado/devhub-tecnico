import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { matchesFileSignature } from '../../shared/utils/file-signature';
import { AppError } from '../errors/app-error';
import { toAppError } from '../errors/error-mapper';
import {
  Manual,
  MANUAL_FILE_TYPES,
  ManualFileType,
  ManualFileValidation,
  ManualFilters,
  ManualInput,
  manualPreviewKind,
  ManualRecordInput,
  validateManualFile,
} from '../models';
import { AUTHOR_EMBED } from './query-utils';
import { FilterCondition, ResourceRepository } from './resource-repository';

const COLUMNS =
  'id, owner_id, title, description, category, version, file_path, file_name, mime_type, file_size, download_count, tags, visibility, created_at, updated_at';

/** Una misma descarga repetida en este intervalo no vuelve a sumar en el contador. */
const DOWNLOAD_COUNT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Manuales: metadatos en `manuals` + archivo en el bucket privado devhub-documents.
 * Ruta del archivo: `{userId}/{uuid}.{ext}` (impuesta por las políticas de Storage).
 * Usar createWithFile/replaceFile; `create` directo exige que el archivo ya exista.
 */
@Injectable({ providedIn: 'root' })
export class ManualsService extends ResourceRepository<
  Manual,
  Manual,
  ManualRecordInput,
  ManualFilters
> {
  protected readonly table = 'manuals';
  protected readonly summaryColumns = `${COLUMNS}, ${AUTHOR_EMBED}`;
  protected readonly detailColumns = `${COLUMNS}, ${AUTHOR_EMBED}`;

  private readonly bucket = environment.storage.documentsBucket;
  private readonly countedDownloads = new Map<string, number>();

  protected toConditions(filters: ManualFilters): FilterCondition[] {
    return filters.category
      ? [{ column: 'category', operator: 'eq', value: filters.category }]
      : [];
  }

  /**
   * Validación completa en cliente: extensión, MIME declarado, tamaño y firma
   * del contenido. La autoridad final siguen siendo el bucket y la base de datos.
   */
  async checkFile(file: File): Promise<ManualFileValidation> {
    const validation = validateManualFile(file);
    if (!validation.valid) {
      return validation;
    }
    if (!(await matchesFileSignature(file, validation.type.extension))) {
      return {
        valid: false,
        message: 'El contenido del archivo no corresponde a su extensión.',
      };
    }
    return validation;
  }

  /** Sube el archivo y registra el manual. Si el registro falla, elimina el archivo subido. */
  async createWithFile(file: File, input: ManualInput): Promise<Manual> {
    const { path, type } = await this.uploadFile(file);
    try {
      return await this.create({ ...input, ...this.fileFields(file, path, type) });
    } catch (error) {
      await this.removeFileQuietly(path);
      throw toAppError(error);
    }
  }

  /**
   * Sustituye el archivo de un manual (propio, o ajeno si es superadmin). Los archivos
   * son inmutables: se sube uno nuevo en la carpeta del PROPIETARIO del manual.
   */
  async replaceFile(
    manual: Pick<Manual, 'id' | 'file_path' | 'owner_id'>,
    file: File,
  ): Promise<Manual> {
    const { path, type } = await this.uploadFile(file, manual.owner_id);
    let updated: Manual;
    try {
      updated = await this.update(manual.id, this.fileFields(file, path, type));
    } catch (error) {
      await this.removeFileQuietly(path);
      throw toAppError(error);
    }
    await this.removeFileQuietly(manual.file_path);
    return updated;
  }

  /**
   * Borra la fila y después el archivo (la política de Storage impide borrar
   * archivos aún referenciados). Si el archivo no se puede borrar queda huérfano
   * pero inaccesible para otros usuarios.
   */
  override async delete(id: string): Promise<void> {
    const row = await this.deleteReturning(id, 'id, file_path');
    const path = row['file_path'];
    if (typeof path === 'string') {
      await this.removeFileQuietly(path);
    }
  }

  /**
   * Contenido para la vista previa, descargado con la sesión del usuario (RLS de
   * Storage). El tipo del Blob se fuerza al MIME validado del manual, de modo que
   * el navegador nunca lo interprete como HTML. No suma descargas.
   */
  async getPreviewBlob(manual: Pick<Manual, 'file_path' | 'mime_type'>): Promise<Blob> {
    const allowedMime = MANUAL_FILE_TYPES.some((type) => type.mime === manual.mime_type);
    if (!allowedMime || !manualPreviewKind(manual.mime_type)) {
      throw new AppError('validation', 'Este tipo de archivo no admite vista previa.');
    }
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .download(manual.file_path);
    if (error) {
      throw toAppError(error);
    }
    return new Blob([data], { type: manual.mime_type });
  }

  /**
   * Descarga explícita: obtiene una URL firmada de corta duración (fuerza la
   * descarga con el nombre original) y, solo si se obtuvo, suma en el contador.
   * Repeticiones del mismo usuario en la misma sesión dentro del intervalo de
   * enfriamiento no vuelven a sumar. Un fallo del contador no bloquea la descarga.
   */
  async prepareDownload(
    manual: Pick<Manual, 'id' | 'file_path' | 'file_name'>,
  ): Promise<{ url: string; downloadCount: number | null }> {
    const { data: signed, error: signError } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(manual.file_path, environment.storage.signedUrlTtlSeconds, {
        download: manual.file_name,
      });
    if (signError) {
      throw toAppError(signError);
    }

    const lastCounted = this.countedDownloads.get(manual.id);
    if (lastCounted !== undefined && Date.now() - lastCounted < DOWNLOAD_COUNT_COOLDOWN_MS) {
      return { url: signed.signedUrl, downloadCount: null };
    }

    const { data, error } = await this.supabase.rpc('register_manual_download', {
      p_manual_id: manual.id,
    });
    if (error) {
      console.warn('[DevHub] No se pudo registrar la descarga', toAppError(error));
      return { url: signed.signedUrl, downloadCount: null };
    }
    this.countedDownloads.set(manual.id, Date.now());
    return { url: signed.signedUrl, downloadCount: data };
  }

  /** `ownerId`: carpeta destino (por defecto la del usuario actual). */
  private async uploadFile(
    file: File,
    ownerId: string = this.requireUserId(),
  ): Promise<{ path: string; type: ManualFileType }> {
    const validation = await this.checkFile(file);
    if (!validation.valid) {
      throw new AppError('validation', validation.message);
    }
    const path = `${ownerId}/${crypto.randomUUID()}.${validation.type.extension}`;
    const { error } = await this.supabase.storage.from(this.bucket).upload(path, file, {
      // MIME según la extensión validada, no el declarado por el navegador.
      contentType: validation.type.mime,
      upsert: false,
      cacheControl: '3600',
    });
    if (error) {
      throw toAppError(error);
    }
    return { path, type: validation.type };
  }

  private fileFields(
    file: File,
    path: string,
    type: ManualFileType,
  ): Omit<ManualRecordInput, keyof ManualInput> {
    return {
      file_path: path,
      file_name: file.name.slice(0, 255),
      mime_type: type.mime,
      file_size: file.size,
    };
  }

  private async removeFileQuietly(path: string): Promise<boolean> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([path]);
    if (error) {
      console.warn('[DevHub] No se pudo eliminar el archivo', path, toAppError(error));
      return false;
    }
    return true;
  }
}

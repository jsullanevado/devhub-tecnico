import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { matchesFileSignature } from '../../shared/utils/file-signature';
import { AppError } from '../errors/app-error';
import { toAppError } from '../errors/error-mapper';
import {
  Service,
  ServiceFilters,
  ServiceRecordInput,
  ServiceSummary,
  validateSoapUiFile,
} from '../models';
import { AUTHOR_EMBED, escapeLike } from './query-utils';
import { FilterCondition, ResourceRepository } from './resource-repository';

const SUMMARY_COLUMNS =
  'id, owner_id, title, description, system, protocol, base_url, datapower_domain, tags, visibility, created_at, updated_at';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, wsdl_url, datapower_object, auth_type, auth_username, auth_secret, auth_notes, notes, operations, soapui_file_path, soapui_file_name, soapui_file_size`;

/** Cambio del proyecto SoapUI al guardar: conservar, sustituir por un archivo o quitar. */
export type SoapUiChange = { kind: 'keep' } | { kind: 'replace'; file: File } | { kind: 'remove' };

/**
 * Servicios REST/SOAP. El proyecto SoapUI opcional vive en el bucket privado
 * devhub-documents con la ruta `{userId}/{uuid}.xml` (políticas de Storage).
 */
@Injectable({ providedIn: 'root' })
export class ServicesService extends ResourceRepository<
  ServiceSummary,
  Service,
  ServiceRecordInput,
  ServiceFilters
> {
  protected readonly table = 'services';
  protected readonly summaryColumns = `${SUMMARY_COLUMNS}, ${AUTHOR_EMBED}`;
  protected readonly detailColumns = `${DETAIL_COLUMNS}, ${AUTHOR_EMBED}`;

  private readonly bucket = environment.storage.documentsBucket;

  protected toConditions(filters: ServiceFilters): FilterCondition[] {
    const conditions: FilterCondition[] = [];
    if (filters.protocol) {
      conditions.push({ column: 'protocol', operator: 'eq', value: filters.protocol });
    }
    const system = filters.system?.trim();
    if (system) {
      // Coincidencia exacta sin distinguir mayúsculas.
      conditions.push({ column: 'system', operator: 'ilike', value: escapeLike(system) });
    }
    return conditions;
  }

  async checkSoapUiFile(file: File): Promise<string | null> {
    const validation = validateSoapUiFile(file);
    if (!validation.valid) {
      return validation.message;
    }
    return (await matchesFileSignature(file, 'xml'))
      ? null
      : 'El contenido no parece un XML (¿es el *-soapui-project.xml?).';
  }

  /**
   * Crea o actualiza el servicio aplicando el cambio del proyecto SoapUI. El archivo
   * nuevo se sube antes de guardar (la base de datos exige que exista) y, si el
   * guardado falla, se elimina; el archivo anterior solo se borra si todo salió bien.
   */
  async save(
    id: string | undefined,
    input: ServiceRecordInput,
    soapUi: SoapUiChange,
  ): Promise<Service> {
    const previous = id ? await this.getById(id) : null;
    const previousPath = previous?.soapui_file_path ?? null;
    let uploadedPath: string | null = null;
    let payload: ServiceRecordInput = input;

    if (soapUi.kind === 'replace') {
      // Al editar un servicio ajeno (superadmin), el archivo va a la carpeta del propietario.
      uploadedPath = await this.uploadSoapUi(soapUi.file, previous?.owner_id);
      payload = {
        ...input,
        soapui_file_path: uploadedPath,
        soapui_file_name: soapUi.file.name.slice(0, 255),
        soapui_file_size: soapUi.file.size,
      };
    } else if (soapUi.kind === 'remove') {
      payload = {
        ...input,
        soapui_file_path: null,
        soapui_file_name: null,
        soapui_file_size: null,
      };
    }

    let saved: Service;
    try {
      saved = id ? await this.update(id, payload) : await this.create(payload);
    } catch (error) {
      if (uploadedPath) {
        await this.removeFileQuietly(uploadedPath);
      }
      throw toAppError(error);
    }

    if (previousPath && soapUi.kind !== 'keep' && previousPath !== saved.soapui_file_path) {
      await this.removeFileQuietly(previousPath);
    }
    return saved;
  }

  /** Borra la fila y después el proyecto SoapUI (Storage impide borrar archivos referenciados). */
  override async delete(id: string): Promise<void> {
    const row = await this.deleteReturning(id, 'id, soapui_file_path');
    const path = row['soapui_file_path'];
    if (typeof path === 'string') {
      await this.removeFileQuietly(path);
    }
  }

  /** URL firmada de corta duración que fuerza la descarga con el nombre original. */
  async soapUiDownloadUrl(
    service: Pick<Service, 'soapui_file_path' | 'soapui_file_name'>,
  ): Promise<string> {
    if (!service.soapui_file_path) {
      throw new AppError('not_found', 'Este servicio no tiene proyecto SoapUI.');
    }
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(service.soapui_file_path, environment.storage.signedUrlTtlSeconds, {
        download: service.soapui_file_name ?? 'soapui-project.xml',
      });
    if (error) {
      throw toAppError(error);
    }
    return data.signedUrl;
  }

  private async uploadSoapUi(file: File, ownerId: string = this.requireUserId()): Promise<string> {
    const problem = await this.checkSoapUiFile(file);
    if (problem) {
      throw new AppError('validation', problem);
    }
    const path = `${ownerId}/${crypto.randomUUID()}.xml`;
    const { error } = await this.supabase.storage.from(this.bucket).upload(path, file, {
      contentType: 'application/xml',
      upsert: false,
      cacheControl: '3600',
    });
    if (error) {
      throw toAppError(error);
    }
    return path;
  }

  private async removeFileQuietly(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([path]);
    if (error) {
      console.warn('[DevHub] No se pudo eliminar el archivo', path, toAppError(error));
    }
  }
}

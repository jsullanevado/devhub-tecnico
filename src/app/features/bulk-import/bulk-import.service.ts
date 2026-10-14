import { Injectable, inject } from '@angular/core';
import ExcelJS from 'exceljs';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth/auth.service';
import { toAppError } from '../../core/errors/error-mapper';
import {
  DATABASE_ENGINES,
  DATABASE_ENVIRONMENTS,
  DatabaseObject,
  HTTP_METHODS,
  SERVICE_URL_PATTERN,
  ServiceOperation,
  SERVICE_AUTH_TYPES,
} from '../../core/models';
import { SUPABASE } from '../../core/supabase/supabase.client';

export interface ImportIssue {
  sheet: string;
  row: number;
  message: string;
}

export interface ImportSummary {
  connectionsNew: number;
  connectionsUpdated: number;
  objectsNew: number;
  objectsUpdated: number;
  membersNew: number;
  servicesNew: number;
  servicesUpdated: number;
  operationsNew: number;
  operationsUpdated: number;
  calls: number;
  dbUses: number;
  examplesSkipped: number;
}

export interface ImportReport {
  applied: boolean;
  errors: ImportIssue[];
  errorCount: number;
  warnings: ImportIssue[];
  summary: ImportSummary;
}

interface ColumnSpec {
  key: string;
  required?: boolean;
  width: number;
  list?: string[];
  raw?: boolean;
}

interface SheetSpec {
  name: string;
  columns: ColumnSpec[];
}

type DataRow = Record<string, string> & { _row: number };
type Changes = Record<string, unknown>;
type PlannedTarget = { service_id?: string; service_title?: string; operation?: string | null };
type PlannedReference = {
  database_id?: string;
  database_title?: string;
  object?: string;
  member?: string | null;
};
type PlannedOperation = Omit<ServiceOperation, 'targets' | 'db_refs'> & {
  targets?: PlannedTarget[];
  db_refs?: PlannedReference[];
};

interface PlannedDatabase {
  id: string;
  title: string;
  isNew: boolean;
  changes: Changes;
  objects: DatabaseObject[];
  objectsTouched: boolean;
}

interface PlannedService {
  id: string;
  title: string;
  isNew: boolean;
  isDataPower: boolean;
  changes: Changes;
  operations: PlannedOperation[];
  operationsTouched: boolean;
  row: number;
}

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_CELL_CHARS = 32_767;
const EXAMPLE_PREFIX = 'EJEMPLO_';

const OBJECT_TYPES = [
  'PACKAGE',
  'PROCEDURE',
  'FUNCTION',
  'TABLE',
  'VIEW',
  'SEQUENCE',
  'TRIGGER',
  'TYPE',
  'OTHER',
];
const VISIBILITIES = ['privado', 'publico'];
const COMPONENTS = ['Servicio', 'DataPower'];
const AUTH_VALUES: Record<string, string> = {
  ninguna: 'none',
  basic: 'basic',
  bearer: 'bearer',
  api_key: 'api_key',
  otra: 'other',
};
const DATABASE_ENGINE_VALUES: Record<string, string> = {
  oracle: 'oracle',
  sqlserver: 'sqlserver',
  postgresql: 'postgresql',
  mysql: 'mysql',
  otro: 'other',
};
const ENVIRONMENT_VALUES: Record<string, string> = {
  desarrollo: 'dev',
  qa: 'qa',
  produccion: 'prod',
  otro: 'other',
};
const VISIBILITY_VALUES: Record<string, string> = { privado: 'private', publico: 'public' };

const SHEETS: Record<string, SheetSpec> = {
  conexiones: {
    name: 'Conexiones',
    columns: [
      { key: 'titulo', required: true, width: 22 },
      { key: 'motor', width: 14, list: ['oracle', 'sqlserver', 'postgresql', 'mysql', 'otro'] },
      { key: 'entorno', width: 14, list: ['desarrollo', 'qa', 'produccion', 'otro'] },
      { key: 'host', width: 22 },
      { key: 'puerto', width: 9 },
      { key: 'servicio', width: 18 },
      { key: 'usuario', width: 16 },
      { key: 'contrasena', width: 18 },
      { key: 'cadena_conexion', width: 40 },
      { key: 'descripcion', width: 30 },
      { key: 'etiquetas', width: 22 },
      { key: 'visibilidad', width: 12, list: VISIBILITIES },
      { key: 'notas', width: 30 },
    ],
  },
  objetos: {
    name: 'Objetos',
    columns: [
      { key: 'conexion', required: true, width: 20 },
      { key: 'tipo', required: true, width: 13, list: OBJECT_TYPES },
      { key: 'esquema', width: 16 },
      { key: 'nombre', required: true, width: 26 },
      { key: 'sp', width: 28 },
      { key: 'descripcion', width: 36 },
      { key: 'codigo', width: 40, raw: true },
    ],
  },
  servicios: {
    name: 'Servicios',
    columns: [
      { key: 'titulo', required: true, width: 30 },
      { key: 'componente', required: true, width: 13, list: COMPONENTS },
      { key: 'tipo', required: true, width: 8, list: ['REST', 'SOAP'] },
      { key: 'url_base', required: true, width: 55 },
      { key: 'datapower_dominio', width: 20 },
      { key: 'datapower_objeto', width: 20 },
      { key: 'sistema', width: 12 },
      { key: 'url_wsdl', width: 40 },
      { key: 'autenticacion', width: 14, list: ['ninguna', 'basic', 'bearer', 'api_key', 'otra'] },
      { key: 'usuario', width: 16 },
      { key: 'secreto', width: 16 },
      { key: 'descripcion', width: 34 },
      { key: 'etiquetas', width: 20 },
      { key: 'visibilidad', width: 12, list: VISIBILITIES },
      { key: 'notas', width: 30 },
    ],
  },
  operaciones: {
    name: 'Operaciones',
    columns: [
      { key: 'servicio', required: true, width: 30 },
      { key: 'operacion', required: true, width: 26 },
      { key: 'metodo', width: 9, list: [...HTTP_METHODS] },
      { key: 'ruta', width: 30 },
      { key: 'soap_action', width: 24 },
      { key: 'media_type', width: 26 },
      { key: 'headers', width: 32 },
      { key: 'query_params', width: 24 },
      { key: 'request', width: 40, raw: true },
      { key: 'http_status', width: 11 },
      { key: 'response', width: 40, raw: true },
      { key: 'notas', width: 30 },
    ],
  },
  llamadas: {
    name: 'Llamadas',
    columns: [
      { key: 'servicio', required: true, width: 32 },
      { key: 'operacion', required: true, width: 26 },
      { key: 'servicio_destino', required: true, width: 32 },
      { key: 'operacion_destino', width: 26 },
    ],
  },
  usobd: {
    name: 'UsoBD',
    columns: [
      { key: 'servicio', required: true, width: 32 },
      { key: 'operacion', required: true, width: 26 },
      { key: 'conexion', required: true, width: 20 },
      { key: 'objeto', required: true, width: 30 },
      { key: 'sp', width: 28 },
    ],
  },
};

const emptySummary = (): ImportSummary => ({
  connectionsNew: 0,
  connectionsUpdated: 0,
  objectsNew: 0,
  objectsUpdated: 0,
  membersNew: 0,
  servicesNew: 0,
  servicesUpdated: 0,
  operationsNew: 0,
  operationsUpdated: 0,
  calls: 0,
  dbUses: 0,
  examplesSkipped: 0,
});

const normalize = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_');

const keyOf = (value: unknown): string => String(value ?? '').trim().toUpperCase();
const text = (value: unknown): string => String(value ?? '').trim();

function parseTags(value: string): string[] {
  return [...new Set(value.split(/[,;\n]/).map((tag) => tag.trim().replace(/^#/, '').replace(/\s+/g, '-')).filter(Boolean))].slice(0, 20);
}

function parsePairs(value: string): { name: string; value: string }[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line) => {
      const colon = line.indexOf(':');
      return colon < 0
        ? { name: line.slice(0, 200), value: '' }
        : { name: line.slice(0, colon).trim().slice(0, 200), value: line.slice(colon + 1).trim() };
    })
    .filter((pair) => pair.name);
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return structuredClone(value) as T[];
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

@Injectable({ providedIn: 'root' })
export class BulkImportService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly db = this.supabase as unknown as SupabaseClient;

  async preview(file: File): Promise<ImportReport> {
    const workbook = await this.readWorkbook(file);
    const parsed = this.readSheets(workbook);
    const plan = await this.makePlan(parsed.sheets, parsed.errors, parsed.examples);
    return this.report(plan, false);
  }

  async apply(file: File): Promise<ImportReport> {
    const workbook = await this.readWorkbook(file);
    const parsed = this.readSheets(workbook);
    const plan = await this.makePlan(parsed.sheets, parsed.errors, parsed.examples);
    if (plan.errors.length) {
      return this.report(plan, false);
    }

    const databases = [...plan.databases.values()].flatMap((item) => {
      const changes = { ...item.changes };
      if (item.objectsTouched) {
        changes['objects'] = item.objects;
      }
      return item.isNew || Object.keys(changes).length
        ? [{ id: item.id, is_new: item.isNew, changes }]
        : [];
    });

    const services = [...plan.services.values()].flatMap((item) => {
      const changes = { ...item.changes };
      if (item.isNew || item.operationsTouched) {
        changes['operations'] = item.operations.map((operation) => ({
          ...operation,
          targets: (operation.targets ?? []).map((target) =>
            target['service_title']
              ? {
                  service_id: plan.services.get(keyOf(target['service_title']))?.id,
                  operation: target['operation'] ?? null,
                }
              : target,
          ),
          db_refs: (operation.db_refs ?? []).map((reference) =>
            reference['database_title']
              ? {
                  database_id: plan.databases.get(keyOf(reference['database_title']))?.id,
                  object: reference['object'],
                  member: reference['member'] ?? null,
                }
              : reference,
          ),
        }));
      }
      return item.isNew || Object.keys(changes).length
        ? [{ id: item.id, is_new: item.isNew, changes }]
        : [];
    });

    const { error } = await this.db.rpc('bulk_import_apply', {
      p_databases: databases as never,
      p_services: services as never,
    });
    if (error) {
      throw toAppError(error);
    }
    return this.report(plan, true);
  }

  async downloadTemplate(): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const instructions = workbook.addWorksheet('Instrucciones');
    instructions.addRows([
      ['Carga masiva · DevHub Técnico'],
      ['Todas las hojas de datos son opcionales. No cambies los nombres de las columnas.'],
      ['Las filas cuyo primer campo empieza por EJEMPLO_ se ignoran.'],
      ['Para actualizar, usa el título existente. Los campos vacíos conservan su valor actual.'],
      ['UsoBD y Llamadas requieren que servicios, operaciones y conexiones existan o estén en el mismo archivo.'],
      ['Las contraseñas y secretos solo se exportan si lo solicitas explícitamente.'],
    ]);
    instructions.getColumn(1).width = 110;
    instructions.getRow(1).font = { bold: true, size: 14 };

    for (const spec of Object.values(SHEETS)) {
      const sheet = workbook.addWorksheet(spec.name);
      sheet.columns = spec.columns.map((column) => ({
        header: column.key,
        key: column.key,
        width: column.width,
      }));
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(spec.columns.length).letter}1` };
      spec.columns.forEach((column, index) => {
        const values = column.list;
        if (values?.length) {
          sheet.getColumn(index + 1).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
            if (rowNumber > 1) {
              cell.dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [`"${values.join(',')}"`],
              };
            }
          });
        }
      });
      sheet.addRow(spec.columns.map((column, index) => (index === 0 ? 'EJEMPLO_1' : '')));
      sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
    }
    await this.downloadWorkbook(workbook, 'plantilla_carga_masiva_devhub.xlsx');
  }

  async exportAll(includeSecrets = false): Promise<{ counts: Record<string, number>; skipped: string[] }> {
    const ownerId = this.requireUserId();
    const [databaseResult, serviceResult] = await Promise.all([
      this.db.from('databases').select('*').eq('owner_id', ownerId).order('title'),
      this.db.from('services').select('*').eq('owner_id', ownerId).order('title'),
    ]);
    if (databaseResult.error) {
      throw toAppError(databaseResult.error);
    }
    if (serviceResult.error) {
      throw toAppError(serviceResult.error);
    }

    const databases = (databaseResult.data ?? []) as Record<string, unknown>[];
    const services = (serviceResult.data ?? []) as Record<string, unknown>[];
    const databaseTitle = new Map(databases.map((item) => [String(item['id']), String(item['title'])]));
    const serviceTitle = new Map(services.map((item) => [String(item['id']), String(item['title'])]));
    const rows: Record<string, Record<string, unknown>[]> = Object.fromEntries(
      Object.keys(SHEETS).map((key) => [key, []]),
    );
    const skipped: string[] = [];
    const fit = (value: unknown, label: string): string => {
      const result = value === null || value === undefined ? '' : String(value);
      if (result.length > MAX_CELL_CHARS) {
        skipped.push(label);
        return '';
      }
      return result;
    };
    const reverse = (entries: Record<string, string>, value: unknown): string =>
      Object.entries(entries).find(([, mapped]) => mapped === value)?.[0] ?? '';

    for (const service of services) {
      const title = String(service['title']);
      rows['servicios'].push({
        titulo: title,
        componente: service['kind'] === 'datapower' ? 'DataPower' : 'Servicio',
        tipo: String(service['protocol'] ?? '').toUpperCase(),
        url_base: service['base_url'],
        datapower_dominio: service['datapower_domain'] ?? '',
        datapower_objeto: service['datapower_object'] ?? '',
        sistema: service['system'] ?? '',
        url_wsdl: service['wsdl_url'] ?? '',
        autenticacion: reverse(AUTH_VALUES, service['auth_type']),
        usuario: service['auth_username'] ?? '',
        secreto: includeSecrets ? service['auth_secret'] ?? '' : '',
        descripcion: service['description'] ?? '',
        etiquetas: Array.isArray(service['tags']) ? service['tags'].join(', ') : '',
        visibilidad: reverse(VISIBILITY_VALUES, service['visibility']),
        notas: fit(service['notes'], `Servicios · ${title} · notas`),
      });
      for (const operation of parseJsonArray<ServiceOperation>(service['operations'])) {
        const pairText = (pairs: { name: string; value: string }[] | undefined) =>
          (pairs ?? []).map((pair) => `${pair.name}: ${pair.value}`).join('\n');
        rows['operaciones'].push({
          servicio: title,
          operacion: operation.name,
          metodo: operation.method,
          ruta: operation.path ?? '',
          soap_action: operation.soap_action ?? '',
          media_type: operation.media_type ?? '',
          headers: fit(pairText(operation.headers), `Operaciones · ${title} · headers`),
          query_params: fit(pairText(operation.query_params), `Operaciones · ${title} · query_params`),
          request: fit(operation.request_body, `Operaciones · ${title} · request`),
          http_status: operation.response_status ?? '',
          response: fit(operation.response_body, `Operaciones · ${title} · response`),
          notas: fit(operation.notes, `Operaciones · ${title} · notas`),
        });
        for (const target of operation.targets ?? []) {
          const targetTitle = serviceTitle.get(target.service_id);
          if (targetTitle) {
            rows['llamadas'].push({
              servicio: title,
              operacion: operation.name,
              servicio_destino: targetTitle,
              operacion_destino: target.operation ?? '',
            });
          }
        }
        for (const reference of operation.db_refs ?? []) {
          const databaseName = databaseTitle.get(reference.database_id);
          if (databaseName) {
            rows['usobd'].push({
              servicio: title,
              operacion: operation.name,
              conexion: databaseName,
              objeto: reference.object,
              sp: reference.member ?? '',
            });
          }
        }
      }
    }

    for (const database of databases) {
      const title = String(database['title']);
      rows['conexiones'].push({
        titulo: title,
        motor: reverse(DATABASE_ENGINE_VALUES, database['engine']),
        entorno: reverse(ENVIRONMENT_VALUES, database['environment']),
        host: database['host'] ?? '',
        puerto: database['port'] ?? '',
        servicio: database['service_name'] ?? '',
        usuario: database['username'] ?? '',
        contrasena: includeSecrets ? database['password'] ?? '' : '',
        cadena_conexion: fit(database['connection_string'], `Conexiones · ${title} · cadena`),
        descripcion: database['description'] ?? '',
        etiquetas: Array.isArray(database['tags']) ? database['tags'].join(', ') : '',
        visibilidad: reverse(VISIBILITY_VALUES, database['visibility']),
        notas: fit(database['notes'], `Conexiones · ${title} · notas`),
      });
      for (const object of parseJsonArray<DatabaseObject>(database['objects'])) {
        const base = {
          conexion: title,
          tipo: object.type.toUpperCase(),
          esquema: object.schema ?? '',
          nombre: object.name,
          descripcion: object.description ?? '',
          codigo: fit(object.code, `Objetos · ${title} · ${object.name} · código`),
        };
        if (!object.members?.length) {
          rows['objetos'].push({ ...base, sp: '' });
        } else {
          object.members.forEach((member, index) =>
            rows['objetos'].push({ ...base, sp: member, ...(index ? { descripcion: '', codigo: '' } : {}) }),
          );
        }
      }
    }

    const workbook = this.buildWorkbook(rows);
    const date = new Date().toISOString().slice(0, 10);
    await this.downloadWorkbook(workbook, `devhub_exportacion_${date}.xlsx`);
    return { counts: Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, value.length])), skipped };
  }

  private async readWorkbook(file: File): Promise<ExcelJS.Workbook> {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      throw new Error('Elige un archivo de Excel .xlsx (si es .xls, guárdalo como .xlsx).');
    }
    if (!file.size || file.size > MAX_BYTES) {
      throw new Error('El Excel está vacío o supera los 15 MB.');
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new Error('El archivo no es un Excel (.xlsx) válido.');
    }
    return workbook;
  }

  private readSheets(workbook: ExcelJS.Workbook): {
    sheets: Record<string, DataRow[]>;
    errors: ImportIssue[];
    examples: number;
  } {
    const errors: ImportIssue[] = [];
    const sheets: Record<string, DataRow[]> = {};
    let examples = 0;
    for (const [id, definition] of Object.entries(SHEETS)) {
      const sheet = workbook.worksheets.find((item) => normalize(item.name) === id);
      const rows: DataRow[] = [];
      sheets[id] = rows;
      if (!sheet || sheet.rowCount < 1) {
        continue;
      }
      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      for (let column = 1; column <= headerRow.cellCount; column++) {
        headers.push(normalize(headerRow.getCell(column).text));
      }
      const missing = definition.columns.filter((column) => column.required && !headers.includes(column.key));
      if (missing.length) {
        errors.push({ sheet: definition.name, row: 1, message: `Faltan columnas: ${missing.map((column) => column.key).join(', ')}.` });
        continue;
      }
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
        const source = sheet.getRow(rowNumber);
        const values = headers.map((_header, index) => text(source.getCell(index + 1).text));
        if (!values.some(Boolean)) {
          continue;
        }
        if ((values[0] ?? '').toUpperCase().startsWith(EXAMPLE_PREFIX)) {
          examples++;
          continue;
        }
        const row: DataRow = { _row: rowNumber } as DataRow;
        headers.forEach((header, index) => {
          if (header) {
            const spec = definition.columns.find((column) => column.key === header);
            const cellValue = String(source.getCell(index + 1).text ?? '');
            row[header] = spec?.raw ? cellValue : cellValue.trim();
          }
        });
        const emptyRequired = definition.columns.filter((column) => column.required && !row[column.key]);
        if (emptyRequired.length) {
          errors.push({ sheet: definition.name, row: rowNumber, message: `Falta ${emptyRequired.map((column) => column.key).join(', ')}.` });
        } else {
          rows.push(row);
        }
      }
    }
    return { sheets, errors, examples };
  }

  private async makePlan(
    sheets: Record<string, DataRow[]>,
    errors: ImportIssue[],
    examples: number,
  ): Promise<{
    errors: ImportIssue[];
    warnings: ImportIssue[];
    summary: ImportSummary;
    databases: Map<string, PlannedDatabase>;
    services: Map<string, PlannedService>;
  }> {
    const warnings: ImportIssue[] = [];
    const summary = emptySummary();
    summary.examplesSkipped = examples;
    const ownerId = this.requireUserId();
    const [databaseResult, serviceResult] = await Promise.all([
      this.db.from('databases').select('id,title,objects').eq('owner_id', ownerId),
      this.db.from('services').select('id,title,kind,operations').eq('owner_id', ownerId),
    ]);
    if (databaseResult.error) throw toAppError(databaseResult.error);
    if (serviceResult.error) throw toAppError(serviceResult.error);
    const existingDatabases = new Map(
      (databaseResult.data ?? []).map((item) => [keyOf(item.title), item]),
    );
    const existingServices = new Map(
      (serviceResult.data ?? []).map((item) => [keyOf(item.title), item]),
    );
    const databases = new Map<string, PlannedDatabase>();
    const services = new Map<string, PlannedService>();
    const error = (sheet: string, row: number, message: string) => errors.push({ sheet, row, message });
    const databaseFor = (title: string): PlannedDatabase | null => {
      const key = keyOf(title);
      const planned = databases.get(key);
      if (planned) return planned;
      const existing = existingDatabases.get(key);
      if (!existing) return null;
      const entry: PlannedDatabase = {
        id: existing.id,
        title: existing.title,
        isNew: false,
        changes: {},
        objects: parseJsonArray<DatabaseObject>(existing.objects),
        objectsTouched: false,
      };
      databases.set(key, entry);
      return entry;
    };
    const serviceFor = (title: string): PlannedService | null => {
      const key = keyOf(title);
      const planned = services.get(key);
      if (planned) return planned;
      const existing = existingServices.get(key);
      if (!existing) return null;
      const entry: PlannedService = {
        id: existing.id,
        title: existing.title,
        isNew: false,
        isDataPower: existing.kind === 'datapower',
        changes: {},
        operations: parseJsonArray<PlannedOperation>(existing.operations),
        operationsTouched: false,
        row: 0,
      };
      services.set(key, entry);
      return entry;
    };

    for (const row of sheets['conexiones'] ?? []) {
      const key = keyOf(row['titulo']);
      if (databases.has(key)) {
        error(SHEETS['conexiones'].name, row._row, `La conexión "${row['titulo']}" está repetida.`);
        continue;
      }
      const existing = existingDatabases.get(key);
      if (text(row['titulo']).length < 3 || text(row['titulo']).length > 200) {
        error(SHEETS['conexiones'].name, row._row, 'El título debe tener entre 3 y 200 caracteres.');
      }
      const changes: Changes = {};
      if (!existing) changes['title'] = text(row['titulo']);
      this.setText(changes, 'description', row['descripcion']);
      this.setText(changes, 'host', row['host']);
      this.setText(changes, 'service_name', row['servicio']);
      this.setText(changes, 'username', row['usuario']);
      this.setText(changes, 'password', row['contrasena']);
      this.setText(changes, 'connection_string', row['cadena_conexion']);
      this.setText(changes, 'notes', row['notas']);
      if (row['motor']) changes['engine'] = DATABASE_ENGINE_VALUES[normalize(row['motor'])];
      if (row['entorno']) changes['environment'] = ENVIRONMENT_VALUES[normalize(row['entorno'])];
      if (row['visibilidad']) changes['visibility'] = VISIBILITY_VALUES[normalize(row['visibilidad'])];
      if (row['etiquetas']) changes['tags'] = parseTags(row['etiquetas']);
      if (row['puerto']) {
        const port = Number(row['puerto']);
        if (!Number.isInteger(port) || port < 1 || port > 65535) error(SHEETS['conexiones'].name, row._row, `puerto no válido: "${row['puerto']}".`);
        else changes['port'] = port;
      }
      if (row['motor'] && !changes['engine']) error(SHEETS['conexiones'].name, row._row, `motor no válido: "${row['motor']}".`);
      if (row['entorno'] && !changes['environment']) error(SHEETS['conexiones'].name, row._row, `entorno no válido: "${row['entorno']}".`);
      if (row['visibilidad'] && !changes['visibility']) error(SHEETS['conexiones'].name, row._row, `visibilidad no válida: "${row['visibilidad']}".`);
      if (!existing && !row['host'] && !row['cadena_conexion']) error(SHEETS['conexiones'].name, row._row, 'Indica el host o la cadena de conexión.');
      if (!existing) {
        changes['engine'] ??= 'oracle';
        changes['environment'] ??= 'dev';
        changes['visibility'] ??= 'private';
      }
      const entry: PlannedDatabase = {
        id: existing?.id ?? crypto.randomUUID(),
        title: existing?.title ?? text(row['titulo']),
        isNew: !existing,
        changes,
        objects: existing ? parseJsonArray<DatabaseObject>(existing.objects) : [],
        objectsTouched: false,
      };
      databases.set(key, entry);
      summary[existing ? 'connectionsUpdated' : 'connectionsNew']++;
    }

    const seenObjectKeys = new Set<string>();
    for (const row of sheets['objetos'] ?? []) {
      const database = databaseFor(row['conexion']);
      if (!database) {
        error(SHEETS['objetos'].name, row._row, `La conexión "${row['conexion']}" no existe (agrégala en Conexiones).`);
        continue;
      }
      const type = normalize(row['tipo']).toUpperCase();
      if (!OBJECT_TYPES.includes(type)) {
        error(SHEETS['objetos'].name, row._row, `tipo no válido: "${row['tipo']}".`);
        continue;
      }
      const name = keyOf(row['nombre']);
      const schema = row['esquema'] ? keyOf(row['esquema']) : null;
      if (name.length > 128 || (schema?.length ?? 0) > 128) {
        error(SHEETS['objetos'].name, row._row, 'El esquema y el nombre admiten hasta 128 caracteres.');
        continue;
      }
      const key = `${database.id}|${schema ?? ''}|${name}`;
      let object = database.objects.find((item) => keyOf(item.name) === name && keyOf(item.schema ?? '') === (schema ?? ''));
      if (!object) {
        object = { type: type.toLowerCase() as DatabaseObject['type'], schema, name, description: null, members: [], code: null };
        database.objects.push(object);
        summary.objectsNew++;
      } else if (!seenObjectKeys.has(key)) {
        object.type = type.toLowerCase() as DatabaseObject['type'];
        summary.objectsUpdated++;
      }
      seenObjectKeys.add(key);
      database.objectsTouched = true;
      if (row['descripcion']) object.description = row['descripcion'].slice(0, 5000);
      if (row['codigo']) object.code = row['codigo'];
      if (row['sp']) {
        if (!['PACKAGE', 'TYPE'].includes(type)) error(SHEETS['objetos'].name, row._row, 'La columna sp solo aplica a PACKAGE o TYPE.');
        else {
          const member = keyOf(row['sp']).slice(0, 128);
          if (!object.members?.some((item) => keyOf(item) === member)) {
            object.members = [...(object.members ?? []), member];
            summary.membersNew++;
          }
        }
      }
    }

    for (const row of sheets['servicios'] ?? []) {
      const key = keyOf(row['titulo']);
      if (services.has(key)) {
        error(SHEETS['servicios'].name, row._row, `El servicio "${row['titulo']}" está repetido.`);
        continue;
      }
      const existing = existingServices.get(key);
      const component = normalize(row['componente']);
      const kind = component === 'datapower' ? 'datapower' : component === 'servicio' ? 'service' : null;
      if (!kind) error(SHEETS['servicios'].name, row._row, `componente no válido: "${row['componente']}". Usa Servicio o DataPower.`);
      if (kind === 'service' && (row['datapower_dominio'] || row['datapower_objeto'])) error(SHEETS['servicios'].name, row._row, 'Los campos DataPower solo aplican a ese componente.');
      const protocol = normalize(row['tipo']);
      if (!['rest', 'soap'].includes(protocol)) error(SHEETS['servicios'].name, row._row, `tipo no válido: "${row['tipo']}". Usa REST o SOAP.`);
      if (!SERVICE_URL_PATTERN.test(row['url_base'])) error(SHEETS['servicios'].name, row._row, 'url_base debe empezar por http:// o https://.');
      if (row['url_wsdl'] && !SERVICE_URL_PATTERN.test(row['url_wsdl'])) error(SHEETS['servicios'].name, row._row, 'url_wsdl debe empezar por http:// o https://.');
      const changes: Changes = {};
      if (!existing) changes['title'] = text(row['titulo']);
      if (kind) changes['kind'] = kind;
      if (protocol === 'rest' || protocol === 'soap') changes['protocol'] = protocol;
      this.setText(changes, 'base_url', row['url_base']);
      this.setText(changes, 'wsdl_url', row['url_wsdl']);
      this.setText(changes, 'datapower_domain', row['datapower_dominio']);
      this.setText(changes, 'datapower_object', row['datapower_objeto']);
      this.setText(changes, 'system', row['sistema']);
      this.setText(changes, 'auth_username', row['usuario']);
      this.setText(changes, 'auth_secret', row['secreto']);
      this.setText(changes, 'description', row['descripcion']);
      this.setText(changes, 'notes', row['notas']);
      if (row['autenticacion']) {
        changes['auth_type'] = AUTH_VALUES[normalize(row['autenticacion'])];
        if (!changes['auth_type']) error(SHEETS['servicios'].name, row._row, `autenticacion no válida: "${row['autenticacion']}".`);
      } else if (!existing) changes['auth_type'] = 'none';
      if (row['visibilidad']) {
        changes['visibility'] = VISIBILITY_VALUES[normalize(row['visibilidad'])];
        if (!changes['visibility']) error(SHEETS['servicios'].name, row._row, `visibilidad no válida: "${row['visibilidad']}".`);
      } else if (!existing) changes['visibility'] = 'private';
      if (row['etiquetas']) changes['tags'] = parseTags(row['etiquetas']);
      const entry: PlannedService = {
        id: existing?.id ?? crypto.randomUUID(),
        title: existing?.title ?? text(row['titulo']),
        isNew: !existing,
        isDataPower: kind ? kind === 'datapower' : existing?.kind === 'datapower',
        changes,
        operations: existing ? parseJsonArray(existing.operations) : [],
        operationsTouched: false,
        row: row._row,
      };
      services.set(key, entry);
      summary[existing ? 'servicesUpdated' : 'servicesNew']++;
    }

    const operationFor = (service: PlannedService, name: string) =>
      service.operations.find((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase());
    const seenOperations = new Set<string>();
    for (const row of sheets['operaciones'] ?? []) {
      const service = serviceFor(row['servicio']);
      if (!service) {
        error(SHEETS['operaciones'].name, row._row, `El servicio "${row['servicio']}" no existe (agrégalo en Servicios).`);
        continue;
      }
      const opKey = `${keyOf(service.title)}|${keyOf(row['operacion'])}`;
      if (seenOperations.has(opKey)) {
        error(SHEETS['operaciones'].name, row._row, `La operación "${row['operacion']}" está repetida.`);
        continue;
      }
      seenOperations.add(opKey);
      if (row['operacion'].length > 120) {
        error(SHEETS['operaciones'].name, row._row, 'El nombre de la operación admite hasta 120 caracteres.');
        continue;
      }
      let operation = operationFor(service, row['operacion']);
      if (!operation) {
        operation = { name: row['operacion'], method: 'POST', headers: [], query_params: [] } as PlannedService['operations'][number];
        service.operations.push(operation);
        summary.operationsNew++;
      } else summary.operationsUpdated++;
      service.operationsTouched = true;
      if (row['metodo']) {
        const method = keyOf(row['metodo']);
        if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) error(SHEETS['operaciones'].name, row._row, `metodo no válido: "${row['metodo']}".`);
        else operation.method = method as ServiceOperation['method'];
      }
      for (const [column, field] of [['ruta', 'path'], ['soap_action', 'soap_action'], ['media_type', 'media_type'], ['notas', 'notes']] as const) {
        if (row[column]) (operation as unknown as Record<string, unknown>)[field] = row[column];
      }
      if (row['request']) operation.request_body = row['request'];
      if (row['response']) operation.response_body = row['response'];
      if (row['http_status']) {
        const status = Number(row['http_status']);
        if (!Number.isInteger(status) || status < 100 || status > 599) error(SHEETS['operaciones'].name, row._row, `http_status no válido: "${row['http_status']}".`);
        else operation.response_status = status;
      }
      if (row['headers']) operation.headers = parsePairs(row['headers']);
      if (row['query_params']) operation.query_params = parsePairs(row['query_params']);
    }

    for (const row of sheets['llamadas'] ?? []) {
      const service = serviceFor(row['servicio']);
      const target = serviceFor(row['servicio_destino']);
      if (!service || !target) {
        error(SHEETS['llamadas'].name, row._row, 'El servicio origen o destino no existe. Agrégalo en Servicios.');
        continue;
      }
      const operation = operationFor(service, row['operacion']);
      if (!operation) {
        error(SHEETS['llamadas'].name, row._row, `La operación "${row['operacion']}" no existe en "${service.title}".`);
        continue;
      }
      if (service.id === target.id) {
        error(SHEETS['llamadas'].name, row._row, 'Un servicio no puede llamarse a sí mismo.');
        continue;
      }
      const targets = operation.targets ?? [];
      const duplicate = targets.some((item) =>
        (item['service_title'] ? keyOf(item['service_title']) === keyOf(target.title) : item['service_id'] === target.id) &&
        keyOf(item['operation'] ?? '') === keyOf(row['operacion_destino'] ?? ''),
      );
      if (!duplicate) {
        targets.push({ service_title: target.title, operation: row['operacion_destino'] || null });
        operation.targets = targets;
        service.operationsTouched = true;
        summary.calls++;
      }
    }

    for (const row of sheets['usobd'] ?? []) {
      const service = serviceFor(row['servicio']);
      const database = databaseFor(row['conexion']);
      if (!service || !database) {
        error(SHEETS['usobd'].name, row._row, 'El servicio o la conexión no existe. Agrégalo en sus hojas.');
        continue;
      }
      if (service.isDataPower) {
        error(SHEETS['usobd'].name, row._row, 'Un DataPower no puede tener referencias a objetos de base de datos.');
        continue;
      }
      const operation = operationFor(service, row['operacion']);
      if (!operation) {
        error(SHEETS['usobd'].name, row._row, `La operación "${row['operacion']}" no existe en "${service.title}".`);
        continue;
      }
      const objectName = keyOf(row['objeto']);
      const refs = operation.db_refs ?? [];
      const duplicate = refs.some((item) =>
        (item['database_title'] ? keyOf(item['database_title']) === keyOf(database.title) : item['database_id'] === database.id) &&
        keyOf(item['object']) === objectName && keyOf(item['member'] ?? '') === keyOf(row['sp'] ?? ''),
      );
      if (!duplicate) {
        refs.push({ database_title: database.title, object: objectName, member: row['sp'] ? keyOf(row['sp']) : null });
        operation.db_refs = refs;
        service.operationsTouched = true;
        summary.dbUses++;
      }
      const registered = database.objects.some((item) => {
        const fullName = item.schema ? `${keyOf(item.schema)}.${keyOf(item.name)}` : keyOf(item.name);
        return fullName === objectName || fullName.endsWith(`.${objectName}`) || objectName.endsWith(`.${fullName}`);
      });
      if (!registered) warnings.push({ sheet: SHEETS['usobd'].name, row: row._row, message: `${objectName} no está registrado en ${database.title}; la relación se guardará igualmente.` });
    }

    for (const service of services.values()) {
      if (!service.isDataPower) continue;
      for (const operation of service.operations) {
        if ((operation.targets?.length ?? 0) > 1 || (operation.db_refs?.length ?? 0) > 0) {
          error(SHEETS['servicios'].name, service.row, `El DataPower "${service.title}" solo puede enrutar a un servicio y no admite referencias a objetos de BD.`);
        }
      }
    }

    return { errors, warnings, summary, databases, services };
  }

  private report(
    plan: { errors: ImportIssue[]; warnings: ImportIssue[]; summary: ImportSummary },
    applied: boolean,
  ): ImportReport {
    return {
      applied,
      errors: plan.errors.slice(0, 200),
      errorCount: plan.errors.length,
      warnings: plan.warnings.slice(0, 100),
      summary: plan.summary,
    };
  }

  private buildWorkbook(rows: Record<string, Record<string, unknown>[]>): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    for (const [id, definition] of Object.entries(SHEETS)) {
      const sheet = workbook.addWorksheet(definition.name);
      sheet.columns = definition.columns.map((column) => ({ header: column.key, key: column.key, width: column.width }));
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(definition.columns.length).letter}1` };
      for (const value of rows[id] ?? []) sheet.addRow(value);
    }
    return workbook;
  }

  private async downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string): Promise<void> {
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: MIME }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private setText(changes: Changes, field: string, value: string): void {
    if (value) changes[field] = value;
  }

  private requireUserId(): string {
    const userId = this.auth.userId();
    if (!userId) throw new Error('Inicia sesión para usar la carga masiva.');
    return userId;
  }
}
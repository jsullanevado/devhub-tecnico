import { Injectable, inject } from '@angular/core';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { FlowAnalysis, FlowEvent, FlowFile, FlowLane, FlowStep } from './flows.models';

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

interface MethodEntry {
  name: string;
  file: string;
  body: string;
  line: number;
}

const SKIP_DIRS = new Set(['.git', '.vs', 'bin', 'debug', 'node_modules', 'obj', 'packages', 'release', 'testresults']);
const MAX_CODE_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 20_000;
const MAX_DEPTH = 12;

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function safeId(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^\d/, '_$&');
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'flujo';
}

export function buildBpmnXml(event: Pick<FlowEvent, 'id' | 'name' | 'trigger' | 'steps'>, page: string): string {
  const processId = safeId(`process_${page}_${event.id}`);
  const startId = `${processId}_start`;
  const endId = `${processId}_end`;
  const taskIds = event.steps.map((_step, index) => `${processId}_task_${index + 1}`);
  const flowIds = Array.from({ length: taskIds.length + 1 }, (_item, index) => `${processId}_flow_${index + 1}`);
  const nodes = [startId, ...taskIds, endId];
  const laneNames: Record<FlowLane, string> = {
    front: 'Front',
    datapower: 'DataPower',
    servicio: 'Servicio',
    bd: 'BD',
  };
  const laneRefs = new Map<FlowLane, string[]>();
  for (const lane of Object.keys(laneNames) as FlowLane[]) laneRefs.set(lane, []);
  laneRefs.get('front')!.push(startId, endId);
  event.steps.forEach((step, index) => laneRefs.get(step.lane)!.push(taskIds[index]));

  const laneOrder = Object.keys(laneNames) as FlowLane[];
  const laneY: Record<FlowLane, number> = { front: 0, datapower: 150, servicio: 300, bd: 450 };
  const positions = nodes.map((id, index) => {
    const isEvent = id === startId || id === endId;
    const lane = id === startId || id === endId ? 'front' : event.steps[index - 1].lane;
    return { id, x: 180 + index * 190, y: laneY[lane] + (isEvent ? 32 : 40), w: isEvent ? 36 : 150, h: isEvent ? 36 : 70 };
  });
  const shapes = positions.map(({ id, x, y, w, h }) =>
    `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}"/></bpmndi:BPMNShape>`,
  ).join('');
  const edges = flowIds.map((id, index) => {
    const from = positions[index];
    const to = positions[index + 1];
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const mid = Math.floor((x1 + x2) / 2);
    return `<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}"><di:waypoint x="${x1}" y="${y1}"/><di:waypoint x="${mid}" y="${y1}"/><di:waypoint x="${mid}" y="${y2}"/><di:waypoint x="${x2}" y="${y2}"/></bpmndi:BPMNEdge>`;
  }).join('');
  const laneXml = laneOrder.map((lane) => `<bpmn:lane id="${processId}_lane_${lane}" name="${laneNames[lane]}">${laneRefs.get(lane)!.map((id) => `<bpmn:flowNodeRef>${id}</bpmn:flowNodeRef>`).join('')}</bpmn:lane>`).join('');
  const laneShapes = laneOrder.map((lane, index) => `<bpmndi:BPMNShape id="${processId}_lane_${lane}_di" bpmnElement="${processId}_lane_${lane}" isHorizontal="true"><dc:Bounds x="100" y="${index * 150}" width="${260 + nodes.length * 190}" height="150"/></bpmndi:BPMNShape>`).join('');
  const participantShape = `<bpmndi:BPMNShape id="${processId}_participant_di" bpmnElement="${processId}_participant" isHorizontal="true"><dc:Bounds x="80" y="0" width="${280 + nodes.length * 190}" height="600"/></bpmndi:BPMNShape>`;
  const taskXml = event.steps.map((step, index) => `<bpmn:task id="${taskIds[index]}" name="${xml(step.name)}"><bpmn:documentation>${xml(step.doc)}</bpmn:documentation><bpmn:incoming>${flowIds[index]}</bpmn:incoming><bpmn:outgoing>${flowIds[index + 1]}</bpmn:outgoing></bpmn:task>`).join('');
  const sequenceXml = flowIds.map((id, index) => `<bpmn:sequenceFlow id="${id}" sourceRef="${nodes[index]}" targetRef="${nodes[index + 1]}"/>`).join('');
  const laneSet = `<bpmn:laneSet id="${processId}_lanes">${laneXml}</bpmn:laneSet>`;
  const process = `<bpmn:process id="${processId}" name="${xml(event.name)}" isExecutable="false">${laneSet}<bpmn:startEvent id="${startId}" name="${xml(event.trigger)}"><bpmn:outgoing>${flowIds[0]}</bpmn:outgoing></bpmn:startEvent>${taskXml}<bpmn:endEvent id="${endId}" name="Fin"><bpmn:incoming>${flowIds.at(-1)}</bpmn:incoming></bpmn:endEvent>${sequenceXml}</bpmn:process>`;
  const participants = `<bpmn:collaboration id="${processId}_collaboration"><bpmn:participant id="${processId}_participant" name="${xml(page)}" processRef="${processId}"/></bpmn:collaboration>`;
  return `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="${processId}_definitions" targetNamespace="https://devhub-tecnico.local/bpmn">${process}${participants}<bpmndi:BPMNDiagram id="${processId}_diagram"><bpmndi:BPMNPlane id="${processId}_plane" bpmnElement="${processId}_collaboration">${participantShape}${laneShapes}${shapes}${edges}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
}

@Injectable({ providedIn: 'root' })
export class FlowsService {
  private files = new Map<string, File>();
  private repoName = '';

  get pages(): string[] {
    return [...this.files.keys()].filter((path) => /\.(aspx|cshtml|vbhtml)$/i.test(path)).sort();
  }

  get repositoryName(): string {
    return this.repoName;
  }

  get supportsDirectoryPicker(): boolean {
    return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
  }

  async pickDirectory(): Promise<string | null> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return null;
    let handle: DirectoryHandle;
    try {
      handle = await picker.call(window, { id: 'devhub-flows-repository', mode: 'read' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }
    const files = new Map<string, File>();
    await this.walk(handle, '', files, 0);
    this.files = files;
    this.repoName = handle.name;
    return this.repoName;
  }

  async fromFileList(list: FileList): Promise<string | null> {
    const files = Array.from(list);
    if (!files.length) return null;
    this.files = new Map<string, File>();
    for (const file of files) {
      const path = file.webkitRelativePath.split('/').slice(1).join('/') || file.name;
      if (!this.excluded(path)) this.files.set(path, file);
    }
    this.repoName = files[0].webkitRelativePath.split('/')[0] || 'repositorio';
    return this.repoName;
  }

  async analyze(page: string): Promise<FlowAnalysis> {
    const started = performance.now();
    const source = this.files.get(page);
    if (!source) throw new Error('La página no existe en la carpeta seleccionada.');
    const pageText = await this.read(source);
    const mvc = /\.(cshtml|vbhtml)$/i.test(page);
    const codePath = this.sidecar(page);
    const codeText = codePath ? await this.read(this.files.get(codePath)!) : '';
    const allCode = await Promise.all([...this.files.entries()]
      .filter(([path, file]) => /\.(cs|vb)$/i.test(path) && file.size <= MAX_CODE_BYTES)
      .map(async ([path, file]) => [path, await this.read(file)] as const));
    const methods = allCode.flatMap(([path, text]) => this.methods(path, text));
    const warnings: string[] = [];
    const events = mvc
      ? this.mvcEvents(page, pageText, methods, warnings)
      : this.webFormsEvents(page, pageText, codeText, methods, warnings);
    const resolved = events.map((event, index) => {
      const entry = methods.find((method) => method.name.toLowerCase() === event.method.toLowerCase());
      const steps = this.trace(entry, methods);
      const result: FlowEvent = {
        id: `E${index + 1}`,
        name: event.method,
        trigger: event.trigger,
        entry: entry ? `${entry.file}:${entry.line}` : page,
        steps,
        xml: '',
        fileName: `${slug(this.repoName)}-${slug(event.method)}.bpmn`,
      };
      result.xml = buildBpmnXml(result, page);
      return result;
    });
    if (!resolved.length) warnings.push('No se encontraron eventos o acciones vinculados a esta página.');
    return {
      page,
      kind: mvc ? 'mvc' : 'webforms',
      events: resolved,
      warnings,
      stats: { files: this.files.size, methods: methods.length, ms: Math.round(performance.now() - started) },
    };
  }

  async exportEvent(event: FlowEvent): Promise<void> {
    this.download(event.fileName, event.xml, 'application/xml;charset=utf-8');
  }

  async exportAll(analysis: FlowAnalysis): Promise<void> {
    const zip = new JSZip();
    for (const event of analysis.events) zip.file(event.fileName, event.xml);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Insumos');
    sheet.columns = [
      { header: 'Evento', key: 'event', width: 28 },
      { header: 'Carril', key: 'lane', width: 16 },
      { header: 'Paso', key: 'name', width: 48 },
      { header: 'Origen', key: 'doc', width: 80 },
    ];
    analysis.events.forEach((event) => event.steps.forEach((step) => sheet.addRow({ event: event.trigger, lane: step.lane, name: step.name, doc: step.doc })));
    sheet.getRow(1).font = { bold: true };
    zip.file('insumos.xlsx', await workbook.xlsx.writeBuffer());
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    this.download(`${slug(analysis.page)}-bpmn.zip`, url, 'application/zip', true);
  }

  private async walk(directory: DirectoryHandle, prefix: string, files: Map<string, File>, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || files.size >= MAX_FILES) return;
    for await (const entry of directory.values()) {
      if (files.size >= MAX_FILES) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) await this.walk(entry, path, files, depth + 1);
      } else {
        const file = await entry.getFile();
        if (!this.excluded(path)) files.set(path, file);
      }
    }
  }

  private excluded(path: string): boolean {
    return path.split('/').some((segment) => SKIP_DIRS.has(segment.toLowerCase()));
  }

  private sidecar(page: string): string | null {
    const candidates = page.endsWith('.aspx')
      ? [`${page}.cs`, `${page}.vb`, page.replace(/\.aspx$/i, '.aspx.cs'), page.replace(/\.aspx$/i, '.aspx.vb')]
      : [`${page}.cs`, `${page}.vb`];
    return candidates.find((candidate) => this.files.has(candidate)) ?? null;
  }

  private async read(file: File): Promise<string> {
    if (file.size > MAX_CODE_BYTES) return '';
    return file.text();
  }

  private methods(path: string, content: string): MethodEntry[] {
    const found: MethodEntry[] = [];
    const regex = /(?:public|private|protected|internal|static|async|override|virtual|\s)+[\w<>\[\],.?]+\s+(\w+)\s*\([^;{}]*\)\s*(?:\{|\n)/g;
    for (const match of content.matchAll(regex)) {
      const start = (match.index ?? 0) + match[0].length;
      const open = content.indexOf('{', start - 1);
      if (open < 0) continue;
      let depth = 0;
      let end = open;
      for (; end < content.length; end++) {
        if (content[end] === '{') depth++;
        if (content[end] === '}' && --depth === 0) break;
      }
      const body = content.slice(open + 1, end);
      found.push({ name: match[1], file: path, body, line: content.slice(0, match.index).split('\n').length });
    }
    const vb = /(?:Sub|Function)\s+(\w+)\s*\([^\n]*\)[^\n]*\n([\s\S]*?)\n\s*End\s+(?:Sub|Function)/gi;
    for (const match of content.matchAll(vb)) {
      found.push({ name: match[1], file: path, body: match[2], line: content.slice(0, match.index).split('\n').length });
    }
    return found;
  }

  private webFormsEvents(page: string, markup: string, code: string, methods: MethodEntry[], warnings: string[]): { method: string; trigger: string }[] {
    const handlers = new Map<string, string>();
    for (const match of markup.matchAll(/\b(On\w+)\s*=\s*["']([A-Za-z_]\w*)["']/gi)) handlers.set(match[2], match[1]);
    const pageLoad = methods.find((method) => method.name.toLowerCase() === 'page_load');
    if (pageLoad) handlers.set(pageLoad.name, 'Page_Load');
    const handlersClause = /Handles\s+[\w.,\s]+\.(Click|Command|SelectedIndexChanged|TextChanged)/gi;
    for (const match of code.matchAll(handlersClause)) {
      const prior = code.slice(0, match.index).match(/(?:Sub|Function)\s+(\w+)\s*\([^)]*\)\s*$/i);
      if (prior) handlers.set(prior[1], match[1]);
    }
    if (!handlers.size) warnings.push(`No se identificaron manejadores de eventos en ${page}.`);
    return [...handlers].map(([method, trigger]) => ({ method, trigger }));
  }

  private mvcEvents(page: string, markup: string, methods: MethodEntry[], warnings: string[]): { method: string; trigger: string }[] {
    const actions = new Set<string>();
    for (const match of markup.matchAll(/(?:asp-action|action)\s*=\s*["']([\w-]+)["']/gi)) actions.add(match[1]);
    for (const match of markup.matchAll(/(?:url|action)\s*:\s*["'][^"']*\/([\w-]+)(?:\?|["'])/gi)) actions.add(match[1]);
    const events = [...actions].map((action) => ({
      method: methods.find((method) => method.name.toLowerCase() === action.toLowerCase())?.name ?? action,
      trigger: `Acción ${action}`,
    }));
    if (!events.length) warnings.push(`No se identificaron acciones del controlador en ${page}.`);
    return events;
  }

  private trace(entry: MethodEntry | undefined, methods: MethodEntry[]): FlowStep[] {
    if (!entry) return [];
    const steps: FlowStep[] = [];
    const seen = new Set<string>();
    const byName = new Map(methods.map((method) => [method.name.toLowerCase(), method]));
    const visit = (method: MethodEntry, depth: number) => {
      if (depth > 5 || seen.has(`${method.file}:${method.name}`) || steps.length >= 25) return;
      seen.add(`${method.file}:${method.name}`);
      const body = method.body;
      const sql = body.match(/(?:CommandText\s*=|StoredProcedure\s*,?\s*["'])([^"'\n;]+)/i);
      if (sql) steps.push({ lane: 'bd', name: sql[1].trim(), doc: `${method.file}:${method.line}` });
      for (const match of body.matchAll(/(?:RestServiceDP|DataPower)[\w.]*\s*\([^)]*["']([^"']+)["']/gi)) {
        steps.push({ lane: 'datapower', name: match[1], doc: `${method.file}:${method.line}` });
      }
      for (const match of body.matchAll(/https?:\/\/[^"'\s)]+/g)) {
        steps.push({ lane: 'servicio', name: match[0], doc: `${method.file}:${method.line}` });
      }
      for (const match of body.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
        const next = byName.get(match[1].toLowerCase());
        if (next && next.name !== method.name) visit(next, depth + 1);
      }
    };
    visit(entry, 0);
    return steps;
  }

  private download(fileName: string, value: string | Blob, mime: string, valueIsUrl = false): void {
    const url = valueIsUrl ? String(value) : URL.createObjectURL(new Blob([value], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    if (!valueIsUrl) setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
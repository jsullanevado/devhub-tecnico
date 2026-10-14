/** Carriles del flujo (igual que LANES de electron/flow-builder.cjs). */
export const FLOW_LANES = [
  { id: 'front', name: 'Front' },
  { id: 'datapower', name: 'DataPower' },
  { id: 'servicio', name: 'Servicio' },
  { id: 'bd', name: 'BD' },
] as const;
export type FlowLane = (typeof FLOW_LANES)[number]['id'];

export interface FlowStep {
  lane: FlowLane;
  name: string;
  doc?: string | null;
  url?: string | null;
  type?: string;
  origin?: string | null;
}

export interface FlowGroup {
  name: string;
  doc?: string | null;
  steps: FlowStep[];
}

export interface FlowEvent {
  id: string;
  name: string;
  trigger: string;
  entry: string;
  groups: FlowGroup[];
}

/** Resultado de flows.analyze. */
export interface FlowAnalysis {
  page: string;
  kind: 'webforms' | 'mvc';
  codeFile: string | null;
  events: FlowEvent[];
  warnings: string[];
  stats: { files: number; methods: number; proxies: number; configKeys: number; ms: number };
  inventory: FlowInventory;
}

/** Fila del cuadro de insumos: un SP, DataPower o servicio al que llega un método de la página. */
export interface FlowInventoryRow {
  method: string;
  /** false: ningún evento de la página llama a este método. */
  reachable: boolean;
  lane: 'bd' | 'datapower' | 'servicio';
  /** Operación WCF de la solución por la que se llega (BussinesService.X). */
  wcf: string | null;
  name: string;
  kind: 'SP' | 'REST' | 'SOAP';
  key: string | null;
  url: string | null;
  backendClass: string | null;
  connection: string | null;
  doc: string;
}

export interface FlowInventory {
  sp: FlowInventoryRow[];
  datapower: FlowInventoryRow[];
  services: FlowInventoryRow[];
  empty: { method: string; reachable: boolean; doc: string }[];
}

export interface FlowLayoutNode {
  id: string;
  type: string;
  name: string;
  doc: string | null;
  lane: string;
  origin: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlowLayout {
  width: number;
  height: number;
  pool: { x: number; y: number; w: number; h: number; name: string; header: number };
  lanes: { id: string; name: string; x: number; y: number; w: number; h: number; header: number }[];
  nodes: FlowLayoutNode[];
  edges: {
    id: string;
    label: string | null;
    points: [number, number][];
    labelAt: [number, number];
  }[];
}

/** Diagrama de flows.build: el principal y uno por subproceso. */
export interface FlowDiagram {
  id: string;
  name: string;
  fileName: string;
  subprocess: boolean;
  xml: string;
  layout: FlowLayout;
}

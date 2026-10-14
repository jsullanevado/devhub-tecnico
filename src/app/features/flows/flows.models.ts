export type FlowLane = 'front' | 'datapower' | 'servicio' | 'bd';

export interface FlowStep {
  lane: FlowLane;
  name: string;
  doc: string;
}

export interface FlowEvent {
  id: string;
  name: string;
  trigger: string;
  entry: string;
  steps: FlowStep[];
  xml: string;
  fileName: string;
}

export interface FlowAnalysis {
  page: string;
  kind: 'webforms' | 'mvc';
  events: FlowEvent[];
  warnings: string[];
  stats: { files: number; methods: number; ms: number };
}

export interface FlowFile {
  path: string;
  file: File;
}
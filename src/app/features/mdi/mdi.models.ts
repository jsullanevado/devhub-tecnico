export interface MdiBranchList {
  local: string[];
  remote: string[];
  current: string | null;
}

export interface MdiChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  component: string | null;
  itemType: 'project' | 'compile' | 'content' | 'other' | null;
}

export interface MdiCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface MdiCompareResult {
  source: string;
  target: string;
  mergeBase: string | null;
  files: MdiChangedFile[];
  commits: MdiCommit[];
}

export interface MdiConfig {
  targetBranch: string;
  excludes: string[];
  serversBack: string;
  serversFront: string;
  author: string;
}

export interface MdiHistoryItem {
  id: string;
  app: string;
  layer: string;
  source_branch: string;
  target_branch: string;
  proyecto: string;
  file_name: string;
  created_at: string;
}

export interface MdiFields {
  PROYECTO: string;
  NOMBRE_PROYECTO: string;
  APP: string;
  NOMBRE: string;
  FECHA: string;
  OBJETIVO: string;
  MODULO: string;
  SERVIDORES_BACK: string;
  SERVIDORES_FRONT: string;
  MDU: string;
}

export interface MdiTemplateData {
  fields: MdiFields;
  back: { classes: { component: string; path: string; state: string }[]; backup: string[]; install: string[]; removals: string[] };
  front: { classes: { component: string; path: string; state: string }[]; backup: string[]; install: string[]; removals: string[] };
}
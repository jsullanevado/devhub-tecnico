import { ResourceType, Visibility } from './common.models';

/** Respuesta de la RPC dashboard_summary (migración 20261010000000). */
export interface DashboardSummary {
  /** Recursos visibles por tipo; un tipo sin recursos no aparece. */
  counts: Partial<Record<ResourceType, { total: number; mine: number }>>;
  recent: DashboardRecentItem[];
  mine_recent: DashboardRecentItem[];
  lessons: { open: number; open_critical: number; open_high: number };
  top_manuals: { id: string; title: string; download_count: number; updated_at: string }[];
  top_tags: { tag: string; count: number }[];
  storage: { used_bytes: number };
}

export interface DashboardRecentItem {
  resource_type: ResourceType;
  id: string;
  owner_id: string;
  title: string;
  visibility: Visibility;
  updated_at: string;
  author: string | null;
}

/** Cuota de Storage del plan Free de Supabase (para la barra de uso del panel). */
export const STORAGE_QUOTA_BYTES = 1024 ** 3;
/** A partir de este porcentaje la barra pasa a ámbar, y a rojo desde el siguiente. */
export const STORAGE_WARN_PERCENT = 70;
export const STORAGE_DANGER_PERCENT = 90;

export function storageUsagePercent(usedBytes: number): number {
  const percent = (Math.max(0, usedBytes) / STORAGE_QUOTA_BYTES) * 100;
  return Math.min(100, Math.round(percent * 10) / 10);
}

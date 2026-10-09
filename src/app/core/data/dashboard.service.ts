import { Injectable, inject } from '@angular/core';
import { toAppError } from '../errors/error-mapper';
import { DashboardSummary } from '../models';
import { SUPABASE } from '../supabase/supabase.client';

/** Datos del panel de inicio en una sola llamada (RPC dashboard_summary, respeta RLS). */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SUPABASE);

  async summary(): Promise<DashboardSummary> {
    const { data, error } = await this.supabase.rpc('dashboard_summary');
    if (error) {
      throw toAppError(error);
    }
    return data as unknown as DashboardSummary;
  }
}

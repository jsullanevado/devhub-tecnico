import { Injectable, inject } from '@angular/core';
import { toAppError } from '../errors/error-mapper';
import { RelationsGraph } from '../models';
import { SUPABASE } from '../supabase/supabase.client';

/**
 * Relaciones entre servicios y bases de datos, para reportes, árboles de dependencias
 * y flujos (RPC relations_graph: solo lo que el usuario puede ver, sin código ni credenciales).
 */
@Injectable({ providedIn: 'root' })
export class RelationsService {
  private readonly supabase = inject(SUPABASE);

  async graph(): Promise<RelationsGraph> {
    const { data, error } = await this.supabase.rpc('relations_graph');
    if (error) {
      throw toAppError(error);
    }
    return data as unknown as RelationsGraph;
  }
}

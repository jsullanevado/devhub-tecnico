import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { BaseResource } from '../../core/models';

/**
 * Reglas de la interfaz para mostrar u ocultar acciones. Reflejan las políticas
 * RLS (Etapa 1 y migración 20261012000000), que son las que realmente autorizan
 * cada operación.
 */
@Injectable({ providedIn: 'root' })
export class ResourcePermissions {
  private readonly auth = inject(AuthService);

  isOwner(resource: Pick<BaseResource, 'owner_id'>): boolean {
    return resource.owner_id === this.auth.userId();
  }

  /** Propietario o superadmin. */
  canEdit(resource: Pick<BaseResource, 'owner_id'>): boolean {
    return this.isOwner(resource) || this.auth.isSuperAdmin();
  }

  /** Propietario, superadmin, o administrador moderando un recurso público. */
  canDelete(resource: Pick<BaseResource, 'owner_id' | 'visibility'>): boolean {
    return (
      this.isOwner(resource) ||
      this.auth.isSuperAdmin() ||
      (resource.visibility === 'public' && this.auth.isAdmin())
    );
  }
}

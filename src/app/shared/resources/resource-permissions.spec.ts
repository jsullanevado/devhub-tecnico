import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { ResourcePermissions } from './resource-permissions';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function permissionsFor(role: 'user' | 'admin' | 'superadmin'): ResourcePermissions {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          userId: signal(ME),
          isAdmin: signal(role === 'admin'),
          isSuperAdmin: signal(role === 'superadmin'),
        },
      },
    ],
  });
  return TestBed.inject(ResourcePermissions);
}

const mine = { owner_id: ME, visibility: 'private' as const };
const othersPrivate = { owner_id: OTHER, visibility: 'private' as const };
const othersPublic = { owner_id: OTHER, visibility: 'public' as const };

describe('ResourcePermissions', () => {
  it('un usuario edita y elimina solo lo propio', () => {
    const permissions = permissionsFor('user');
    expect(permissions.canEdit(mine)).toBe(true);
    expect(permissions.canDelete(mine)).toBe(true);
    expect(permissions.canEdit(othersPublic)).toBe(false);
    expect(permissions.canDelete(othersPublic)).toBe(false);
  });

  it('un admin además elimina (no edita) recursos públicos ajenos', () => {
    const permissions = permissionsFor('admin');
    expect(permissions.canDelete(othersPublic)).toBe(true);
    expect(permissions.canDelete(othersPrivate)).toBe(false);
    expect(permissions.canEdit(othersPublic)).toBe(false);
  });

  it('un superadmin edita y elimina cualquier recurso, también los privados ajenos', () => {
    const permissions = permissionsFor('superadmin');
    expect(permissions.canEdit(othersPrivate)).toBe(true);
    expect(permissions.canDelete(othersPrivate)).toBe(true);
    expect(permissions.canEdit(othersPublic)).toBe(true);
  });
});

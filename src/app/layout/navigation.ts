import { IconName } from '../shared/ui/icon/icon';

export interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  description: string;
  /** Solo visible para administradores (la autorización real la aplica RLS). */
  adminOnly?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: readonly NavItem[];
}

/**
 * Menú lateral y accesos del panel. Para añadir un módulo: agregar aquí la
 * entrada y su ruta en app.routes.ts.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'general',
    label: 'General',
    items: [
      {
        label: 'Inicio',
        path: '/dashboard',
        icon: 'home',
        description: 'Resumen y accesos rápidos.',
      },
      {
        label: 'Favoritos',
        path: '/favorites',
        icon: 'star',
        description: 'Recursos que marcaste para tenerlos a mano.',
      },
    ],
  },
  {
    id: 'knowledge',
    label: 'Conocimiento',
    items: [
      {
        label: 'Scripts y plantillas',
        path: '/scripts',
        icon: 'code',
        description: 'Fragmentos SOAP, REST, SQL, Bash y más, listos para copiar.',
      },
      {
        label: 'Lecciones aprendidas',
        path: '/lessons',
        icon: 'lightbulb',
        description: 'Incidencias, causas raíz y soluciones documentadas.',
      },
      {
        label: 'Notas técnicas',
        path: '/notes',
        icon: 'note',
        description: 'Artículos, guías y contenido tipo wiki.',
      },
      {
        label: 'Manuales',
        path: '/manuals',
        icon: 'book',
        description: 'Documentos, manuales y arquitecturas de referencia.',
      },
      {
        label: 'Servicios',
        path: '/services',
        icon: 'plug',
        description:
          'Endpoints REST/SOAP y DataPower con headers, request, response y credenciales.',
      },
    ],
  },
  {
    id: 'utilities',
    label: 'Utilidades',
    items: [
      {
        label: 'Herramientas',
        path: '/tools',
        icon: 'wrench',
        description: 'Generadores de datos de prueba y formateadores XML/SOAP.',
      },
    ],
  },
];

export function visibleSections(isAdmin: boolean): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((section) => section.items.length > 0);
}

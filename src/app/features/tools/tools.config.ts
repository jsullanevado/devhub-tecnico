import { IconName } from '../../shared/ui/icon/icon';

export interface ToolEntry {
  path: string;
  title: string;
  description: string;
  icon: IconName;
}

/** Catálogo de herramientas. Para añadir una: entrada aquí + ruta en tools.routes.ts. */
export const TOOLS: readonly ToolEntry[] = [
  {
    path: 'peru-ids',
    title: 'DNI y RUC sintéticos',
    description: 'Genera DNI y RUC peruanos ficticios con dígito verificador válido y valida RUC.',
    icon: 'id-card',
  },
  {
    path: 'uuid',
    title: 'Generador de UUID v4',
    description: 'Genera identificadores UUID v4 aleatorios y comprueba su formato y versión.',
    icon: 'fingerprint',
  },
  {
    path: 'test-cards',
    title: 'Tarjetas de prueba',
    description: 'Números de tarjetas de sandbox de pasarelas de pago y validador Luhn.',
    icon: 'credit-card',
  },
  {
    path: 'xml',
    title: 'Formateador XML',
    description: 'Formatea, minifica y comprueba que un XML esté bien formado.',
    icon: 'file-code',
  },
  {
    path: 'soap',
    title: 'Formateador SOAP',
    description: 'Formatea y analiza sobres SOAP 1.1/1.2: operación, cabecera y Fault.',
    icon: 'code',
  },
];

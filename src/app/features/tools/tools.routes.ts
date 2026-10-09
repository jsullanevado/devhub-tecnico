import { Routes } from '@angular/router';

export const TOOLS_ROUTES: Routes = [
  {
    path: '',
    title: 'Herramientas',
    loadComponent: () => import('./tools-index.page').then((m) => m.ToolsIndexPage),
  },
  {
    path: 'peru-ids',
    title: 'DNI y RUC sintéticos',
    loadComponent: () => import('./peru-ids.tool').then((m) => m.PeruIdsTool),
  },
  {
    path: 'uuid',
    title: 'Generador de UUID',
    loadComponent: () => import('./uuid.tool').then((m) => m.UuidTool),
  },
  {
    path: 'test-cards',
    title: 'Tarjetas de prueba',
    loadComponent: () => import('./test-cards.tool').then((m) => m.TestCardsTool),
  },
  {
    path: 'xml',
    title: 'Formateador XML',
    loadComponent: () => import('./xml.tool').then((m) => m.XmlTool),
  },
  {
    path: 'soap',
    title: 'Formateador SOAP',
    loadComponent: () => import('./soap.tool').then((m) => m.SoapTool),
  },
];

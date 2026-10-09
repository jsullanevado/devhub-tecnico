// Genera los diagramas BPMN 2.0 de DevHub Técnico en docs/bpmn/ (uno por
// transacción y uno por subproceso) y su índice. Uso: npm run bpmn
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS } from './flujos.mjs';
import { buildBpmn } from './motor.mjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'bpmn');
mkdirSync(outDir, { recursive: true });

// Se eliminan los .bpmn anteriores para no dejar diagramas de flujos que ya no existen.
for (const file of readdirSync(outDir).filter((name) => name.endsWith('.bpmn'))) {
  rmSync(join(outDir, file));
}

const fileOf = new Map(FLOWS.map((flow) => [flow.id, `${flow.file}.bpmn`]));
for (const flow of FLOWS) {
  // Los subprocesos colapsados citan el archivo exacto de su detalle.
  const nodes = flow.nodes.map((node) =>
    node.type === 'subprocess'
      ? { ...node, doc: `Detalle en ${fileOf.get(node.name.split(' ')[0]) ?? node.doc}` }
      : node,
  );
  writeFileSync(join(outDir, fileOf.get(flow.id)), buildBpmn({ ...flow, nodes }), 'utf8');
}

const usedBy = (id) =>
  FLOWS.filter((flow) => flow.nodes.some((node) => node.type === 'subprocess' && node.name.startsWith(`${id} `)))
    .map((flow) => flow.id)
    .join(', ');

const rows = FLOWS.map((flow) => {
  const isSub = flow.id.startsWith('SP');
  return `| ${isSub ? '↳ ' : ''}[${flow.name}](${fileOf.get(flow.id)}) | ${isSub ? `Subproceso de ${usedBy(flow.id)}` : 'Transacción'} |`;
}).join('\n');

writeFileSync(
  join(outDir, 'README.md'),
  `# Diagramas BPMN de DevHub Técnico

Un diagrama por transacción, con tres carriles: **Front** (Angular en el navegador) ·
**Servicio** (API de Supabase: Auth, PostgREST, Storage y RPC) · **BD** (PostgreSQL: RLS,
triggers y CHECK). Las partes extensas son **subprocesos** con su propio archivo.

> Archivos generados por \`scripts/bpmn/generar-bpmn.mjs\` a partir de
> \`scripts/bpmn/flujos.mjs\`. No los edites a mano: cambia el flujo y ejecuta \`npm run bpmn\`.

## Abrirlos en Bizagi Modeler

1. *Archivo* (o el menú de Bizagi) → **Importar** → **BPMN** (*Importar desde XPDL/BPMN*).
2. Elige el archivo \`.bpmn\`. Cada archivo se importa como un diagrama con su pool y sus carriles.
3. Para enlazar un subproceso: en el diagrama principal, clic derecho sobre la caja
   **SPxx** → propiedades del subproceso → tipo **Reutilizable** → selecciona el diagrama
   del subproceso importado.

También se abren en https://demo.bpmn.io (arrastrar el archivo) o en Camunda Modeler.

## Índice

| Diagrama | Tipo |
|---|---|
${rows}

## Convenciones

- Tarea con persona = acción del usuario; engranaje = llamada a un servicio; documento = lógica en BD.
- Fin con rayo = termina en error (con el código de PostgreSQL cuando aplica: 42501 sin permisos,
  23514 dato inválido, 23503 referencia inexistente).
- Los carriles vacíos se mantienen para conservar el formato de 3 carriles en todos los diagramas.
`,
  'utf8',
);

console.log(`Generados ${FLOWS.length} diagramas en ${outDir}`);

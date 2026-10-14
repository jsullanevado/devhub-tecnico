// @ts-nocheck
// Portado de electron/flow-builder.cjs (B).

/**
 * De los pasos de un evento (analizados o editados en pantalla) al diagrama BPMN de 4
 * carriles: Front · DataPower · Servicio · BD. Los tramos largos van como subprocesos con su
 * propio diagrama. Antes se completa con lo registrado en DevHub (DataPower → servicio → SP).
 */

import { buildBpmnDocument } from './bpmn-engine';

const LANES = [
  { id: 'front', name: 'Front' },
  { id: 'datapower', name: 'DataPower' },
  { id: 'servicio', name: 'Servicio' },
  { id: 'bd', name: 'BD' },
];
const LANE_IDS = LANES.map((lane) => lane.id);
const LAYOUT = { lanes: LANES, laneHeight: 150, rowOffset: [0, 0] };

/** Un tramo con más pasos que esto va como subproceso. */
const SUBPROCESS_MIN_STEPS = 6;
/** Si el diagrama principal pasa de estos nodos, los tramos de 3+ pasos también. */
const MAIN_MAX_NODES = 16;
/** Pasos por subproceso como máximo (los tramos más largos se parten en varios). */
const SUBPROCESS_MAX_STEPS = 15;
const NAME_MAX = 70;

const TYPE_BY_LANE = { front: 'task', datapower: 'service', servicio: 'service', bd: 'script' };

// --- Cruce con DevHub ------------------------------------------------------------------------

const normalizeUrl = (url) =>
  String(url ?? '')
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');

/** Servicio de DevHub cuya URL base es el prefijo más largo de la URL del código. */
function matchService(url, graph) {
  const target = normalizeUrl(url);
  if (!target) return null;
  let best = null;
  for (const service of graph.services) {
    const base = normalizeUrl(service.base_url);
    if (
      base &&
      (target === base || target.startsWith(`${base}/`)) &&
      (!best || base.length > best.base.length)
    ) {
      best = { service, base };
    }
  }
  if (!best) return null;
  const rest = target.slice(best.base.length);
  const operation =
    best.service.operations.find(
      (op) =>
        op.path &&
        normalizeUrl(op.path) &&
        rest.endsWith(normalizeUrl(op.path).replace(/^\/+/, '')),
    ) ??
    best.service.operations.find((op) => rest.toLowerCase().includes(op.name.toLowerCase())) ??
    (best.service.operations.length === 1 ? best.service.operations[0] : null);
  return { service: best.service, operation };
}

/**
 * Completa los pasos con lo registrado en DevHub: el DataPower/servicio reconocido por su
 * URL toma su nombre y, detrás, los servicios a los que llama y sus objetos de BD.
 */
function enrichSteps(steps, graph) {
  if (!graph) return steps;
  const services = new Map(graph.services.map((service) => [service.id, service]));
  const databases = new Map(graph.databases.map((database) => [database.id, database]));
  const out = [];
  for (const step of steps) {
    const match = step.url ? matchService(step.url, graph) : null;
    if (!match) {
      out.push(step);
      continue;
    }
    const { service, operation } = match;
    out.push({
      ...step,
      lane: service.kind === 'datapower' ? 'datapower' : 'servicio',
      name: operation ? `${service.title} · ${operation.name}` : service.title,
      doc: `${step.doc} · DevHub: ${service.title}`,
      devhubId: service.id,
    });
    if (!operation) continue;
    for (const ref of operation.db_refs ?? []) out.push(dbStep(ref, databases));
    for (const target of operation.targets ?? []) {
      const next = services.get(target.service_id);
      if (!next) continue;
      const nextOp = target.operation
        ? next.operations.find((op) => op.name.toLowerCase() === target.operation.toLowerCase())
        : null;
      out.push({
        lane: next.kind === 'datapower' ? 'datapower' : 'servicio',
        type: 'service',
        name: nextOp ? `${next.title} · ${nextOp.name}` : next.title,
        doc: `Según DevHub: ${service.title} llama a ${next.title}`,
        origin: 'devhub',
        devhubId: next.id,
      });
      for (const ref of nextOp?.db_refs ?? []) out.push(dbStep(ref, databases));
    }
  }
  return out;
}

function dbStep(ref, databases) {
  const database = databases.get(ref.database_id);
  return {
    lane: 'bd',
    type: 'script',
    name: ref.member ? `${ref.object}.${ref.member}` : ref.object,
    doc: `Según DevHub${database ? ` · conexión ${database.title}` : ''}`,
    origin: 'devhub',
  };
}

// --- Diagramas ---------------------------------------------------------------------------

const clip = (text) => {
  const value = String(text ?? '').trim();
  return value.length > NAME_MAX ? `${value.slice(0, NAME_MAX - 1)}…` : value;
};

/** Diagrama lineal: inicio → pasos (cada uno en su carril) → fin. */
function linearFlow(id, name, doc, items, startName, endName = 'Fin') {
  const nodes = [{ id: 'inicio', type: 'start', lane: 'front', col: 0, name: startName }];
  items.forEach((item, i) =>
    nodes.push({
      id: `n${i + 1}`,
      type: item.type ?? TYPE_BY_LANE[item.lane] ?? 'task',
      lane: LANE_IDS.includes(item.lane) ? item.lane : 'front',
      col: i + 1,
      name: clip(item.name),
      doc: item.doc ?? undefined,
      origin: item.origin ?? null,
    }),
  );
  nodes.push({ id: 'fin', type: 'end', lane: 'front', col: items.length + 1, name: endName });
  const flows = nodes.slice(1).map((node, i) => [nodes[i].id, node.id]);
  return { id, name, doc, nodes, flows };
}

const slug = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'flujo';

/**
 * Diagramas de un evento: el principal y uno por subproceso.
 * event = { id, name, trigger, entry, groups: [{ name, doc, steps: [{ lane, name, doc, … }] }] }
 * @returns {{ id, name, fileName, subprocess: boolean, xml, layout }[]}
 */
function buildEventFlows({ title, event, graph }) {
  const groups = (event.groups ?? [])
    .map((group) => ({ ...group, steps: enrichSteps(group.steps ?? [], graph) }))
    .filter((group) => group.steps.length);
  const flowId = `F${String(event.id ?? '1').replace(/\W/g, '')}`;
  const mainName = `${title} · ${event.trigger ?? event.name}`;

  // Qué tramos van como subproceso.
  const asSub = groups.map((group) => group.steps.length >= SUBPROCESS_MIN_STEPS);
  const mainNodes = () =>
    2 + groups.reduce((sum, group, i) => sum + (asSub[i] ? 1 : 1 + group.steps.length), 0);
  const bySize = groups
    .map((group, i) => ({ i, size: group.steps.length }))
    .filter(({ i, size }) => !asSub[i] && size >= 3)
    .sort((a, b) => b.size - a.size);
  for (const { i } of bySize) {
    if (mainNodes() <= MAIN_MAX_NODES) break;
    asSub[i] = true;
  }

  const items = [];
  const subFlows = [];
  let subCount = 0;
  groups.forEach((group, i) => {
    if (asSub[i]) {
      // Un tramo muy largo se parte en varios subprocesos seguidos (máx. SUBPROCESS_MAX_STEPS).
      const parts = [];
      for (let start = 0; start < group.steps.length; start += SUBPROCESS_MAX_STEPS) {
        parts.push(group.steps.slice(start, start + SUBPROCESS_MAX_STEPS));
      }
      parts.forEach((steps, part) => {
        subCount++;
        const code = `SP${String(subCount).padStart(2, '0')}`;
        const label =
          parts.length > 1 ? `${group.name} (parte ${part + 1} de ${parts.length})` : group.name;
        const sub = linearFlow(
          `${flowId}_${code}`,
          `${code} · ${label}`,
          `Subproceso de «${mainName}». ${group.doc ?? ''}`.trim(),
          [{ lane: 'front', name: label, doc: group.doc }, ...steps],
          part === 0 ? `Desde ${event.trigger ?? event.name}` : 'Continúa del subproceso anterior',
          part === parts.length - 1 ? 'Vuelve al flujo principal' : 'Sigue en el siguiente',
        );
        subFlows.push({ code, flow: sub });
        items.push({
          lane: 'front',
          type: 'subprocess',
          name: `${code} · ${label}`,
          doc: `Detalle en el diagrama ${code} (${steps.length} pasos).`,
        });
      });
    } else {
      items.push({ lane: 'front', name: group.name, doc: group.doc }, ...group.steps);
    }
  });

  const main = linearFlow(
    flowId,
    mainName,
    `Generado por DevHub Técnico a partir de ${event.entry ?? 'el código'}. Revisar antes de usar.`,
    items,
    event.trigger ?? event.name,
  );
  const comment =
    'Generado por DevHub Técnico (Flujos BPMN) a partir del código. Borrador para revisar.';
  const render = (flow, subprocess, fileName) => {
    const { xml, layout } = buildBpmnDocument(flow, { ...LAYOUT, comment });
    return { id: flow.id, name: flow.name, fileName, subprocess, xml, layout };
  };
  const base = slug(`${title}-${event.name}`);
  return [
    render(main, false, `${base}.bpmn`),
    ...subFlows.map(({ code, flow }) => render(flow, true, `${base}-${code}.bpmn`)),
  ];
}

export { buildEventFlows, enrichSteps, matchService, LANES, SUBPROCESS_MIN_STEPS };

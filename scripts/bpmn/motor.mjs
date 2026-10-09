// Motor del generador BPMN 2.0: convierte la descripción de un flujo en un .bpmn
// con colaboración (pool), 3 carriles (Front · Servicio · BD) y coordenadas de
// diagrama (BPMNDI), de modo que Bizagi Modeler / bpmn.io lo dibujen tal cual.

export const LANES = ['front', 'servicio', 'bd'];

const LANE_NAMES = { front: 'Front', servicio: 'Servicio', bd: 'BD' };

// Geometría (px).
const POOL_X = 40;
const POOL_Y = 40;
const POOL_HEADER = 30; // franja vertical con el nombre del pool
const LANE_HEADER = 30; // franja vertical con el nombre del carril
const LANE_HEIGHT = 230;
const COL_WIDTH = 175;
const FIRST_COL_X = POOL_X + POOL_HEADER + LANE_HEADER + 40;
const ROW_OFFSET = [-38, 62]; // centro vertical de las filas 0 y 1 respecto al centro del carril

const SIZE = {
  start: [36, 36],
  end: [36, 36],
  error: [36, 36],
  message: [36, 36],
  gateway: [50, 50],
  parallel: [50, 50],
  task: [130, 72],
  user: [130, 72],
  service: [130, 72],
  script: [130, 72],
  subprocess: [130, 72],
  note: [190, 60],
};

const esc = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const nodeXml = (node) => {
  const name = `name="${esc(node.name ?? '')}"`;
  const doc = node.doc ? `\n      <bpmn:documentation>${esc(node.doc)}</bpmn:documentation>` : '';
  const flows = `${node.incoming.map((id) => `\n      <bpmn:incoming>${id}</bpmn:incoming>`).join('')}${node.outgoing.map((id) => `\n      <bpmn:outgoing>${id}</bpmn:outgoing>`).join('')}`;
  const body = (inner = '') => `${doc}${flows}${inner}\n    `;
  switch (node.type) {
    case 'start':
      return `    <bpmn:startEvent id="${node.id}" ${name}>${body()}</bpmn:startEvent>`;
    case 'end':
      return `    <bpmn:endEvent id="${node.id}" ${name}>${body()}</bpmn:endEvent>`;
    case 'error':
      return `    <bpmn:endEvent id="${node.id}" ${name}>${body(`\n      <bpmn:errorEventDefinition id="${node.id}_def" />`)}</bpmn:endEvent>`;
    case 'message':
      return `    <bpmn:intermediateCatchEvent id="${node.id}" ${name}>${body(`\n      <bpmn:messageEventDefinition id="${node.id}_def" />`)}</bpmn:intermediateCatchEvent>`;
    case 'gateway':
      return `    <bpmn:exclusiveGateway id="${node.id}" ${name}>${body()}</bpmn:exclusiveGateway>`;
    case 'parallel':
      return `    <bpmn:parallelGateway id="${node.id}" ${name}>${body()}</bpmn:parallelGateway>`;
    case 'user':
      return `    <bpmn:userTask id="${node.id}" ${name}>${body()}</bpmn:userTask>`;
    case 'service':
      return `    <bpmn:serviceTask id="${node.id}" ${name}>${body()}</bpmn:serviceTask>`;
    case 'script':
      return `    <bpmn:scriptTask id="${node.id}" ${name}>${body()}</bpmn:scriptTask>`;
    case 'subprocess':
      return `    <bpmn:subProcess id="${node.id}" ${name}>${body()}</bpmn:subProcess>`;
    default:
      return `    <bpmn:task id="${node.id}" ${name}>${body()}</bpmn:task>`;
  }
};

/** Puntos de la conexión, ortogonales, entre dos nodos ya posicionados. */
function route(source, target) {
  const s = source.box;
  const t = target.box;
  const scx = s.x + s.w / 2;
  const scy = s.y + s.h / 2;
  const tcx = t.x + t.w / 2;
  const tcy = t.y + t.h / 2;
  const isPoint = (n) => ['gateway', 'parallel'].includes(n.type);

  // Hacia atrás (bucles): se rodea por debajo de ambos nodos, sin salir del carril.
  if (tcx < scx - 5) {
    const below = Math.max(s.y + s.h, t.y + t.h) + 10;
    return [
      [scx, s.y + s.h],
      [scx, below],
      [tcx, below],
      [tcx, t.y + t.h],
    ];
  }
  // Misma columna: vertical.
  if (Math.abs(tcx - scx) <= 5) {
    return tcy > scy
      ? [
          [scx, s.y + s.h],
          [tcx, t.y],
        ]
      : [
          [scx, s.y],
          [tcx, t.y + t.h],
        ];
  }
  // Misma altura: recta.
  if (Math.abs(tcy - scy) <= 2) {
    return [
      [s.x + s.w, scy],
      [t.x, tcy],
    ];
  }
  const sameLane = source.lane === target.lane;
  // Desde una compuerta hacia la otra fila del mismo carril: sale por arriba/abajo.
  // (Hacia otro carril sale por la derecha: así no atraviesa los nodos de su columna.)
  if (isPoint(source) && sameLane) {
    return [
      [scx, tcy > scy ? s.y + s.h : s.y],
      [scx, tcy],
      [t.x, tcy],
    ];
  }
  // Hacia una compuerta del mismo carril (convergencia): entra por arriba/abajo.
  if (isPoint(target) && sameLane) {
    return [
      [s.x + s.w, scy],
      [tcx, scy],
      [tcx, tcy > scy ? t.y : t.y + t.h],
    ];
  }
  const mid = Math.round((s.x + s.w + t.x) / 2);
  return [
    [s.x + s.w, scy],
    [mid, scy],
    [mid, tcy],
    [t.x, tcy],
  ];
}

/**
 * Genera el XML BPMN de un flujo.
 * flow = { id, name, doc?, nodes: [{ id, type, name, lane, col, row?, doc? }],
 *          flows: [[from, to, label?]], notes?: [{ id, text, lane, col, row?, to }] }
 */
export function buildBpmn(flow) {
  const nodes = new Map();
  const maxCol = Math.max(...flow.nodes.map((n) => n.col), ...(flow.notes ?? []).map((n) => n.col));
  const poolWidth = FIRST_COL_X - POOL_X + (maxCol + 1) * COL_WIDTH + 20;
  const laneTop = (lane) => POOL_Y + LANES.indexOf(lane) * LANE_HEIGHT;

  const place = (item) => {
    const [w, h] = SIZE[item.type] ?? SIZE.task;
    const cx = FIRST_COL_X + item.col * COL_WIDTH + SIZE.task[0] / 2;
    const cy = laneTop(item.lane) + LANE_HEIGHT / 2 + ROW_OFFSET[item.row ?? 0];
    return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
  };

  for (const node of flow.nodes) {
    if (!LANES.includes(node.lane)) throw new Error(`${flow.id}/${node.id}: carril inválido`);
    if (nodes.has(node.id)) throw new Error(`${flow.id}: id repetido ${node.id}`);
    nodes.set(node.id, { ...node, box: place(node), incoming: [], outgoing: [] });
  }
  const notes = (flow.notes ?? []).map((note) => ({ ...note, type: 'note', box: place({ ...note, type: 'note' }) }));

  const edges = flow.flows.map(([from, to, label], index) => {
    const source = nodes.get(from);
    const target = nodes.get(to);
    if (!source || !target) throw new Error(`${flow.id}: conexión inválida ${from} → ${to}`);
    const id = `${flow.id}_f${index + 1}`;
    source.outgoing.push(id);
    target.incoming.push(id);
    return { id, source, target, label, points: route(source, target) };
  });

  const pid = `${flow.id}_proceso`;
  const lanesXml = LANES.map((lane) => {
    const refs = [...nodes.values()]
      .filter((n) => n.lane === lane)
      .map((n) => `\n          <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`)
      .join('');
    return `      <bpmn:lane id="${flow.id}_carril_${lane}" name="${LANE_NAMES[lane]}">${refs}\n      </bpmn:lane>`;
  }).join('\n');

  const flowsXml = edges
    .map(
      (e) =>
        `    <bpmn:sequenceFlow id="${e.id}" sourceRef="${e.source.id}" targetRef="${e.target.id}"${e.label ? ` name="${esc(e.label)}"` : ''} />`,
    )
    .join('\n');

  const notesXml = notes
    .map(
      (n) =>
        `    <bpmn:textAnnotation id="${n.id}">\n      <bpmn:text>${esc(n.text)}</bpmn:text>\n    </bpmn:textAnnotation>${
          n.to ? `\n    <bpmn:association id="${n.id}_asoc" sourceRef="${n.id}" targetRef="${n.to}" />` : ''
        }`,
    )
    .join('\n');

  const shape = (id, b, extra = '') =>
    `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${extra}>\n        <dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" />\n      </bpmndi:BPMNShape>`;

  const poolShape = shape(`${flow.id}_pool`, { x: POOL_X, y: POOL_Y, w: poolWidth, h: LANES.length * LANE_HEIGHT }, ' isHorizontal="true"');
  const laneShapes = LANES.map((lane) =>
    shape(
      `${flow.id}_carril_${lane}`,
      { x: POOL_X + POOL_HEADER, y: laneTop(lane), w: poolWidth - POOL_HEADER, h: LANE_HEIGHT },
      ' isHorizontal="true"',
    ),
  ).join('\n');
  const nodeShapes = [...nodes.values()]
    .map((n) => {
      const extra = n.type === 'subprocess' ? ' isExpanded="false"' : n.type === 'gateway' ? ' isMarkerVisible="true"' : '';
      return shape(n.id, n.box, extra);
    })
    .join('\n');
  const noteShapes = notes.map((n) => shape(n.id, n.box)).join('\n');
  const edgeShapes = edges
    .map((e) => {
      // Etiqueta junto al codo más cercano al destino (o en el centro si la línea es
      // recta): así las distintas salidas de una compuerta no se superponen.
      const [lx, ly] =
        e.points.length > 3
          ? e.points[2]
          : e.points.length === 3
            ? e.points[1]
            : [(e.points[0][0] + e.points[1][0]) / 2, (e.points[0][1] + e.points[1][1]) / 2];
      const label = e.label
        ? `\n        <bpmndi:BPMNLabel>\n          <dc:Bounds x="${Math.round(lx + 6)}" y="${Math.round(ly - 18)}" width="${Math.max(30, e.label.length * 6)}" height="14" />\n        </bpmndi:BPMNLabel>`
        : '';
      const points = e.points.map(([x, y]) => `\n        <di:waypoint x="${Math.round(x)}" y="${Math.round(y)}" />`).join('');
      return `      <bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">${points}${label}\n      </bpmndi:BPMNEdge>`;
    })
    .join('\n');
  const assocShapes = notes
    .filter((n) => n.to)
    .map((n) => {
      // De la nota al lado más cercano del elemento comentado.
      const target = nodes.get(n.to).box;
      const toRight = n.box.x >= target.x + target.w;
      const from = [toRight ? n.box.x : n.box.x + n.box.w / 2, toRight ? n.box.y + n.box.h / 2 : n.box.y];
      const to = toRight
        ? [target.x + target.w, target.y + target.h / 2]
        : [target.x + target.w / 2, target.y + target.h];
      return `      <bpmndi:BPMNEdge id="${n.id}_asoc_di" bpmnElement="${n.id}_asoc">\n        <di:waypoint x="${Math.round(from[0])}" y="${Math.round(from[1])}" />\n        <di:waypoint x="${Math.round(to[0])}" y="${Math.round(to[1])}" />\n      </bpmndi:BPMNEdge>`;
    })
    .join('\n');

  const doc = flow.doc ? `\n    <bpmn:documentation>${esc(flow.doc)}</bpmn:documentation>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generado por scripts/bpmn/generar-bpmn.mjs (DevHub Técnico). No editar a mano: regenerar. -->
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="${flow.id}_definiciones" targetNamespace="https://devhub-tecnico.netlify.app/bpmn"
  exporter="DevHub Técnico" exporterVersion="1.0">
  <bpmn:collaboration id="${flow.id}_colaboracion">
    <bpmn:participant id="${flow.id}_pool" name="${esc(flow.name)}" processRef="${pid}" />
  </bpmn:collaboration>
  <bpmn:process id="${pid}" name="${esc(flow.name)}" isExecutable="false">${doc}
    <bpmn:laneSet id="${flow.id}_carriles">
${lanesXml}
    </bpmn:laneSet>
${[...nodes.values()].map(nodeXml).join('\n')}
${flowsXml}
${notesXml}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="${flow.id}_diagrama" name="${esc(flow.name)}">
    <bpmndi:BPMNPlane id="${flow.id}_plano" bpmnElement="${flow.id}_colaboracion">
${poolShape}
${laneShapes}
${nodeShapes}
${noteShapes}
${edgeShapes}
${assocShapes}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

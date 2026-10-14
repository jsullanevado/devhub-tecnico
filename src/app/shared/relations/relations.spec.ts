import { RelationsGraph } from '../../core/models';
import {
  buildObjectRows,
  buildServiceTree,
  buildTraceRows,
  hasRelations,
  toCsv,
  treeToText,
} from './relations';

const DB = '00000000-0000-4000-8000-0000000000db';
const DP = '00000000-0000-4000-8000-0000000000d1';
const BACK = '00000000-0000-4000-8000-0000000000b1';

const op = (name: string, extra = {}) => ({
  name,
  method: 'POST' as const,
  path: null,
  soap_action: null,
  targets: [],
  db_refs: [],
  ...extra,
});

const GRAPH: RelationsGraph = {
  services: [
    {
      id: DP,
      title: 'svcProblem',
      protocol: 'rest',
      system: 'SIAC',
      base_url: 'http://dp',
      kind: 'datapower',
      datapower_domain: 'MIG1_postventa',
      operations: [
        op('ejecutaAccionMovil', {
          targets: [{ service_id: BACK, operation: 'ejecutarAccionMovil' }],
        }),
        op('sinNada'),
      ],
    },
    {
      id: BACK,
      title: 'claro-post-gestionUsoProhMovil',
      protocol: 'rest',
      system: null,
      base_url: 'http://back',
      kind: 'service',
      datapower_domain: null,
      operations: [
        op('ejecutarAccionMovil', {
          db_refs: [
            { database_id: DB, object: 'USRPROM.PKG_CLIENTE', member: 'SP_REGISTRAR' },
            { database_id: DB, object: 'T_CLIENTE' },
          ],
          // Llamada circular: no debe colgarse.
          targets: [{ service_id: DP }],
        }),
      ],
    },
  ],
  databases: [
    {
      id: DB,
      title: 'PROMDEV',
      engine: 'oracle',
      environment: 'dev',
      host: '172.19.32.116',
      service_name: 'ALTADEV',
      objects: [
        {
          type: 'package',
          schema: 'USRPROM',
          name: 'PKG_CLIENTE',
          description: null,
          members: ['SP_REGISTRAR', 'SP_SIN_USO'],
        },
        { type: 'table', schema: 'USRPROM', name: 'T_CLIENTE', description: null, members: [] },
      ],
    },
  ],
};

describe('relaciones', () => {
  it('el reporte por operación llega a la BD a través del servicio destino', () => {
    const rows = buildTraceRows(GRAPH).filter((row) => row.service === 'svcProblem');
    expect(
      rows.map((row) => [row.kind, row.operation, row.route, row.database, row.object, row.member]),
    ).toEqual([
      [
        'DataPower',
        'ejecutaAccionMovil',
        'claro-post-gestionUsoProhMovil · ejecutarAccionMovil',
        'PROMDEV',
        'USRPROM.PKG_CLIENTE',
        'SP_REGISTRAR',
      ],
      [
        'DataPower',
        'ejecutaAccionMovil',
        'claro-post-gestionUsoProhMovil · ejecutarAccionMovil',
        'PROMDEV',
        'T_CLIENTE',
        '',
      ],
      ['DataPower', 'sinNada', '', '', '', ''],
    ]);
    expect(rows[1].objectType).toBe('TAB');
  });

  it('el reporte por objeto incluye los SP sin uso', () => {
    const rows = buildObjectRows(GRAPH);
    expect(rows.map((row) => [row.object, row.member, row.usedBy.map((u) => u.label)])).toEqual([
      ['USRPROM.PKG_CLIENTE', '', []],
      [
        'USRPROM.PKG_CLIENTE',
        'SP_REGISTRAR',
        ['claro-post-gestionUsoProhMovil · ejecutarAccionMovil'],
      ],
      ['USRPROM.PKG_CLIENTE', 'SP_SIN_USO', []],
      ['USRPROM.T_CLIENTE', '', ['claro-post-gestionUsoProhMovil · ejecutarAccionMovil']],
    ]);
  });

  it('el árbol baja del DataPower a la BD y corta la llamada circular', () => {
    const tree = buildServiceTree(GRAPH, DP)!;
    expect(treeToText(tree)).toBe(
      [
        '[DataPower] svcProblem  (MIG1_postventa)',
        '  └ [POST] ejecutaAccionMovil',
        '    └ [REST] claro-post-gestionUsoProhMovil  (http://back)',
        '      └ [POST] ejecutarAccionMovil',
        '        └ svcProblem: llamada circular, no se repite',
        '        └ [Desarrollo] PROMDEV  (172.19.32.116 / ALTADEV)',
        '          └ [PKG] USRPROM.PKG_CLIENTE',
        '            └ [SP] SP_REGISTRAR',
        '          └ [TAB] USRPROM.T_CLIENTE',
        '  └ [POST] sinNada ⚠ sin destino',
      ].join('\n'),
    );
    expect(hasRelations(GRAPH, DP)).toBe(true);
    expect(buildServiceTree(GRAPH, 'no-existe')).toBeNull();
  });

  it('un REST que llama a dos servicios da una fila por cada ruta', () => {
    const ORQ = '00000000-0000-4000-8000-0000000000a1';
    const AUD = '00000000-0000-4000-8000-0000000000a2';
    const graph: RelationsGraph = {
      ...GRAPH,
      services: [
        ...GRAPH.services,
        {
          id: ORQ,
          title: 'orquestador',
          protocol: 'rest',
          system: null,
          base_url: 'http://o',
          kind: 'service',
          datapower_domain: null,
          operations: [
            op('procesar', {
              targets: [
                { service_id: BACK, operation: 'ejecutarAccionMovil' },
                { service_id: AUD },
              ],
            }),
          ],
        },
        {
          id: AUD,
          title: 'auditoria',
          protocol: 'soap',
          system: null,
          base_url: 'http://a',
          kind: 'service',
          datapower_domain: null,
          operations: [],
        },
      ],
    };
    const rows = buildTraceRows(graph).filter((row) => row.service === 'orquestador');
    expect(rows.map((row) => [row.route, row.object, row.targetId])).toEqual([
      ['claro-post-gestionUsoProhMovil · ejecutarAccionMovil', 'USRPROM.PKG_CLIENTE', BACK],
      ['claro-post-gestionUsoProhMovil · ejecutarAccionMovil', 'T_CLIENTE', BACK],
      // El backend de ejemplo también llama a svcProblem (sin BD propia).
      ['claro-post-gestionUsoProhMovil · ejecutarAccionMovil → svcProblem', '', BACK],
      ['auditoria', '', AUD],
    ]);
    const tree = treeToText(buildServiceTree(graph, ORQ)!);
    expect(tree).toContain('    └ [SOAP] auditoria  (http://a)');
  });

  it('el CSV usa ; y escapa comillas', () => {
    expect(toCsv(['a', 'b'], [['x;y', 'di "hola"']])).toBe('﻿a;b\r\n"x;y";"di ""hola"""');
  });
});

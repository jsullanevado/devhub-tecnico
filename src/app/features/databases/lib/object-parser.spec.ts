import { parseObjectCode } from './object-parser';

describe('parseObjectCode', () => {
  it('lee esquema, nombre y SP/funciones de un package', () => {
    const parsed = parseObjectCode(`
      CREATE OR REPLACE PACKAGE usrprom.pkg_cliente AS
        -- procedure comentado_no_cuenta
        PROCEDURE sp_registrar_cliente(p_id IN NUMBER);
        PROCEDURE sp_actualizar_estado(p_id IN NUMBER, p_estado IN VARCHAR2);
        FUNCTION fn_obtener_saldo(p_id IN NUMBER) RETURN NUMBER;
        PROCEDURE sp_registrar_cliente(p_doc IN VARCHAR2); -- sobrecarga
      END pkg_cliente;
    `);
    expect(parsed).toEqual({
      type: 'package',
      schema: 'USRPROM',
      name: 'PKG_CLIENTE',
      members: ['SP_REGISTRAR_CLIENTE', 'SP_ACTUALIZAR_ESTADO', 'FN_OBTENER_SALDO'],
    });
  });

  it('reconoce el body de un package con nombre entre comillas', () => {
    const parsed = parseObjectCode(
      'create or replace editionable package body "USRPROM"."PKG_X" is procedure p1 is begin null; end; end;',
    );
    expect(parsed.type).toBe('package');
    expect(parsed.schema).toBe('USRPROM');
    expect(parsed.name).toBe('PKG_X');
    expect(parsed.members).toEqual(['P1']);
  });

  it('una tabla no tiene miembros', () => {
    expect(parseObjectCode('CREATE TABLE T_CLIENTE (ID NUMBER)')).toEqual({
      type: 'table',
      schema: undefined,
      name: 'T_CLIENTE',
      members: [],
    });
  });

  it('sin CREATE devuelve solo los procedimientos que encuentre', () => {
    expect(parseObjectCode('PROCEDURE uno; FUNCTION dos RETURN NUMBER;')).toEqual({
      members: ['UNO', 'DOS'],
    });
  });
});

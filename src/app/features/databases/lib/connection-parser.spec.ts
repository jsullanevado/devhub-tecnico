import { parseConnectionText, sqlplusConnectString } from './connection-parser';

const TNS_WITH_CREDENTIALS = `##usr_reader/usr_reader
AUDITDEV =
  (DESCRIPTION =
    (ADDRESS_LIST =
      (ADDRESS = (PROTOCOL = TCP)(HOST = scandesa.claro.pe)(PORT = 1521))
    )
    (CONNECT_DATA =
      (SERVER = DEDICATED)
      (SERVICE_NAME = AUDITDEV)
    ))`;

describe('parseConnectionText', () => {
  it('lee una entrada de tnsnames con la línea ##usuario/contraseña', () => {
    const parsed = parseConnectionText(TNS_WITH_CREDENTIALS);
    expect(parsed).toMatchObject({
      alias: 'AUDITDEV',
      engine: 'oracle',
      host: 'scandesa.claro.pe',
      port: 1521,
      serviceName: 'AUDITDEV',
      username: 'usr_reader',
      password: 'usr_reader',
    });
    // La línea de credenciales no queda en la cadena guardada.
    expect(parsed.connectionString.startsWith('AUDITDEV =')).toBe(true);
    expect(parsed.connectionString).not.toContain('usr_reader');
  });

  it('acepta SID en lugar de SERVICE_NAME', () => {
    expect(
      parseConnectionText('X=(DESCRIPTION=(ADDRESS=(HOST=h)(PORT=1522))(CONNECT_DATA=(SID=ORCL)))'),
    ).toMatchObject({ alias: 'X', host: 'h', port: 1522, serviceName: 'ORCL' });
  });

  it('lee URLs JDBC de Oracle, SQL Server, PostgreSQL y MySQL', () => {
    expect(parseConnectionText('jdbc:oracle:thin:@//db1:1521/SRV')).toMatchObject({
      engine: 'oracle',
      host: 'db1',
      port: 1521,
      serviceName: 'SRV',
    });
    expect(parseConnectionText('jdbc:oracle:thin:@db1:1521:ORCL')).toMatchObject({
      serviceName: 'ORCL',
    });
    expect(
      parseConnectionText('jdbc:sqlserver://sql01:1433;databaseName=Ventas;encrypt=true'),
    ).toMatchObject({ engine: 'sqlserver', host: 'sql01', port: 1433, serviceName: 'Ventas' });
    expect(parseConnectionText('jdbc:postgresql://pg:5432/app')).toMatchObject({
      engine: 'postgresql',
      serviceName: 'app',
    });
    expect(parseConnectionText('jdbc:mysql://my:3306/shop?ssl=true')).toMatchObject({
      engine: 'mysql',
      serviceName: 'shop',
    });
  });

  it('lee EZConnect y usuario/contraseña@destino', () => {
    expect(parseConnectionText('scott/tiger@//db2:1521/QA')).toMatchObject({
      username: 'scott',
      password: 'tiger',
      host: 'db2',
      port: 1521,
      serviceName: 'QA',
      connectionString: '//db2:1521/QA',
    });
  });

  it('con un texto desconocido solo conserva la cadena', () => {
    expect(parseConnectionText('  algo raro  ')).toEqual({ connectionString: 'algo raro' });
  });
});

describe('sqlplusConnectString', () => {
  it('arma usuario/clave@//host:puerto/servicio si hay datos suficientes', () => {
    const base = { username: 'u', password: 'p', host: 'h', port: 1521, service_name: 'S' };
    expect(sqlplusConnectString(base)).toBe('u/p@//h:1521/S');
    expect(sqlplusConnectString({ ...base, port: null })).toBe('u/p@//h:1521/S');
    expect(sqlplusConnectString({ ...base, password: null })).toBeNull();
  });
});

// @ts-nocheck
// Portado de electron/flow-analyzer.cjs (B): el sistema de archivos es un Vfs en memoria.

/**
 * Análisis estático de una aplicación .NET (sin ejecutarla ni compilarla) para levantar el
 * flujo de una página: Front (.aspx WebForms o .cshtml MVC) → DataPower → Servicio → BD.
 *
 * 1. Índice de la solución: métodos de cada .vb/.cs (con su cuerpo), clases proxy de
 *    Web/Service References, constantes y claves de Web.config.
 * 2. Eventos de la página: controles con OnClick/Handles y Page_Load (WebForms), o las
 *    acciones que llama la vista por Ajax/formularios (MVC).
 * 3. Desde cada evento se siguen las llamadas por las capas (Negocios, Datos…) y se marcan:
 *      RestServiceDP.*("clave")        → DataPower (URL de la clave en Web.config)
 *      RestService.*, HttpClient, WebRequest → Servicio REST
 *      proxy de Web Reference / WCF    → Servicio SOAP
 *      .Command = …, Execute*(…), "PKG_X.SP_Y" → BD (package y SP)
 * Todo es heurístico: el resultado es un borrador para revisar.
 */

import { path, Vfs } from './vfs';

// El Vfs del repositorio actual (se fija con setVfs antes de analizar).
let vfs = new Vfs();
export function setVfs(next) {
  vfs = next;
  cache.clear();
}
const fs = {
  existsSync: (file) => vfs.existsSync(file),
  readdirSync: (dir) => vfs.readdirSync(dir),
  statSync: (file) => ({ size: vfs.statSize(file) }),
};

const SKIP_DIRS = new Set([
  'bin',
  'obj',
  'packages',
  'node_modules',
  '.git',
  '.vs',
  'testresults',
  '.svn',
  'debug',
  'release',
]);
const CODE_EXT = new Set(['.vb', '.cs']);
const MAX_CODE_BYTES = 3 * 1024 * 1024;
const MAX_DEPTH = 8;
const MAX_METHODS_PER_EVENT = 500;
const MAX_STEPS_PER_EVENT = 80;
const INDEX_TTL_MS = 2 * 60 * 1000;

/** Llamadas que nunca son de la aplicación (ahorra búsquedas en el índice). */
const IGNORED_CALLS = new Set(
  [
    'if',
    'for',
    'foreach',
    'while',
    'switch',
    'using',
    'catch',
    'lock',
    'return',
    'new',
    'typeof',
    'nameof',
    'sizeof',
    'ctype',
    'directcast',
    'trycast',
    'cint',
    'cstr',
    'cdbl',
    'cbool',
    'cdate',
    'cdec',
    'clng',
    'not',
    'and',
    'or',
    'tostring',
    'trim',
    'substring',
    'replace',
    'split',
    'format',
    'equals',
    'add',
    'remove',
    'contains',
    'indexof',
    'length',
    'count',
    'parse',
    'tryparse',
    'convert',
    'toupper',
    'tolower',
    'isnullorempty',
    'isnothing',
    'info',
    'debug',
    'error',
    'warn',
    'infoformat',
    'debugformat',
    'errorformat',
    'write',
    'writeline',
    'redirect',
    'getvalue',
    'item',
    'clear',
    'append',
    'join',
    'any',
    'where',
    'select',
    'first',
    'firstordefault',
    'tolist',
    'toarray',
    'orderby',
    'sum',
    'max',
    'min',
    'getlogger',
    'base',
    'mybase',
    'me',
    'this',
    'json',
    'view',
    'partialview',
    'content',
    'redirecttoaction',
  ].map((name) => name.toLowerCase()),
);

// --- Utilidades de texto ---------------------------------------------------------------

function readText(file) {
  return vfs.readText(file);
}

const lineCache = new Map();
/** Línea (1…) de un desplazamiento; los saltos de cada texto se calculan una sola vez. */
function lineOf(text, offset) {
  let starts = lineCache.get(text);
  if (!starts) {
    starts = [0];
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    if (lineCache.size > 4000) lineCache.clear();
    lineCache.set(text, starts);
  }
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Quita comentarios (y opcionalmente literales) para buscar llamadas sin falsos positivos. */
function stripComments(code, lang) {
  if (lang === 'vb') {
    // Comentarios VB: ' fuera de cadenas, hasta fin de línea.
    return code
      .split('\n')
      .map((line) => {
        let inString = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') inString = !inString;
          else if (ch === "'" && !inString) return line.slice(0, i);
        }
        return line;
      })
      .join('\n');
  }
  let out = '';
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') out += '\n';
        i++;
      }
      i++;
    } else if (ch === '"' || ch === "'") {
      // Cadenas y caracteres se copian tal cual (con sus escapes).
      const quote = ch;
      const verbatim = code[i - 1] === '@';
      out += ch;
      i++;
      while (i < code.length) {
        if (!verbatim && code[i] === '\\') {
          out += code[i] + (code[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          if (verbatim && code[i + 1] === quote) {
            out += quote + quote;
            i += 2;
            continue;
          }
          break;
        }
        out += code[i];
        i++;
      }
      out += quote;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Fin del bloque { … } que empieza en `open` (índice de la llave). */
function matchBrace(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const verbatim = code[i - 1] === '@';
      i++;
      while (i < code.length && code[i] !== quote) {
        if (!verbatim && code[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return code.length - 1;
}

const STRING_LITERAL = /"((?:[^"\\]|\\.|"")*)"/g;

// --- Índice de la solución ---------------------------------------------------------------

function walk(root, onFile) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) stack.push(full);
      } else if (entry.isFile()) {
        onFile(full, entry.name);
      }
    }
  }
}

const isProxyFile = (file) =>
  /[\\/](web references|service references|connected services)[\\/]/i.test(file) ||
  /[\\/]reference\.(cs|vb)$/i.test(file);

const VB_METHOD =
  /^[ \t]*(?:<[^>\n]*>[ \t_]*\n?[ \t]*)?(?:(?:Public|Private|Protected|Friend|Shared|Overridable|Overrides|Overloads|Shadows|Async|NotOverridable|Static|Partial|Iterator)[ \t]+)*(Function|Sub)[ \t]+(\w+)/gim;
const VB_END = /^[ \t]*End[ \t]+(Function|Sub)\b/gim;
const VB_TYPE =
  /^[ \t]*(?:(?:Public|Private|Protected|Friend|Partial|MustInherit|NotInheritable|Shadows)[ \t]+)*(Class|Module|Structure)[ \t]+(\w+)/gim;
const CS_METHOD =
  /^[ \t]*(?:\[[^\]\n]*\][ \t]*\n?[ \t]*)*(?:(?:public|private|protected|internal|static|virtual|override|async|sealed|new|extern|partial|unsafe)[ \t]+)+(?:[\w.]+(?:<[^>\n]*>)?(?:\[\])?\??[ \t]+)(\w+)[ \t]*(?:<[^>\n]*>)?[ \t]*\(/gm;
const CS_TYPE = /\b(?:class|struct|interface)\s+(\w+)/g;

function indexVb(file, text, index) {
  const code = stripComments(text, 'vb');
  const types = [...code.matchAll(VB_TYPE)].map((m) => ({ at: m.index, name: m[2] }));
  const ends = [...code.matchAll(VB_END)].map((m) => ({ at: m.index, kind: m[1].toLowerCase() }));
  for (const m of code.matchAll(VB_METHOD)) {
    const line = code.slice(m.index, code.indexOf('\n', m.index) + 1 || code.length);
    if (/\bMustOverride\b|\bDeclare\b/i.test(line)) continue;
    const kind = m[1].toLowerCase();
    const end = ends.find((e) => e.at > m.index && e.kind === kind);
    if (!end) continue;
    const owner = [...types].reverse().find((t) => t.at < m.index)?.name ?? path.basename(file);
    addMethod(index, {
      name: m[2],
      cls: owner,
      file,
      lang: 'vb',
      start: m.index,
      line: lineOf(code, m.index),
      header: line,
      body: code.slice(m.index, end.at),
    });
  }
}

function indexCs(file, text, index) {
  const code = stripComments(text, 'cs');
  const types = [...code.matchAll(CS_TYPE)].map((m) => ({ at: m.index, name: m[1] }));
  for (const m of code.matchAll(CS_METHOD)) {
    const name = m[1];
    // Busca la llave de apertura (o "=>") tras los parámetros; ";" = sin cuerpo.
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') depth--;
      i++;
    }
    const rest = code.slice(i, i + 400);
    const brace = rest.search(/[{;]|=>/);
    if (brace < 0 || rest[brace] === ';') continue;
    let bodyEnd;
    if (rest.startsWith('=>', brace)) {
      bodyEnd = code.indexOf(';', i + brace);
    } else {
      bodyEnd = matchBrace(code, i + brace);
    }
    const owner = [...types].reverse().find((t) => t.at < m.index)?.name ?? path.basename(file);
    addMethod(index, {
      name,
      cls: owner,
      file,
      lang: 'cs',
      start: m.index,
      line: lineOf(code, m.index),
      header: code.slice(m.index, i),
      body: code.slice(m.index, bodyEnd + 1),
    });
  }
}

function addMethod(index, method) {
  const key = method.name.toLowerCase();
  if (!index.methods.has(key)) index.methods.set(key, []);
  index.methods.get(key).push(method);
  if (!index.byFile.has(method.file)) index.byFile.set(method.file, []);
  index.byFile.get(method.file).push(method);
}

/** Clases proxy (SoapHttpClientProtocol, ClientBase<…>) de Web/Service References. */
function indexProxies(file, text, index) {
  const service = path.basename(path.dirname(file));
  for (const m of text.matchAll(
    /(?:class\s+(\w+)\s*:\s*[\w.]*(?:SoapHttpClientProtocol|ClientBase<[^>]+>|SoapHttpClientProtocolEx|WebClientProtocol)|Class\s+(\w+)\s*\r?\n\s*Inherits\s+[\w.]*(?:SoapHttpClientProtocol|ClientBase\(Of))/g,
  )) {
    const name = m[1] ?? m[2];
    const url = /this\.Url\s*=\s*"([^"]+)"|Me\.Url\s*=\s*"([^"]+)"/.exec(text);
    index.proxies.set(name.toLowerCase(), {
      name,
      service,
      file,
      url: url ? (url[1] ?? url[2]) : null,
    });
  }
}

/** Constantes y asignaciones a variables (para resolver nombres de package y claves). */
function indexConstants(text, index) {
  for (const m of text.matchAll(
    /^[ \t]*(?:(?:public|private|protected|internal|static|readonly|const|Public|Private|Protected|Friend|Shared|ReadOnly|Const|Dim)[ \t]+)*(?:string[ \t]+|String[ \t]+)?(_?[A-Za-z]\w*)(?:[ \t]+As[ \t]+String)?[ \t]*=[ \t]*([^;\r\n]+)/gm,
  )) {
    if (!/["']/.test(m[2]) && !/^\s*[A-Za-z_][\w.]*\s*[+&]/.test(m[2])) continue;
    const key = m[1].toLowerCase();
    if (!index.constants.has(key)) index.constants.set(key, []);
    index.constants.get(key).push(m[2].trim());
  }
}

/** Claves de <appSettings> y endpoints de <client> de todos los .config. */
function indexConfig(file, text, index) {
  for (const m of text.matchAll(/<add\s+key\s*=\s*"([^"]+)"\s+value\s*=\s*"([^"]*)"/gi)) {
    if (!index.config.has(m[1])) index.config.set(m[1], m[2]);
  }
  for (const m of text.matchAll(/<add\s+value\s*=\s*"([^"]*)"\s+key\s*=\s*"([^"]+)"/gi)) {
    if (!index.config.has(m[2])) index.config.set(m[2], m[1]);
  }
  for (const m of text.matchAll(/<endpoint\b[^>]*>/gi)) {
    const address = /address\s*=\s*"([^"]+)"/i.exec(m[0])?.[1];
    const contract = /contract\s*=\s*"([^"]+)"/i.exec(m[0])?.[1];
    if (address && contract) {
      const service = contract.split('.')[0].toLowerCase();
      if (!index.endpoints.has(service)) index.endpoints.set(service, address);
    }
  }
}

const cache = new Map();

function buildIndex(root) {
  const cached = cache.get(root);
  if (cached && Date.now() - cached.at < INDEX_TTL_MS) {
    return cached.index;
  }
  const index = {
    root,
    methods: new Map(),
    byFile: new Map(),
    proxies: new Map(),
    constants: new Map(),
    config: new Map(),
    endpoints: new Map(),
    perFile: new Map(),
    scripts: new Map(),
    scans: new Map(),
    files: 0,
    texts: new Map(),
  };
  const configs = [];
  walk(root, (file, name) => {
    const ext = path.extname(name).toLowerCase();
    if (ext === '.config' && !/\.dll\.config$/i.test(name)) {
      configs.push(file);
      return;
    }
    if (ext === '.js') {
      // Scripts de las vistas MVC (por nombre, el primero que aparezca).
      if (!index.scripts.has(name.toLowerCase())) index.scripts.set(name.toLowerCase(), file);
      return;
    }
    if (!CODE_EXT.has(ext)) return;
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      return;
    }
    if (size > MAX_CODE_BYTES) return;
    const text = readText(file);
    index.files++;
    if (isProxyFile(file)) {
      indexProxies(file, text, index);
      return;
    }
    index.texts.set(file, text);
    indexConstants(text, index);
    if (ext === '.vb') indexVb(file, text, index);
    else indexCs(file, text, index);
  });
  // Web.config primero (los de la web suelen tener las claves usadas por la página).
  configs.sort((a, b) => Number(/web\.config$/i.test(b)) - Number(/web\.config$/i.test(a)));
  for (const file of configs) {
    try {
      indexConfig(file, readText(file), index);
    } catch {
      // Un .config ilegible no detiene el análisis.
    }
  }
  cache.set(root, { at: Date.now(), index });
  return index;
}

// --- Resolución de valores ---------------------------------------------------------------

/** Evalúa una expresión de concatenación de literales y constantes ("PKG" + "." + X). */
function evaluate(expr, index, depth = 0) {
  if (depth > 4) return '';
  return expr
    .split(/\s*[+&]\s*/)
    .map((part) => {
      const literal = /^\s*@?"((?:[^"\\]|\\.|"")*)"\s*$/.exec(part);
      if (literal) return literal[1].replace(/""/g, '"');
      const appSetting = /AppSettings\s*[[(]\s*"([^"]+)"/.exec(part);
      if (appSetting) return index.config.get(appSetting[1]) ?? `{${appSetting[1]}}`;
      const ident = /([A-Za-z_]\w*)\s*(?:\(\s*\))?\s*$/.exec(part.trim());
      if (!ident) return '';
      const candidates = [
        ...(index.constants.get(ident[1].toLowerCase()) ?? []),
        ...(index.constants.get(`_${ident[1].toLowerCase()}`) ?? []),
      ];
      for (const candidate of candidates) {
        const value = evaluate(candidate, index, depth + 1);
        if (value) return value;
      }
      return '';
    })
    .join('');
}

/** "esquema.PKG_X" + ".SP_Y" → "PKG_X.SP_Y" (sin esquema desconocido ni puntos sobrantes). */
function cleanDbName(value) {
  return value
    .replace(/\{[^}]*\}/g, '')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.')
    .trim();
}

const looksLikeSp = (value) =>
  /^[A-Za-z_][\w$#]*(\.[A-Za-z_][\w$#]*){0,2}$/.test(value) &&
  /(^|\.)(PKG|PCK|PQ|PK)_|(^|\.)(SP|USP|SSAPS[SU]|SIACS[SU]|SF|FN)_/i.test(value) &&
  // Nombres de parámetros (P_TELEFONO, V_CURSOR…), no procedimientos.
  !/^(P|V|N|PI|PO|IN|OUT|K|C)_/i.test(value);

// --- Detección en el cuerpo de un método -------------------------------------------------

const httpVerb = (name) =>
  /post/i.test(name) ? 'POST' : /put/i.test(name) ? 'PUT' : /delete/i.test(name) ? 'DELETE' : 'GET';

/** Tipo de cada variable que es un proxy SOAP/WCF, en todo el archivo (campos y locales). */
function proxyVariables(text, index) {
  const vars = new Map();
  const add = (name, type) => {
    const short = type.split('.').pop().toLowerCase();
    if (index.proxies.has(short)) vars.set(name.toLowerCase(), index.proxies.get(short));
  };
  for (const m of text.matchAll(/(\w+)\s*=\s*new\s+([\w.]+)\s*\(/g)) add(m[1], m[2]);
  for (const m of text.matchAll(/(?:var|[\w.]+)\s+(\w+)\s*=\s*new\s+([\w.]+)\s*\(/g))
    add(m[1], m[2]);
  for (const m of text.matchAll(/(\w+)\s+As\s+New\s+([\w.]+)/gi)) add(m[1], m[2]);
  for (const m of text.matchAll(/(\w+)\s+As\s+[\w.]+\s*=\s*New\s+([\w.]+)/gi)) add(m[1], m[2]);
  for (const m of text.matchAll(/(\w+)\s*=\s*New\s+([\w.]+)/gi)) add(m[1], m[2]);
  return vars;
}

/** Claves de URL asignadas a cada proxy: proxy.Url = AppSettings["clave"]. */
function proxyUrls(text) {
  const urls = new Map();
  for (const m of text.matchAll(/(\w+)\.Url\s*=\s*[^;\r\n]*AppSettings\s*[[(]\s*"([^"]+)"/g)) {
    urls.set(m[1].toLowerCase(), m[2]);
  }
  return urls;
}

/**
 * Hitos de integración y llamadas de un método, en orden de aparición:
 * { at, kind: 'call' | 'step', … }.
 */
function scanMethod(method, index) {
  // Un mismo método se recorre desde muchos eventos: se analiza una vez.
  const cacheKey = `${method.file}#${method.start}`;
  const cached = index.scans.get(cacheKey);
  if (cached) return cached;
  const result = scanMethodUncached(method, index);
  index.scans.set(cacheKey, result);
  return result;
}

function scanMethodUncached(method, index) {
  const body = method.body;
  const fileText = index.texts.get(method.file) ?? '';
  const items = [];
  const where = (offset) =>
    `${path.relative(index.root, method.file)}:${method.line + lineOf(body, offset) - 1}`;

  // DataPower y REST por los helpers RestServiceDP / RestService.
  for (const m of body.matchAll(
    /\b(RestServiceDP|RestService)\s*\.\s*(\w+)\s*(?:<[^()]*?>)?\s*\(\s*"([^"]+)"/g,
  )) {
    const dataPower = m[1] === 'RestServiceDP';
    const url = index.config.get(m[3]) ?? null;
    items.push({
      at: m.index,
      kind: 'step',
      step: {
        lane: dataPower ? 'datapower' : 'servicio',
        type: 'service',
        name: `${httpVerb(m[2])} ${shortUrl(url) ?? m[3]}`,
        doc: `${m[1]}.${m[2]} · clave ${m[3]}${url ? ` = ${url}` : ''} · ${where(m.index)}`,
        url,
        key: m[3],
        method: httpVerb(m[2]),
      },
    });
  }
  // HttpClient / WebRequest con una URL de configuración.
  for (const m of body.matchAll(
    /\b(?:WebRequest\.Create|HttpWebRequest|GetAsync|PostAsync|PutAsync|DeleteAsync|SendAsync|UploadString|DownloadString)\b[^;\r\n]*?AppSettings\s*[[(]\s*"([^"]+)"/g,
  )) {
    const url = index.config.get(m[1]) ?? null;
    items.push({
      at: m.index,
      kind: 'step',
      step: {
        lane: 'servicio',
        type: 'service',
        name: `REST ${shortUrl(url) ?? m[1]}`,
        doc: `HTTP · clave ${m[1]}${url ? ` = ${url}` : ''} · ${where(m.index)}`,
        url,
        key: m[1],
      },
    });
  }
  // Proxies SOAP/WCF: variable.Operacion(…).
  let perFile = index.perFile.get(method.file);
  if (!perFile) {
    perFile = { vars: proxyVariables(fileText, index), urlKeys: proxyUrls(fileText) };
    index.perFile.set(method.file, perFile);
  }
  const { vars, urlKeys } = perFile;
  if (vars.size) {
    for (const m of body.matchAll(/\b(\w+)\s*\.\s*(\w+)\s*\(/g)) {
      const proxy = vars.get(m[1].toLowerCase());
      if (
        !proxy ||
        /^(Dispose|Abort|Close|Open|BeginInvoke|EndInvoke|ToString|GetType)$/i.test(m[2])
      ) {
        continue;
      }
      const operation = m[2].replace(/Async$/, '');
      const key = urlKeys.get(m[1].toLowerCase());
      const url =
        (key ? index.config.get(key) : null) ??
        index.endpoints.get(proxy.service.toLowerCase()) ??
        proxy.url;
      items.push({
        at: m.index,
        kind: 'step',
        step: {
          lane: 'servicio',
          type: 'service',
          name: `${proxy.service}.${operation}`,
          doc: `SOAP/WCF ${proxy.name}.${operation}${url ? ` · ${url}` : ''}${key ? ` · clave ${key}` : ''} · ${where(m.index)}`,
          url,
          key: key ?? null,
          operation,
          proxy: proxy.service,
        },
        // Si la implementación del servicio está en la solución, se sigue también.
        follow: { name: operation, hint: proxy.service.replace(/(Service|WS|Client)$/i, '') },
      });
    }
  }
  // BD: comando de un SP (DAAB/ADO) o literal con forma de package.SP.
  const seenDb = new Set();
  // Conexión de la BD: new SIACCDatos(BaseDatos.BD_SIAC) → "BD_SIAC" → "SIAC".
  const bdName = /\b(BD_\w+)\b/.exec(body)?.[1];
  const connection = bdName
    ? (evaluate(bdName, index) || bdName).replace(/^BD_/i, '').replace(/\W+/g, '') || null
    : null;
  const pushDb = (at, raw, how) => {
    const value = cleanDbName(raw);
    if (!value || seenDb.has(value.toUpperCase())) return;
    const sql = /^\s*(select|insert|update|delete|merge|begin|exec)\b/i.test(value);
    if (!sql && !/^[\w$#.]+$/.test(value)) return;
    seenDb.add(value.toUpperCase());
    items.push({
      at,
      kind: 'step',
      step: {
        lane: 'bd',
        type: 'script',
        name: sql ? `SQL ${value.slice(0, 50)}` : value,
        doc: `${how} · ${where(at)}`,
        object: sql ? null : value,
        connection,
      },
    });
  };
  for (const m of body.matchAll(/\.\s*Command(?:Text)?\s*=\s*([^;\r\n]+)/g)) {
    pushDb(m.index, evaluate(m[1], index), 'Command');
  }
  for (const m of body.matchAll(
    /\b(?:GetStoredProcCommand|ExecuteReader|ExecuteNonQuery|ExecuteScalar|ExecuteDataSet|ExecuteDataset|ExecuteDataTable|OracleCommand|SqlCommand|ExecuteProcedure|EjecutarSP)\s*\(\s*([^,)\r\n]+)/g,
  )) {
    const value = evaluate(m[1], index);
    if (looksLikeSp(cleanDbName(value)) || /"/.test(m[1])) pushDb(m.index, value, 'Ejecución');
  }
  for (const m of body.matchAll(STRING_LITERAL)) {
    if (looksLikeSp(m[1])) pushDb(m.index, m[1], 'Literal');
  }

  // Llamadas a otros métodos de la solución.
  for (const m of body.matchAll(
    /(?:\b([A-Za-z_]\w*)\s*\.\s*)?\b([A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*\(/g,
  )) {
    if (m.index === 0) continue; // la propia declaración
    const name = m[2];
    if (IGNORED_CALLS.has(name.toLowerCase())) continue;
    if (vars.has((m[1] ?? '').toLowerCase())) continue; // ya es una operación de proxy
    if (
      /^(RestServiceDP|RestService|ConfigurationManager|ConfigurationSettings|log|Log|logger|Logger|Logging|String|string|Convert|Math|DateTime|Guid|Enumerable|Response|Request|Session|Server|Page|ViewState|Context|HttpContext|Json|JsonConvert)$/.test(
        m[1] ?? '',
      )
    ) {
      continue;
    }
    if (!index.methods.has(name.toLowerCase())) continue;
    items.push({ at: m.index, kind: 'call', qualifier: m[1] ?? null, name });
  }
  return items.sort((a, b) => a.at - b.at);
}

/**
 * Un paso de integración y, si es una operación WCF cuya implementación está en la
 * solución, lo que hace esa implementación (con `via` = la operación).
 */
function collectStep(item, method, index, collect, depth = 0, via = null) {
  const step = { ...item.step, cls: method.cls, via };
  const targets = item.follow
    ? resolveCall(
        { qualifier: item.follow.hint, name: item.follow.name, service: true },
        method,
        index,
      )
    : [];
  if (!targets.length) return [step];
  step.followed = true;
  return [step, ...targets.flatMap((target) => collect(target, depth + 1, via ?? step.name))];
}

/**
 * Recolector de pasos desde un método, siguiendo las llamadas. Cada paso lleva:
 *   cls      clase donde está la llamada (p. ej. la clase "backend" de un DataPower)
 *   via      operación WCF de la solución por la que se llegó (BussinesService.X)
 *   followed true si el paso es una operación WCF cuya implementación se siguió
 * Con stopFile no entra en otros métodos de ese archivo (cada método de la página es su fila).
 */
function makeCollector(index, { stopFile = null } = {}) {
  const visited = new Set();
  let budget = MAX_METHODS_PER_EVENT;
  const collect = (method, depth, via = null) => {
    const key = `${method.file}#${method.start}`;
    if (visited.has(key) || depth > MAX_DEPTH || budget-- <= 0) return [];
    visited.add(key);
    const steps = [];
    for (const item of scanMethod(method, index)) {
      if (item.kind === 'step') {
        steps.push(...collectStep(item, method, index, collect, depth, via));
        continue;
      }
      for (const target of resolveCall(item, method, index)) {
        if (stopFile && target.file === stopFile) continue;
        steps.push(...collect(target, depth + 1, via));
      }
    }
    return steps;
  };
  return { collect, visited };
}

/** "oCasoNegocios" → "casonegocios" para compararlo con nombres de clase. */
const normalizeQualifier = (value) =>
  value
    .replace(/^(obj|o|m_|_|p|s|str|int)(?=[A-Z_])/, '')
    .replace(/^_+/, '')
    .toLowerCase();

function resolveCall(call, from, index) {
  const all = (index.methods.get(call.name.toLowerCase()) ?? []).filter(
    (m) => !(m.file === from.file && m.start === from.start),
  );
  if (!all.length) return [];
  if (!call.qualifier || /^(Me|this|MyBase|base)$/i.test(call.qualifier)) {
    const same = all.filter((m) => m.cls === from.cls || m.file === from.file);
    return same.length ? same.slice(0, 1) : all.length === 1 ? all : [];
  }
  const q = normalizeQualifier(call.qualifier);
  const byClass = all.filter((m) => {
    const cls = m.cls.toLowerCase();
    return cls === q || cls.includes(q) || q.includes(cls) || cls === call.qualifier.toLowerCase();
  });
  if (byClass.length) return byClass.slice(0, 2);
  if (call.service) {
    const byFile = all.filter((m) => m.file.toLowerCase().includes(call.qualifier.toLowerCase()));
    return byFile.slice(0, 1);
  }
  return all.length <= 2 ? all : [];
}

/**
 * Recorre las llamadas desde un método de entrada. Devuelve los grupos: una entrada por
 * llamada de primer nivel que acaba en algún paso de integración, con esos pasos en orden.
 */
function traceEvent(entry, index) {
  const { collect, visited } = makeCollector(index);

  visited.add(`${entry.file}#${entry.start}`);
  const groups = [];
  const direct = [];
  for (const item of scanMethod(entry, index)) {
    if (item.kind === 'step') {
      // Pasos en el propio evento (p. ej. una operación WCF llamada directamente).
      direct.push(...collectStep(item, entry, index, collect));
      continue;
    }
    for (const target of resolveCall(item, entry, index)) {
      const steps = collect(target, 1);
      if (steps.length) {
        groups.push({
          // Los métodos de la propia página van sin el nombre de su clase.
          name: target.cls === entry.cls ? target.name : `${target.cls}.${target.name}`,
          doc: `${path.relative(index.root, target.file)}:${target.line}`,
          steps: dedupe(steps),
        });
      }
    }
  }
  if (direct.length) {
    groups.unshift({
      name: entry.name,
      doc: `${path.relative(index.root, entry.file)}:${entry.line}`,
      steps: dedupe(direct),
    });
  }
  // Límite de pasos por evento (los flujos enormes se vuelven ilegibles).
  let total = 0;
  for (const group of groups) {
    group.steps = group.steps.slice(0, Math.max(0, MAX_STEPS_PER_EVENT - total));
    total += group.steps.length;
  }
  return groups.filter((group) => group.steps.length);
}

/** "BussinesServiceReference.InsertarX" → "BussinesService.InsertarX". */
const shortWcf = (name) => (name ? name.replace(/Reference(?=\.)/, '') : null);

/**
 * Cuadro de insumos de la página: por cada método del código de la página (WebForms) o
 * cada acción que usa la vista (MVC), los SP, DataPower y servicios a los que llega, con la
 * operación WCF intermedia. Marca los métodos que no se llaman desde ningún evento.
 */
function pageInventory(index, codeFile, events) {
  const entries = codeFile ? (index.byFile.get(codeFile) ?? []) : events.map((e) => e.method);
  const keyOf = (m) => `${m.file}#${m.start}`;

  // Métodos de la página alcanzables desde algún evento (llamadas dentro del mismo archivo).
  const reachable = new Set();
  const queue = events.map((e) => e.method);
  while (queue.length) {
    const method = queue.shift();
    if (reachable.has(keyOf(method))) continue;
    reachable.add(keyOf(method));
    for (const item of scanMethod(method, index)) {
      if (item.kind !== 'call') continue;
      for (const target of resolveCall(item, method, index)) {
        if (target.file === method.file) queue.push(target);
      }
    }
  }

  const rows = [];
  const empty = [];
  const seen = new Set();
  for (const method of entries) {
    const { collect } = makeCollector(index, { stopFile: codeFile });
    const finals = collect(method, 0).filter((step) => !step.followed);
    const isReachable = !codeFile || reachable.has(keyOf(method));
    if (!finals.length) {
      // Solo los que hacen algo por sí mismos: no los que solo llaman a otros métodos de la
      // página (Page_Load, Inicio…) ni el código del diseñador.
      const callsPage = scanMethod(method, index).some(
        (item) =>
          item.kind === 'call' &&
          resolveCall(item, method, index).some((target) => target.file === method.file),
      );
      if (!callsPage && !/^(InitializeComponent|Page_Init|OnInit)$/i.test(method.name)) {
        empty.push({
          method: method.name,
          reachable: isReachable,
          doc: `${path.relative(index.root, method.file)}:${method.line}`,
        });
      }
      continue;
    }
    for (const step of finals) {
      const key = `${method.name}|${step.lane}|${step.name}|${step.via ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        method: method.name,
        reachable: isReachable,
        lane: step.lane,
        wcf: shortWcf(step.via),
        name: step.name,
        kind: step.lane === 'bd' ? 'SP' : step.proxy ? 'SOAP' : 'REST',
        key: step.key ?? null,
        url: step.url ?? null,
        backendClass: step.cls ?? null,
        connection: step.connection ?? null,
        doc: step.doc,
      });
    }
  }
  return {
    sp: rows.filter((row) => row.lane === 'bd'),
    datapower: rows.filter((row) => row.lane === 'datapower'),
    services: rows.filter((row) => row.lane === 'servicio'),
    empty,
  };
}

/** Sin pasos repetidos seguidos (mismo carril y nombre). */
function dedupe(steps) {
  const seen = new Set();
  return steps.filter((step) => {
    const key = `${step.lane}|${step.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shortUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : parsed.host + parsed.pathname;
  } catch {
    return url.length > 50 ? `…${url.slice(-45)}` : url;
  }
}

// --- Páginas -------------------------------------------------------------------------------

/** Lista de páginas (.aspx, .cshtml) del repositorio, relativas a la raíz. */
function listPages(root) {
  const pages = [];
  walk(root, (file, name) => {
    if (/\.(aspx|cshtml|vbhtml)$/i.test(name) && !/^_/.test(name)) {
      pages.push(path.relative(root, file).split(path.sep).join('/'));
    }
  });
  return pages.sort((a, b) => a.localeCompare(b));
}

const CONTROL_LABELS = {
  button: 'Botón',
  linkbutton: 'Enlace',
  imagebutton: 'Botón imagen',
  dropdownlist: 'Lista',
  checkbox: 'Casilla',
  radiobutton: 'Opción',
  textbox: 'Campo',
  gridview: 'Grilla',
  datagrid: 'Grilla',
  repeater: 'Repetidor',
  radiobuttonlist: 'Opciones',
  checkboxlist: 'Casillas',
};

function webFormsEvents(pageFile, index) {
  const markup = readText(pageFile);
  const directive = /<%@\s*Page\b[^%]*%>/i.exec(markup)?.[0] ?? '';
  const declared = /(?:CodeFile|CodeBehind)\s*=\s*"([^"]+)"/i.exec(directive)?.[1];
  const candidates = [
    declared ? path.join(path.dirname(pageFile), declared) : null,
    `${pageFile}.vb`,
    `${pageFile}.cs`,
  ].filter(Boolean);
  const codeFile = candidates.find((file) => fs.existsSync(file));
  const methods = codeFile ? (index.byFile.get(codeFile) ?? []) : [];
  const byName = new Map(methods.map((m) => [m.name.toLowerCase(), m]));

  const controls = new Map();
  for (const m of markup.matchAll(/<asp:(\w+)\b([^>]*?)\/?>/gis)) {
    const attrs = m[2];
    const id = /\bID\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
    const text = /\b(?:Text|ToolTip|AlternateText|HeaderText)\s*=\s*"([^"<%]+)"/i.exec(attrs)?.[1];
    const control = { type: m[1], id, text: text?.trim() };
    if (id) controls.set(id.toLowerCase(), control);
    for (const ev of attrs.matchAll(/\bOn(\w+)\s*=\s*"([\w.]+)"/gi)) {
      if (/^Client/i.test(ev[1])) continue;
      control.handlers = [...(control.handlers ?? []), { event: ev[1], handler: ev[2] }];
    }
  }

  const events = [];
  const add = (handler, trigger) => {
    const method = byName.get(handler.toLowerCase());
    if (method && !events.some((e) => e.method === method)) events.push({ method, trigger });
  };
  const describe = (control, event) => {
    const label = CONTROL_LABELS[control.type.toLowerCase()] ?? control.type;
    const name = control.text ? `«${control.text}»` : control.id;
    return `${label} ${name}${/click|command/i.test(event) ? '' : ` (${event})`}`;
  };
  for (const control of controls.values()) {
    for (const handler of control.handlers ?? [])
      add(handler.handler, describe(control, handler.event));
  }
  // VB: Sub btnGrabar_Click(...) Handles btnGrabar.Click
  for (const method of methods) {
    const handles = /Handles\s+([\w.,\s]+)/i.exec(method.header)?.[1];
    if (!handles) continue;
    const [controlId, event = 'Click'] = handles.split(',')[0].trim().split('.');
    if (/^(Me|MyBase)$/i.test(controlId)) {
      if (/load/i.test(event)) add(method.name, 'Carga de la página');
      continue;
    }
    const control = controls.get(controlId.toLowerCase()) ?? { type: 'Control', id: controlId };
    add(method.name, describe(control, event));
  }
  if (byName.has('page_load')) add('Page_Load', 'Carga de la página');
  return {
    kind: 'webforms',
    codeFile: codeFile ? path.relative(index.root, codeFile) : null,
    codeFilePath: codeFile ?? null,
    events,
    warnings: codeFile ? [] : ['No se encontró el código de la página (.aspx.vb / .aspx.cs).'],
  };
}

function mvcEvents(pageFile, index) {
  const view = readText(pageFile);
  const parts = pageFile.split(/[\\/]/);
  const viewsAt = parts.map((p) => p.toLowerCase()).lastIndexOf('views');
  const folderController = viewsAt >= 0 ? parts[viewsAt + 1] : null;
  const viewName = path.basename(pageFile).replace(/\.\w+$/, '');

  // Scripts del propio .cshtml y los .js que referencia por <script src>.
  let sources = view;
  for (const m of view.matchAll(/<script[^>]+src\s*=\s*"([^"]+\.js)[^"]*"/gi)) {
    const base = path.basename(m[1].replace(/\?.*$/, ''));
    if (/\.min\.js$|jquery|bootstrap|angular|kendo/i.test(base)) continue;
    const found = index.scripts.get(base.toLowerCase());
    if (found) sources += `\n${readText(found)}`;
  }

  const actions = new Map();
  const addAction = (controller, action, how) => {
    if (!action || !controller) return;
    const key = `${controller}/${action}`.toLowerCase();
    if (!actions.has(key)) actions.set(key, { controller, action, how });
  };
  for (const m of sources.matchAll(
    /(?:Url\.Action|Html\.BeginForm|Ajax\.BeginForm|Html\.ActionLink)\s*\(\s*"(\w+)"(?:\s*,\s*"(\w+)")?/g,
  )) {
    addAction(m[2] ?? folderController, m[1], 'form');
  }
  for (const m of sources.matchAll(
    /(?:url|action|href)\s*[:=]\s*['"](?:~|@Url\.Content\(["']~)?\/?([\w/]+)['"]/gi,
  )) {
    const segments = m[1].split('/').filter(Boolean);
    if (segments.length >= 2)
      addAction(segments[segments.length - 2], segments[segments.length - 1], 'ajax');
  }
  for (const m of sources.matchAll(/\$\.(?:post|get|getJSON)\s*\(\s*['"]\/?([\w/]+)['"]/g)) {
    const segments = m[1].split('/').filter(Boolean);
    if (segments.length >= 2)
      addAction(segments[segments.length - 2], segments[segments.length - 1], 'ajax');
  }

  const findAction = (controller, action) => {
    const methods = index.methods.get(action.toLowerCase()) ?? [];
    return (
      methods.find((m) => m.cls.toLowerCase() === `${controller}controller`.toLowerCase()) ??
      methods.find((m) => m.cls.toLowerCase().startsWith(controller.toLowerCase()))
    );
  };
  const events = [];
  if (folderController) {
    const render = findAction(folderController, viewName);
    if (render) events.push({ method: render, trigger: `Carga de la vista ${viewName}` });
  }
  const warnings = [];
  for (const { controller, action, how } of actions.values()) {
    const method = findAction(controller, action);
    if (!method) {
      warnings.push(`No se encontró la acción ${controller}/${action} en los controladores.`);
      continue;
    }
    if (events.some((e) => e.method === method)) continue;
    events.push({
      method,
      trigger: `${how === 'ajax' ? 'Ajax' : 'Formulario'} ${controller}/${action}`,
    });
  }
  return { kind: 'mvc', codeFile: null, events, warnings };
}

/**
 * Analiza una página y devuelve sus eventos con los pasos por carril.
 * @returns {{ page, kind, codeFile, events: { id, name, trigger, entry, groups }[], warnings, stats }}
 */
function analyzePage(root, page) {
  const started = Date.now();
  const pageFile = path.resolve(root, page);
  if (!pageFile.startsWith(path.resolve(root)) || !fs.existsSync(pageFile)) {
    throw new Error('La página no existe en el repositorio.');
  }
  const index = buildIndex(path.resolve(root));
  const mvc = /\.(cshtml|vbhtml)$/i.test(pageFile);
  const found = mvc ? mvcEvents(pageFile, index) : webFormsEvents(pageFile, index);
  const events = found.events.map(({ method, trigger }, i) => ({
    id: `E${i + 1}`,
    name: method.name,
    trigger,
    entry: `${path.relative(index.root, method.file)}:${method.line}`,
    groups: traceEvent(method, index),
  }));
  const warnings = [...found.warnings];
  if (!found.events.length) {
    warnings.push(
      mvc
        ? 'No se encontraron acciones del controlador llamadas desde la vista.'
        : 'No se encontraron eventos (OnClick, Handles o Page_Load) en la página.',
    );
  }
  return {
    page,
    kind: found.kind,
    codeFile: found.codeFile,
    inventory: pageInventory(index, found.codeFilePath ?? null, found.events),
    events,
    warnings,
    stats: {
      files: index.files,
      methods: [...index.methods.values()].reduce((sum, list) => sum + list.length, 0),
      proxies: index.proxies.size,
      configKeys: index.config.size,
      ms: Date.now() - started,
    },
  };
}

export { analyzePage, listPages, evaluate, cleanDbName, looksLikeSp, buildIndex };

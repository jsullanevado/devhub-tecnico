import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { Extension } from '@codemirror/state';

/** Resaltado por lenguaje (ids de SCRIPT_LANGUAGES). Sin soporte → texto plano. */
export function languageExtension(language: string): Extension {
  switch (language) {
    case 'sql':
      return sql();
    case 'xml':
      return xml();
    case 'json':
      return json();
    case 'javascript':
      return javascript();
    case 'typescript':
      return javascript({ typescript: true });
    case 'python':
      return python();
    case 'java':
      return java();
    case 'yaml':
      return yaml();
    case 'bash':
      return StreamLanguage.define(shell);
    case 'powershell':
      return StreamLanguage.define(powerShell);
    default:
      return [];
  }
}

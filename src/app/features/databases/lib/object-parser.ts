import { DatabaseObjectType } from '../../../core/models';

export interface ParsedObject {
  type?: DatabaseObjectType;
  schema?: string;
  name?: string;
  /** Procedimientos y funciones declarados (sin repetir, en orden de aparición). */
  members: string[];
}

const IDENTIFIER = String.raw`"?[A-Za-z][\w$#]*"?`;
const CREATE = new RegExp(
  String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:(?:editionable|noneditionable)\s+)?` +
    String.raw`(package\s+body|package|procedure|function|table|view|sequence|trigger|type\s+body|type)\s+` +
    String.raw`(?:(${IDENTIFIER})\s*\.\s*)?(${IDENTIFIER})`,
  'i',
);
const MEMBER = new RegExp(String.raw`\b(?:procedure|function)\s+(${IDENTIFIER})`, 'gi');

const TYPES: Record<string, DatabaseObjectType> = {
  package: 'package',
  'package body': 'package',
  procedure: 'procedure',
  function: 'function',
  table: 'table',
  view: 'view',
  sequence: 'sequence',
  trigger: 'trigger',
  type: 'type',
  'type body': 'type',
};

const clean = (identifier: string) => identifier.replace(/"/g, '').toUpperCase();

/**
 * Lee el DDL pegado (CREATE OR REPLACE PACKAGE …, CREATE TABLE …) y devuelve tipo, esquema,
 * nombre y, en un package, sus procedimientos y funciones. Sin comentarios ni literales.
 */
export function parseObjectCode(code: string): ParsedObject {
  const text = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
  const create = CREATE.exec(text);
  const kind = create?.[1].toLowerCase().replace(/\s+/g, ' ');
  const result: ParsedObject = { members: [] };
  if (create && kind) {
    result.type = TYPES[kind];
    result.schema = create[2] ? clean(create[2]) : undefined;
    result.name = clean(create[3]);
  }
  if (result.type === 'package' || result.type === 'type' || !create) {
    const seen = new Set<string>();
    for (const match of text.matchAll(MEMBER)) {
      const member = clean(match[1]);
      if (!seen.has(member)) {
        seen.add(member);
        result.members.push(member);
      }
    }
  }
  return result;
}

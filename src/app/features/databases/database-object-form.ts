import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DATABASE_OBJECT_LIMITS, DatabaseObject, DatabaseObjectType } from '../../core/models';
import { notBlank } from '../../shared/forms/validators';

export type DatabaseObjectGroup = FormGroup<{
  type: FormControl<DatabaseObjectType>;
  schema: FormControl<string>;
  name: FormControl<string>;
  description: FormControl<string>;
  /** Un procedimiento o función por línea. */
  members: FormControl<string>;
  code: FormControl<string>;
}>;

const text = (value: string, max: number) =>
  new FormControl(value, { nonNullable: true, validators: [Validators.maxLength(max)] });

export function createObjectGroup(object: Partial<DatabaseObject> = {}): DatabaseObjectGroup {
  return new FormGroup({
    type: new FormControl<DatabaseObjectType>(object.type ?? 'package', { nonNullable: true }),
    schema: text(object.schema ?? '', DATABASE_OBJECT_LIMITS.schemaMax),
    name: new FormControl(object.name ?? '', {
      nonNullable: true,
      validators: [
        Validators.required,
        notBlank,
        Validators.maxLength(DATABASE_OBJECT_LIMITS.nameMax),
      ],
    }),
    description: text(object.description ?? '', DATABASE_OBJECT_LIMITS.descriptionMax),
    members: new FormControl((object.members ?? []).join('\n'), { nonNullable: true }),
    code: text(object.code ?? '', DATABASE_OBJECT_LIMITS.codeMax),
  });
}

/** Líneas no vacías, sin repetir y recortadas a la longitud máxima de un nombre. */
export function memberLines(value: string): string[] {
  const names = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, DATABASE_OBJECT_LIMITS.nameMax));
  return [...new Set(names)].slice(0, DATABASE_OBJECT_LIMITS.membersMax);
}

/** Valor del formulario → objeto guardado (vacíos fuera; código sin recortar). */
export function toDatabaseObject(group: DatabaseObjectGroup): DatabaseObject {
  const value = group.getRawValue();
  const members =
    value.type === 'package' || value.type === 'type' ? memberLines(value.members) : [];
  return {
    type: value.type,
    schema: value.schema.trim() || null,
    name: value.name.trim(),
    description: value.description.trim() || null,
    members,
    code: value.code.trim() ? value.code : null,
  };
}

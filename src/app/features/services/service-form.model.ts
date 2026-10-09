import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpMethod, KeyValue, SERVICE_LIMITS, ServiceOperation } from '../../core/models';
import { notBlank } from '../../shared/forms/validators';

export type PairGroup = FormGroup<{
  name: FormControl<string>;
  value: FormControl<string>;
}>;

export type OperationGroup = FormGroup<{
  name: FormControl<string>;
  method: FormControl<HttpMethod>;
  path: FormControl<string>;
  soap_action: FormControl<string>;
  media_type: FormControl<string>;
  headers: FormArray<PairGroup>;
  query_params: FormArray<PairGroup>;
  request_body: FormControl<string>;
  response_status: FormControl<number | null>;
  response_body: FormControl<string>;
  notes: FormControl<string>;
}>;

const text = (value: string, max: number) =>
  new FormControl(value, { nonNullable: true, validators: [Validators.maxLength(max)] });

export function createPairGroup(pair: Partial<KeyValue> = {}): PairGroup {
  return new FormGroup({
    name: text(pair.name ?? '', SERVICE_LIMITS.pairNameMax),
    value: text(pair.value ?? '', SERVICE_LIMITS.pairValueMax),
  });
}

export function createOperationGroup(operation: Partial<ServiceOperation> = {}): OperationGroup {
  return new FormGroup({
    name: new FormControl(operation.name ?? '', {
      nonNullable: true,
      validators: [
        Validators.required,
        notBlank,
        Validators.maxLength(SERVICE_LIMITS.operationNameMax),
      ],
    }),
    method: new FormControl<HttpMethod>(operation.method ?? 'POST', { nonNullable: true }),
    path: text(operation.path ?? '', SERVICE_LIMITS.pathMax),
    soap_action: text(operation.soap_action ?? '', SERVICE_LIMITS.soapActionMax),
    media_type: text(operation.media_type ?? '', SERVICE_LIMITS.mediaTypeMax),
    headers: new FormArray(
      (operation.headers ?? []).map((pair) => createPairGroup(pair)),
      {
        validators: [Validators.maxLength(SERVICE_LIMITS.pairsMax)],
      },
    ),
    query_params: new FormArray(
      (operation.query_params ?? []).map((pair) => createPairGroup(pair)),
      { validators: [Validators.maxLength(SERVICE_LIMITS.pairsMax)] },
    ),
    request_body: text(operation.request_body ?? '', SERVICE_LIMITS.bodyMax),
    response_status: new FormControl<number | null>(operation.response_status ?? null, {
      validators: [Validators.min(100), Validators.max(599)],
    }),
    response_body: text(operation.response_body ?? '', SERVICE_LIMITS.bodyMax),
    notes: text(operation.notes ?? '', SERVICE_LIMITS.operationNotesMax),
  });
}

const orNull = (value: string) => value.trim() || null;

function toPairs(pairs: { name: string; value: string }[]): KeyValue[] {
  return pairs
    .filter((pair) => pair.name.trim())
    .map((pair) => ({ name: pair.name.trim(), value: pair.value }));
}

/** Valor del formulario → operación guardada (vacíos fuera; bodies sin recortar). */
export function toOperation(group: OperationGroup): ServiceOperation {
  const value = group.getRawValue();
  const status = value.response_status;
  return {
    name: value.name.trim(),
    method: value.method,
    path: orNull(value.path),
    soap_action: orNull(value.soap_action),
    media_type: orNull(value.media_type),
    headers: toPairs(value.headers),
    query_params: toPairs(value.query_params),
    request_body: value.request_body.trim() ? value.request_body : null,
    response_status: typeof status === 'number' && Number.isFinite(status) ? status : null,
    response_body: value.response_body.trim() ? value.response_body : null,
    notes: orNull(value.notes),
  };
}

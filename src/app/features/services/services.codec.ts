import { SERVICE_LIMITS, SERVICE_PROTOCOLS, ServiceFilters } from '../../core/models';
import { FilterCodec, oneOf } from '../../shared/resources/list-query';

export const SERVICE_PROTOCOL_VALUES = SERVICE_PROTOCOLS.map((item) => item.value);

/** Filtros de servicios en la URL: ?protocol=soap&system=siac */
export const SERVICE_FILTER_CODEC: FilterCodec<ServiceFilters> = {
  parse: (params) => ({
    protocol: oneOf(params.get('protocol'), SERVICE_PROTOCOL_VALUES),
    system: params.get('system')?.trim().slice(0, SERVICE_LIMITS.systemMax) || undefined,
  }),
  toParams: (filters) => ({
    protocol: filters.protocol ?? null,
    system: filters.system ?? null,
  }),
};

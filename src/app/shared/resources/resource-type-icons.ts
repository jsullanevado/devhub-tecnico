import { ResourceType } from '../../core/models';
import { IconName } from '../ui/icon/icon';

/** Icono de cada tipo de recurso (menú, buscador, favoritos, panel). */
export const RESOURCE_TYPE_ICONS: Record<ResourceType, IconName> = {
  script: 'code',
  lesson: 'lightbulb',
  note: 'note',
  manual: 'book',
  service: 'plug',
};

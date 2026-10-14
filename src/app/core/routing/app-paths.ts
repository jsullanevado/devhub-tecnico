import { ResourceType } from '../models';

export const APP_PATHS = {
  home: '/dashboard',
  login: '/auth/login',
  register: '/auth/register',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
} as const;

export const RESOURCE_PATHS: Record<ResourceType, string> = {
  script: '/scripts',
  lesson: '/lessons',
  note: '/notes',
  manual: '/manuals',
  service: '/services',
  database: '/databases',
};

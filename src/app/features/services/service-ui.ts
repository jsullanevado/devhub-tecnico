import { HttpMethod } from '../../core/models';

const METHOD_CLASSES: Record<HttpMethod, string> = {
  GET: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
  POST: 'bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300',
  PUT: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  PATCH: 'bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300',
  DELETE: 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300',
  HEAD: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  OPTIONS: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

/** Colores del método HTTP (convención habitual: GET verde, POST azul, DELETE rojo…). */
export function methodBadgeClass(method: string): string {
  return METHOD_CLASSES[method as HttpMethod] ?? METHOD_CLASSES.OPTIONS;
}

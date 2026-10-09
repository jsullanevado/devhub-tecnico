export type AppErrorCode =
  | 'config'
  | 'network'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'storage'
  | 'unknown';

/**
 * Error normalizado de la aplicación. `message` siempre es apto para mostrarse
 * al usuario; el detalle técnico queda en `technicalDetail` y `cause`.
 */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly technicalDetail: string | undefined;

  constructor(
    readonly code: AppErrorCode,
    message: string,
    options: { cause?: unknown; technicalDetail?: string } = {},
  ) {
    super(message, { cause: options.cause });
    this.technicalDetail = options.technicalDetail;
  }
}

/** Forma común de los archivos de entorno (environment*.ts). */
export interface AppEnvironment {
  readonly production: boolean;
  readonly appName: string;
  readonly supabase: {
    /** URL del proyecto: https://<ref>.supabase.co */
    readonly url: string;
    /** Clave publishable (sb_publishable_...) o anon legacy. NUNCA la secret/service_role. */
    readonly publishableKey: string;
  };
  readonly storage: {
    readonly documentsBucket: string;
    /** Vigencia de las URLs firmadas de descarga/vista previa. */
    readonly signedUrlTtlSeconds: number;
  };
}

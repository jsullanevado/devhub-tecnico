export interface UuidOptions {
  uppercase: boolean;
  hyphens: boolean;
}

/** UUID v4 con `crypto.randomUUID()` (aleatorio criptográfico, RFC 9562). */
export function generateUuids(count: number, options: UuidOptions): string[] {
  return Array.from({ length: count }, () => {
    let uuid: string = crypto.randomUUID();
    if (!options.hyphens) {
      uuid = uuid.replace(/-/g, '');
    }
    return options.uppercase ? uuid.toUpperCase() : uuid;
  });
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?([0-9a-f])[0-9a-f]{3}-?([0-9a-f])[0-9a-f]{3}-?[0-9a-f]{12}$/i;

export interface UuidInfo {
  valid: boolean;
  version: number | null;
  /** RFC 4122/9562 (variante 10xx). */
  standardVariant: boolean;
}

export function inspectUuid(input: string): UuidInfo {
  const match = UUID_PATTERN.exec(input.trim());
  if (!match) {
    return { valid: false, version: null, standardVariant: false };
  }
  return {
    valid: true,
    version: Number.parseInt(match[1], 16),
    standardVariant: /[89ab]/i.test(match[2]),
  };
}

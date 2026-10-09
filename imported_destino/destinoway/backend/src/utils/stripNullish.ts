/** Recursively drops keys whose value is null/undefined so persisted documents always match the zod schema (`.optional()` rejects null). */
export function stripNullish<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripNullish(v)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== null && v !== undefined) out[k] = stripNullish(v);
    return out as T;
  }
  return value;
}

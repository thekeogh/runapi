export function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'undefined') return 'undefined';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function isJsonLike(value: unknown): boolean {
  return value !== null && (Array.isArray(value) || typeof value === 'object');
}

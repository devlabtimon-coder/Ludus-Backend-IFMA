export function parseQueryString(value: any): string | undefined {
  if (Array.isArray(value)) return String(value[0]);
  if (typeof value === 'string') return value;
  return undefined;
}

export function parseQueryArray(value: any): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return undefined;
}
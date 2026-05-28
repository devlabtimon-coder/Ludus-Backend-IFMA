// src/utils/params.ts

/**
 * Garante que um parâmetro (que pode ser string ou array) retorne sempre uma string única.
 */
export function ensureString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}
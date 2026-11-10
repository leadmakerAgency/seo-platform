/**
 * Turns free text into a safe PostgREST ilike pattern for use inside
 * `.or("name.ilike.<pattern>,...")`. Strips the characters that would break
 * the filter syntax or act as wildcards. Returns null for empty input.
 */
export function ilikePattern(input: string | null | undefined, maxLength = 80): string | null {
  const cleaned = (input ?? "")
    .slice(0, maxLength)
    .replace(/[%_*,()"'\\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned ? `*${cleaned}*` : null
}

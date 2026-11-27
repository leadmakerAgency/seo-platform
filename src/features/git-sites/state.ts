/** The GitHub install state: `<attempt id>.<64 hex key>` (pure; see connect.ts). */
export function parseState(state: string | null | undefined): { attemptId: string; key: string } | null {
  const m = /^([0-9a-f-]{36})\.([0-9a-f]{64})$/i.exec(state ?? "")
  return m ? { attemptId: m[1].toLowerCase(), key: m[2].toLowerCase() } : null
}

/** Host of a URL or bare domain, lower-case, without "www." ("https://www.Kingair.com/x" → "kingair.com"). */
export function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = value.trim().toLowerCase()
  if (!raw) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`)
    return url.hostname.replace(/^www\./, "").replace(/\.$/, "") || null
  } catch {
    return raw.replace(/^www\./, "").split("/")[0] || null
  }
}

/** True when `candidate` is the client's domain or one of its subdomains. */
export function matchesDomain(candidate: string | null | undefined, clientDomain: string | null): boolean {
  const host = normalizeHost(candidate)
  if (!host || !clientDomain) return false
  return host === clientDomain || host.endsWith(`.${clientDomain}`)
}

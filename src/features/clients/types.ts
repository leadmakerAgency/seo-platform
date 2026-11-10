import type { ClientHealth } from "./constants"

/** One row returned by GET /api/clients/search. */
export type ClientSearchResult = {
  id: string
  slug: string
  name: string
  location: string
  health: ClientHealth
}

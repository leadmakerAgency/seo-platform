import type { ClientHealth } from "./constants"

/** One row returned by GET /api/clients/search. */
export type ClientSearchResult = {
  id: string
  slug: string
  name: string
  location: string
  health: ClientHealth
}

/** A team member offered as the client's account manager. */
export type OwnerOption = { id: string; name: string }

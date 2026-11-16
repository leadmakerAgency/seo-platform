/**
 * States, provinces and territories for the countries where the team picks from a list
 * (stored as the short code: "AZ", "ON", "NSW"). Every other country uses free text.
 * Also the field labels that change by country ("State", "Province", "ZIP code"…).
 */

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
}

export const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut",
  ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
}

export const AU_STATES: Record<string, string> = {
  ACT: "Australian Capital Territory", NSW: "New South Wales", NT: "Northern Territory",
  QLD: "Queensland", SA: "South Australia", TAS: "Tasmania", VIC: "Victoria", WA: "Western Australia",
}

const LISTS: Record<string, Record<string, string>> = { US: US_STATES, CA: CA_PROVINCES, AU: AU_STATES }

/** The list to pick from for this country, or null (free text). */
export function regionList(country: string): { code: string; name: string }[] | null {
  const list = LISTS[country]
  if (!list) return null
  return Object.entries(list)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Countries whose region must be filled in (it decides the search location). */
export const regionRequired = (country: string) => country in LISTS

/** "AZ" → "Arizona" for listed countries; anything else is returned as typed. */
export function regionName(country: string, region: string | null | undefined): string | null {
  const r = region?.trim()
  if (!r) return null
  const list = LISTS[country.toUpperCase()]
  if (!list) return r
  return list[r.toUpperCase()] ?? r
}

/** "Arizona" or "az" → "AZ" for listed countries; anything else is returned trimmed. */
export function regionCode(country: string, region: string | null | undefined): string | null {
  const r = region?.trim()
  if (!r) return null
  const list = LISTS[country.toUpperCase()]
  if (!list) return r
  if (list[r.toUpperCase()]) return r.toUpperCase()
  const hit = Object.entries(list).find(([, name]) => name.toLowerCase() === r.toLowerCase())
  return hit ? hit[0] : r
}

const REGION_LABEL: Record<string, string> = {
  US: "State", AU: "State", MX: "State", BR: "State", IN: "State", MY: "State", NG: "State", DE: "State",
  CA: "Province", AR: "Province", ZA: "Province", NL: "Province", BE: "Province", ES: "Province",
  IT: "Province", PH: "Province", CN: "Province", KR: "Province", TR: "Province",
  GB: "County", IE: "County", HU: "County", RO: "County", HR: "County", NO: "County", SE: "County",
  NZ: "Region", FR: "Region", CL: "Region", PE: "Region", MK: "Municipality", CH: "Canton",
  JP: "Prefecture", AE: "Emirate",
}

export const regionLabel = (country: string) => REGION_LABEL[country] ?? "State or region"

const POSTAL_LABEL: Record<string, string> = {
  US: "ZIP code", GB: "Postcode", AU: "Postcode", NZ: "Postcode", IE: "Eircode", IN: "PIN code",
}

export const postalLabel = (country: string) => POSTAL_LABEL[country] ?? "Postal code"

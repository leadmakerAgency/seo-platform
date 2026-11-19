/**
 * Adjacent-topic ideas for the strategy brief (suggestions only; the team decides).
 * Adjacent topics are what the same buyers read about besides the client's own service:
 * blogs on those topics link out more readily than direct competitors ever will.
 */

type IdeaSet = { match: RegExp; ideas: string[] }

const SETS: IdeaSet[] = [
  { match: /\b(deck|patio|fence|landscap|lawn|garden|outdoor|pool)/, ideas: ["backyard design", "outdoor living", "home improvement", "landscaping", "real estate", "home value", "diy projects"] },
  { match: /\b(hvac|heating|cooling|air condition|duct|furnace)/, ideas: ["home energy efficiency", "indoor air quality", "home improvement", "home maintenance", "real estate", "smart home", "allergies"] },
  { match: /\b(plumb|water heater|drain|sewer)/, ideas: ["home maintenance", "home improvement", "kitchen remodeling", "bathroom remodeling", "water conservation", "real estate"] },
  { match: /\b(roof|gutter|siding|window|insulation)/, ideas: ["home improvement", "storm damage", "home insurance", "real estate", "home energy efficiency", "home maintenance"] },
  { match: /\b(remodel|renovat|contractor|construction|builder|kitchen|bath|cabinet|floor)/, ideas: ["interior design", "home improvement", "real estate", "home financing", "architecture", "diy projects"] },
  { match: /\b(clean|maid|janitor|carpet|pressure wash)/, ideas: ["home organization", "home maintenance", "property management", "real estate", "parenting", "pet care"] },
  { match: /\b(pest|termite|exterminat)/, ideas: ["home maintenance", "gardening", "property management", "real estate", "pet care"] },
  { match: /\b(electric|solar|generator)/, ideas: ["home energy efficiency", "smart home", "electric vehicles", "home improvement", "sustainability"] },
  { match: /\b(moving|mover|storage)/, ideas: ["real estate", "relocation", "home organization", "college life", "senior living"] },
  { match: /\b(insurance)/, ideas: ["personal finance", "risk management", "small business finance", "real estate", "retirement planning", "auto ownership"] },
  { match: /\b(law|legal|attorney|lawyer)/, ideas: ["personal finance", "small business", "real estate", "insurance", "family life", "workplace rights"] },
  { match: /\b(account|bookkeep|tax|cpa|payroll)/, ideas: ["small business finance", "entrepreneurship", "personal finance", "startups", "ecommerce", "real estate investing"] },
  { match: /\b(financ|wealth|invest|mortgage|loan|bank)/, ideas: ["personal finance", "real estate", "retirement planning", "small business", "entrepreneurship"] },
  { match: /\b(real estate|realtor|property|realty)/, ideas: ["home improvement", "mortgages", "interior design", "relocation", "personal finance", "local living"] },
  { match: /\b(dent|orthodont)/, ideas: ["family health", "parenting", "nutrition", "beauty and wellness", "senior health"] },
  { match: /\b(medical|clinic|doctor|health|chiropract|physio|therapy)/, ideas: ["wellness", "fitness", "nutrition", "senior health", "parenting", "mental health"] },
  { match: /\b(spa|salon|beauty|skin|aesthetic|barber)/, ideas: ["beauty and wellness", "fashion", "weddings", "self care", "lifestyle"] },
  { match: /\b(fitness|gym|yoga|personal train)/, ideas: ["nutrition", "wellness", "running", "weight loss", "mental health", "sports"] },
  { match: /\b(restaurant|cafe|bakery|catering|food|bar)/, ideas: ["food and drink", "local events", "weddings", "travel", "nightlife"] },
  { match: /\b(wedding|event|photograph|florist)/, ideas: ["weddings", "event planning", "lifestyle", "travel", "fashion"] },
  { match: /\b(auto|car|mechanic|tire|collision|detailing)/, ideas: ["car ownership", "road trips", "electric vehicles", "auto insurance", "motorsports"] },
  { match: /\b(pet|vet|grooming|dog|cat)/, ideas: ["pet care", "pet health", "parenting", "outdoor living", "local events"] },
  { match: /\b(web|software|app|saas|developer|development|no.?code|it services)/, ideas: ["startups", "saas marketing", "ux design", "product management", "small business technology", "ecommerce", "digital marketing", "entrepreneurship"] },
  { match: /\b(marketing|seo|advertis|agency|branding|design)/, ideas: ["small business marketing", "entrepreneurship", "ecommerce", "startups", "content marketing", "social media"] },
  { match: /\b(ecommerce|shop|store|retail|boutique)/, ideas: ["gift guides", "fashion", "lifestyle", "deals and savings", "product reviews"] },
  { match: /\b(school|tutor|education|course|training)/, ideas: ["parenting", "careers", "college admissions", "study tips", "personal development"] },
]

/** Ideas for this client's services and industry, minus topics already in the brief. */
export function adjacentIdeas(text: string, existing: string[] = []): string[] {
  const hay = text.toLowerCase()
  const taken = new Set(existing.map((t) => t.toLowerCase()))
  const out: string[] = []
  for (const set of SETS) {
    if (!set.match.test(hay)) continue
    for (const idea of set.ideas) if (!taken.has(idea) && !out.includes(idea)) out.push(idea)
  }
  if (out.length === 0) out.push("small business", "local living", "entrepreneurship", "customer reviews")
  return out.slice(0, 16)
}

/** A first guess at the buyer from the industry (the team confirms). */
export function guessBuyer(text: string): "b2b" | "b2c" | "both" {
  const hay = text.toLowerCase()
  if (/\b(saas|b2b|agency|consult|software|development|wholesale|manufactur|it services|payroll|marketing)/.test(hay)) return "b2b"
  if (/\b(account|law|legal|insurance|clean|print)/.test(hay)) return "both"
  return "b2c"
}

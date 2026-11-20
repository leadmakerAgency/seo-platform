/**
 * Knowledge packs for Shockwave AI Search: short, rewritten summaries of the methods in two MIT
 * projects, given to Haiku one step at a time (see ATTRIBUTION.md in this folder):
 *   - Claude SEO by AgriciDaniel (github.com/AgriciDaniel/claude-seo), MIT, © 2026 agricidaniel
 *   - marketingskills by Corey Haines (github.com/coreyhaines31/marketingskills), MIT, © 2025 Corey Haines
 * Each pack names the skills it summarises. Keep them short: Haiku follows short, specific rules best.
 */

/** Step 1. Sources: claude-seo seo-plan (discovery, industry templates), seo-local (business type, vertical). */
export const CLIENT_DISCOVERY = `How to understand a business for link building:
- What it sells, to whom, where, and what makes it different. Use the business's own words.
- Business type: "brick_and_mortar" (visible street address, visit us), "service_area" (serves areas, no public address, "we come to you"), "hybrid" (both), or "online" (no local presence).
- Vertical: restaurant, healthcare, legal, home_services, real_estate, automotive, saas, agency, ecommerce, publisher, professional_services, or other.
- Ideal buyer: who decides, what triggers a purchase, and where they research before buying (review sites, directories, communities, publications, associations).
- Brand names: every spelling people might use (with and without "Inc", spaces, abbreviations).
- Doubts: note anything unclear, or anything that conflicts with the team's brief.`

/** Step 2. Sources: claude-seo seo-cluster (intent classes), seo-sxo (reading results pages backwards). */
export const SEARCH_INTENT = `Buyer searches and results pages:
- Choose searches a buyer types before choosing a provider: commercial ("best", "top", "reviews", "near me", "vs"), transactional ("hire", "quote", "pricing"). Skip navigational (brand names) and pure how-to searches.
- Write searches in the market's language, the way locals phrase them.
- Label each result: "direct_competitor" (a business selling the same thing), "best_of_list" (roundup or ranking of providers), "directory" (listings of businesses), "review_site", "marketplace", "publisher" (news, magazine, blog), "association", "forum" (community, Q&A), "government", "client" (the client's own site), or "other".
- can_get_listed: true only if a business like the client could appear there (submit, claim, join, be reviewed, be featured, be added to a list).`

/** Steps 4 and 8. Sources: marketingskills link-building (tactics, 4 tests, risk rule); claude-seo seo-local section 6. */
export const LINK_TACTICS = `Good link and listing opportunities, best first:
1. "Best of" lists and rankings that include businesses like the client and accept nominations or yearly updates. They are also the top source AI assistants cite.
2. Partner, integration, vendor, certification and customer pages of companies the client works with.
3. Industry directories and review platforms the client's buyers actually use.
4. Associations, chambers and member directories.
5. Local press, event calendars and community sponsorships (local businesses).
6. Resource pages, podcasts and interviews, editorial contributions to real publications.
7. Pages that already mention the client without linking (ask for a link).
Every opportunity must pass four tests:
- Relevant: same or neighbouring topic, the client's buyers read it. Topic fit beats site size.
- Real: a maintained site with real content and editorial standards, not a link farm.
- Reachable: there is a way in (submission form, claim button, editor or owner contact, membership).
- Worth it: the effort and cost are reasonable for what the client gets.
Never recommend: paying for links without rel="sponsored" or rel="nofollow", private blog networks, link exchanges, "write for us" sites that sell posts, automated link building. Paid placements are allowed only when clearly labelled as paid.`

/** Step 4 (local). Sources: claude-seo local-seo-signals.md (citation tiers), local-schema-types.md (by industry). */
export const LOCAL_CITATIONS = `Local citations:
- Tier 1 for every local business: Google Business Profile, Apple Business, Bing Places, Facebook, Yelp.
- Tier 2: BBB, YellowPages, Manta, Superpages, Foursquare, Nextdoor. Data aggregators feed many others: Data Axle, Foursquare, Neustar.
- Find the city or region's own sources: chamber of commerce member directory, local business associations, city and county business listings, neighbourhood groups.
- By industry: legal (FindLaw, Avvo, Justia, Martindale, Super Lawyers, state bar), healthcare (Healthgrades, Zocdoc, WebMD, Vitals), home services (Thumbtack, BBB, Nextdoor, Houzz), real estate (Zillow, Realtor.com, Homes.com), automotive (Cars.com, CarGurus, DealerRater, Edmunds), restaurants (TripAdvisor, OpenTable, Yelp).
- "Best of" placements in local publications matter most for AI visibility.`

/** Step 4 (directories). Source: marketingskills directory-submissions (tiers, avoid-list). */
export const DIRECTORY_TIERS = `Directories by type:
- Startup and software: Product Hunt, AlternativeTo, SaaSHub, G2, Capterra, GetApp, Software Advice, TrustRadius, F6S, BetaList.
- B2B services and agencies: Clutch, GoodFirms, UpCity, DesignRush, Sortlist, The Manifest.
- AI tools: There's An AI For That, Futurepedia, Toolify. Integration marketplaces of tools the client connects with.
- Products: Trustpilot, Sitejabber, niche shopping and gift guides.
Avoid: directories with no real traffic, "submit to 500 directories" farms, badge-swap rings, listings that are paid-only with no editorial value. Prefer directories the client's buyers would actually browse.`

/** Steps 6 and 8. Sources: claude-seo backlink-quality.md (toxic patterns), parasite_risk.py. */
export const TOXIC_SIGNALS = `Red flags on a page:
- Link farm: very many outbound links, thin or spun content, pages that exist only to link out.
- Sells links: "write for us" with prices, "sponsored post" packages, "dofollow link" offers.
- Hacked or spam: pharma, casino, payday-loan or adult words injected into an unrelated site.
- Parasite section: "partner content", "sponsored", "brand studio" sections that read differently from the main site.
- Parked or expired domain reused for something unrelated.
- Unrelated niche, or a language that doesn't match the market.
- Forum profile and comment-section links, coupon aggregators, press-release syndication networks: low value.
- Nofollow-only sites still help as citations and mentions, but pass no link value: say so.`

/** Step 4 (AI citations, communities). Sources: claude-seo seo-geo (platform citation sources), marketingskills ai-seo. */
export const AI_CITATION_SURFACES = `What AI assistants and answer engines cite:
- Brand mentions on trusted third-party sites correlate more with AI visibility than raw backlinks.
- ChatGPT and Perplexity lean on Wikipedia, Reddit and established review sites; Google's AI answers lean on pages that already rank.
- "Best of" lists, review platforms (G2, Capterra, Clutch, Trustpilot, Yelp), Reddit and forum threads, YouTube, LinkedIn and industry publications are the usual cited sources.
- For buyer questions, the sites the top results lean on are the places worth being mentioned.`

/** Reading a competitor's backlinks (plan 11). Our own summary of common link-gap practice. */
const COMPETITOR_LINKS = `Competitor link gap:
- A site that links to several competitors but not the client is the strongest signal: it covers this market and links out to businesses like the client.
- Copyable: directory and marketplace listings, "best of" lists that take suggestions, associations and chambers (membership), events and sponsorships, podcasts and interviews, resource pages, partner and vendor pages (if the client uses the same tools).
- Pitch, not form: editorial mentions and guest articles. Say who to pitch and with what angle.
- Not copyable: the competitor's own client sites ("website by", "designed by", "powered by" in a footer), the competitor's sister sites, paid link networks and link farms. Agencies can still ask their own clients for the same credit.
- A footer or sidebar link on many pages is usually a credit or a paid placement; a link inside an article or a listing is usually earned.
- An old link may be gone: if the page no longer links to the competitor, the opportunity is weaker.`

export const KNOWLEDGE = {
  COMPETITOR_LINKS,
  CLIENT_DISCOVERY,
  SEARCH_INTENT,
  LINK_TACTICS,
  LOCAL_CITATIONS,
  DIRECTORY_TIERS,
  TOXIC_SIGNALS,
  AI_CITATION_SURFACES,
}

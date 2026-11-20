# 10 · Manual Search: the site catalog (research, Nov 2026)

The fixed list of sites the VAs choose from on the **Manual Search** tab (plan: `09-manual-search.md`).
This file is the source for the seed migration. Each row becomes one `backlink_catalog` entry.

## How this list was made

- **Reddit threads.** The four threads we were given are on reddit.com, and every automated route
  was blocked (WebFetch, the in-app browser, and search engines don't index them):
  `r/linkbuilding/1x03kvp` "best place for backlinks", `r/Backlinks/1usm7bg` "how are you guys
  acquiring quality backlinks", `r/SEO/f2g2bz` "what method do you use to find sites",
  `r/SEO/vkakr9` "backlinks: where and how to get them". **Open item:** paste the threads (or let
  Claude read them in your own Chrome) and anything they add goes into this file before seeding.
- **What's here instead:** what practitioners keep recommending in those kinds of threads, checked
  against 2026 roundups: HARO alternatives, citation lists for the US, UK, Australia and Canada,
  SaaS/startup directories, guest-post marketplaces, podcast platforms and press-release wires
  (sources at the bottom), plus the core sites the app already seeds (`0032`, `0038`).
- **Prices and link types change.** Treat every cost and follow/nofollow value as "typical, Nov 2026".
  The seed sets `verified_at = null`. A VA confirms each one the first time they use it, and the
  link type recorded on each submission is the real answer.

## What practitioners agree on (the rules the catalog follows)

1. **Relevance beats volume.** Mass directory submission is dead. A local business needs its
   core maps and citation sites with an identical name, address and phone (NAP), then niche
   and local sites. Not 300 random directories.
2. **The best links are earned:** journalist requests (HARO's replacements), digital PR, podcasts,
   associations, partners and suppliers, local sponsorships, "best of" lists, resource pages.
3. **Profiles and Web 2.0 posts are mostly nofollow.** They're still worth having for brand and
   entity signals and for AI answers (Reddit, LinkedIn, Crunchbase and review sites get cited a
   lot). They do little for rankings on their own.
4. **Paid links carry risk.** Buying guest posts breaks Google's link-spam policy. If you do it,
   only buy on real sites with real traffic. Avoid PBNs, Fiverr "1,000 backlinks" packages,
   link farms and sites that say "write for us" on every topic. The catalog keeps marketplaces
   in their own category, which only managers can pick.
5. **Find opportunities from competitors:** check their backlinks (Ahrefs, Semrush, Moz) and get
   listed wherever they are and the client isn't. Look for unlinked brand mentions and broken
   links too.
6. **HARO itself:** Connectively (HARO's 2024 rebrand) shut down in Dec 2024. Featured.com bought
   HARO in April 2025 and relaunched it as a free email digest. Qwoted, Featured, Source of
   Sources and MentionMatch (formerly Help a B2B Writer) are the usual picks now.

## Legend

| Column       | Values                                                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cost**     | **Free** · **Freemium** (free listing, paid upgrades) · **Trial** (free trial, then paid) · **Paid** · **Lead fees** (free profile, pay per lead) · **Membership** · **Selection** (they pick you, can't apply or buy) |
| **Link**     | **Follow** · **Nofollow** · **Mixed** (some links follow) · **Varies** (depends on the page or the editor) · **None** (no link, NAP or brand only)                                                                  |
| **Priority** | **★★★** must-have for matching clients · **★★** recommended · **★** optional / situational                                                                                                     |
| **For**      | Who it suits: Local / National / Global · B2B / B2C · Services / Software / Products · industry, or **All**                                                                                    |
| ✓ in app     | Already in `directories` as a core listing (seeded in `0032`/`0038`); the catalog row points at the same directory                                                                             |

---

## A. Maps and core listings (every business with an address or service area)

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Google Business Profile ✓ | https://business.google.com/ | Free | Follow (website button) | ★★★ | Local, all countries | The listing that matters most. Verification by video, phone or postcard. |
| Bing Places ✓ | https://www.bingplaces.com/ | Free | Follow | ★★★ | Local, all | Can import from Google Business Profile. Also feeds Copilot and ChatGPT local answers. |
| Apple Business Connect ✓ | https://businessconnect.apple.com/ | Free | None | ★★★ | Local, all | Apple Maps and Siri. Needs an Apple ID. |
| Facebook Page ✓ | https://www.facebook.com/pages/create | Free | Nofollow | ★★★ | All | Brand / entity. Use the same NAP. |
| LinkedIn Company Page | https://www.linkedin.com/company/setup/new/ | Free | Nofollow | ★★★ | All (B2B especially) | Entity signal, often cited by AI answers. Needs a personal profile as admin. |
| Yelp ✓ | https://biz.yelp.com/ | Freemium (ads paid) | Nofollow (redirect) | ★★★ | Local B2C, US/UK/CA/AU | Don't buy ads to "help reviews"; it doesn't. |
| Better Business Bureau ✓ | https://www.bbb.org/get-listed | Freemium (accreditation paid, priced by size) | Nofollow; Follow on some accredited profiles | ★★ | Local, US/CA | The free profile is fine. Accreditation is a client decision. |
| Nextdoor ✓ | https://business.nextdoor.com/ | Free | Nofollow | ★★ | Local B2C, US/UK/CA/AU | Neighbour recommendations. |
| Foursquare ✓ | https://foursquare.com/ (claim via Foursquare for Business) | Free | None | ★★ | Local, all | A data source for Uber, Snap and others. |
| Data Axle ✓ | https://www.data-axle.com/ (Business Listings / Express Update) | Free (submit); paid data products | None | ★★ | Local, US | Aggregator: feeds many smaller directories. |
| Neustar Localeze ✓ | https://www.neustarlocaleze.biz/ | Paid (yearly) | None | ★ | Local, US | Aggregator. Only when the client pays for distribution. |
| Yext | https://www.yext.com/ | Paid (yearly) | None | ★ | Local, multi-location | Pushes listings to many sites; they drop when you stop paying. Client decision. |

## B. US citation directories

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Yellow Pages (Thryv) ✓ | https://www.yellowpages.com/ | Freemium | Nofollow | ★★★ | Local US | Also feeds Superpages. |
| Manta ✓ | https://www.manta.com/ | Freemium | Nofollow | ★★ | Local US | Small-business directory. |
| ChamberofCommerce.com ✓ | https://www.chamberofcommerce.com/ | Freemium | Mixed | ★★ | Local US | A directory, not a real chamber. Real chambers are in J. |
| Hotfrog ✓ | https://www.hotfrog.com/ | Free | Follow (typical) | ★★ | Local US + intl | Has country versions: .com.au, .co.uk, .ca. |
| Brownbook ✓ | https://www.brownbook.net/ | Free | Follow (typical) | ★★ | Local, global | Works in most countries. |
| EZlocal ✓ | https://ezlocal.com/ | Freemium | Follow (typical) | ★★ | Local US | |
| Cylex ✓ | https://www.cylex.us.com/ | Free | Nofollow (typical) | ★★ | Local US + intl | Country sites: cylex-uk.co.uk, cylex.com.au, cylex-canada.ca. |
| MerchantCircle ✓ | https://www.merchantcircle.com/ | Free | Nofollow | ★ | Local US | |
| Alignable ✓ | https://www.alignable.com/ | Freemium | Nofollow | ★★ | Local US/CA B2B | Small-business network: local referrals. |
| MapQuest ✓ | https://www.mapquest.com/ | Via aggregators | None | ★ | Local US | Mostly filled from aggregators / Yext. No direct claim. |
| Local.com | https://www.local.com/ | Freemium | Nofollow | ★ | Local US | Low priority. |
| Citysquares | https://citysquares.com/ | Free | Follow (typical) | ★ | Local US | Low priority. |
| Whitespark Local Citation Finder | https://whitespark.ca/local-citation-finder/ | Paid tool | — | ★ | Local, team tool | Finds the citations competitors have and the client doesn't. |

## C. Australia

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Google, Bing, Apple, Facebook, LinkedIn | (see A) | Free | — | ★★★ | Local AU | Same core set. |
| True Local | https://www.truelocal.com.au/ | Freemium | Nofollow (typical) | ★★★ | Local AU | One of the top AU citation sites. |
| Yellow Pages AU | https://www.yellowpages.com.au/ | Freemium (ads paid) | Nofollow | ★★★ | Local AU | The basic listing is free. Sales calls follow. |
| White Pages AU | https://www.whitepages.com.au/ | Free (business listing) | None | ★★ | Local AU | |
| Localsearch | https://www.localsearch.com.au/ | Freemium | Follow (typical) | ★★★ | Local AU | |
| StartLocal | https://www.startlocal.com.au/ | Free | Follow (typical) | ★★ | Local AU | |
| Word of Mouth | https://www.wordofmouth.com.au/ | Free | Nofollow (typical) | ★★ | Local AU B2C | Review-led. |
| Yelp AU | https://biz.yelp.com.au/ | Free | Nofollow | ★★ | Local AU B2C | |
| Hotfrog AU | https://www.hotfrog.com.au/ | Free | Follow (typical) | ★★ | Local AU | |
| Pure Local | https://www.purelocal.com.au/ | Freemium | Follow (typical) | ★ | Local AU | |
| Pink Pages | https://www.pinkpages.com.au/ | Free | Varies | ★ | Local AU | |
| ProductReview.com.au | https://www.productreview.com.au/ | Freemium (business plans paid) | Nofollow | ★★ | AU B2C | Australia's biggest review site. Ranks for "<brand> reviews". |
| Oneflare | https://www.oneflare.com.au/ | Lead fees | Nofollow | ★ | Local AU trades/services | Free profile; leads are paid. |
| hipages | https://hipages.com.au/ | Paid (subscription / leads) | Nofollow | ★ | Local AU trades | Client decision (lead cost). |
| ServiceSeeking | https://www.serviceseeking.com.au/ | Lead fees | Nofollow | ★ | Local AU trades/services | |
| Airtasker | https://www.airtasker.com/ | Free (fee per job) | Nofollow | ★ | Local AU services | Profile mainly; little link value. |
| Bark AU | https://www.bark.com/en/au/ | Lead fees (credits) | Nofollow | ★ | AU services | |
| Australian Institute of Conveyancers (state divisions) | https://www.aicnational.com.au/ | Membership | Varies | ★★ | Conveyancers | Find-a-conveyancer directories for members. Example of a niche association. |
| Law Society of NSW: Find a Lawyer | https://www.lawsociety.com.au/ | Membership (solicitors) | Varies | ★★ | Lawyers NSW | Each state has its own law society. |

## D. United Kingdom

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Google, Bing, Apple, Facebook, LinkedIn | (see A) | Free | — | ★★★ | Local UK | |
| Yell | https://www.yell.com/free-listing/ | Freemium | Nofollow (typical) | ★★★ | Local UK | The main UK directory. |
| Thomson Local | https://www.thomsonlocal.com/ | Freemium | Nofollow (typical) | ★★ | Local UK | |
| FreeIndex | https://www.freeindex.co.uk/ | Freemium | Follow (typical) | ★★★ | Local UK | Often listed as a follow link. |
| Scoot | https://www.scoot.co.uk/ | Freemium | Varies | ★★ | Local UK | Feeds partner sites: one listing, several citations. |
| 192.com | https://www.192.com/ | Freemium | Nofollow | ★★ | Local UK | |
| Cylex UK | https://www.cylex-uk.co.uk/ | Free | Nofollow (typical) | ★ | Local UK | |
| Hotfrog UK | https://www.hotfrog.co.uk/ | Free | Follow (typical) | ★ | Local UK | |
| Yelp UK | https://biz.yelp.co.uk/ | Free | Nofollow | ★★ | Local UK B2C | |
| Trustpilot ✓ | https://business.trustpilot.com/ | Freemium | Nofollow | ★★ | UK/EU B2C (global) | Huge in the UK. |
| Checkatrade | https://www.checkatrade.com/ | Membership (paid) | Nofollow | ★ | UK trades | Client decision. Vetted members only. |
| TrustATrader | https://www.trustatrader.com/ | Membership (paid) | Nofollow | ★ | UK trades | |
| MyBuilder | https://www.mybuilder.com/ | Lead fees | Nofollow | ★ | UK trades | |
| Rated People | https://www.ratedpeople.com/ | Paid (leads / subscription) | Nofollow | ★ | UK trades | |
| Bark UK | https://www.bark.com/en/gb/ | Lead fees (credits) | Nofollow | ★ | UK services | |
| Unbiased | https://www.unbiased.co.uk/ | Paid | Nofollow | ★ | UK finance/legal advisers | |

## E. Canada

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Google, Bing, Apple, Facebook, LinkedIn | (see A) | Free | — | ★★★ | Local CA | |
| YellowPages.ca | https://www.yellowpages.ca/ | Freemium | Nofollow (typical) | ★★★ | Local CA | The top Canadian citation. |
| 411.ca | https://411.ca/ | Free | Nofollow (typical) | ★★ | Local CA | |
| Canpages | https://www.canpages.ca/ | Free | Varies | ★★ | Local CA | |
| Cylex Canada | https://www.cylex-canada.ca/ | Free | Nofollow (typical) | ★ | Local CA | Feeds partner directories. |
| Hotfrog CA | https://www.hotfrog.ca/ | Free | Follow (typical) | ★ | Local CA | |
| n49 | https://www.n49.com/ | Free | Varies | ★ | Local CA | Canadian reviews. |
| HomeStars | https://homestars.com/ | Freemium (paid plans) | Nofollow | ★★ | CA home services | |
| Yelp CA | https://biz.yelp.ca/ | Free | Nofollow | ★★ | Local CA B2C | |
| BBB (Canada) | https://www.bbb.org/ | Freemium | Nofollow | ★★ | Local CA | Same as US. |

## F. Home services and trades (US)

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Angi ✓ | https://pro.angi.com/ | Lead fees | Nofollow | ★★★ | Home services US | Free profile; leads are paid. |
| HomeAdvisor ✓ | https://pro.homeadvisor.com/ | Paid (membership + leads) | Nofollow | ★ | Home services US | Client decision. |
| Thumbtack ✓ | https://www.thumbtack.com/pro | Lead fees | Nofollow | ★★ | Services US | |
| Houzz ✓ | https://pro.houzz.com/ | Freemium (Houzz Pro paid) | Follow (typical, profile website) | ★★★ | Remodel / design / builders | One of the few strong follow links for trades. |
| Porch ✓ | https://pro.porch.com/ | Freemium | Nofollow | ★★ | Home services US | |
| Bark ✓ | https://www.bark.com/ | Lead fees (credits) | Nofollow | ★ | Services, US/UK/AU/CA | |
| BuildZoom | https://www.buildzoom.com/ | Free (claim) | Nofollow | ★★ | Licensed contractors US | Built from licence records: claim it. |
| Networx | https://www.networx.com/ | Lead fees | Nofollow | ★ | Home services US | |
| Expertise.com | https://www.expertise.com/ | Selection | Follow | ★★ | Local services US | Can't apply or buy. A "best X in city" page that ranks well; reach out once the client has strong reviews. |
| Manufacturer / supplier "find a dealer" pages | (each brand the client installs or sells) | Free | Follow (often) | ★★★ | Trades, retailers | Play: certified installer or dealer locators (Carrier, Trane, GAF, Owens Corning…). Strong and relevant. |

## G. Professional verticals (only when the client's industry matches)

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Avvo | https://www.avvo.com/ | Freemium | Nofollow | ★★★ | Lawyers US | Claim the profile. |
| Justia Lawyer Directory | https://www.justia.com/lawyers | Freemium | Follow (typical, basic profile) | ★★★ | Lawyers US | |
| FindLaw | https://lawyers.findlaw.com/ | Freemium (basic free, ads paid) | Varies | ★★ | Lawyers US | |
| Martindale-Hubbell / Lawyers.com | https://www.martindale.com/ | Freemium | Varies | ★★ | Lawyers US | One profile covers both. |
| Super Lawyers | https://www.superlawyers.com/ | Selection (profile upgrades paid) | Varies | ★ | Lawyers US | Can't apply; selection-based. |
| Healthgrades | https://www.healthgrades.com/ | Free (claim) | Nofollow | ★★★ | Doctors / dentists US | |
| WebMD Care | https://doctor.webmd.com/ | Free (claim) | Nofollow | ★★ | Doctors US | |
| Vitals | https://www.vitals.com/ | Free (claim) | Nofollow | ★ | Doctors US | |
| Zocdoc | https://www.zocdoc.com/join | Paid | Nofollow | ★ | Doctors / dentists US | Booking platform. Client decision. |
| RateMDs | https://www.ratemds.com/ | Free (claim) | Nofollow | ★ | Doctors US/CA | |
| Psychology Today directory | https://www.psychologytoday.com/ | Paid (monthly, free trial) | Follow (typical) | ★★★ | Therapists / counsellors (US, UK, CA, AU) | A must for therapists. |
| Zillow (agent profile) | https://www.zillow.com/agent-finder/ | Freemium (Premier Agent paid) | Nofollow | ★★ | Realtors US | |
| Realtor.com (agent profile) | https://www.realtor.com/realestateagents/ | Freemium | Nofollow | ★★ | Realtors US | |
| Homes.com (agent profile) | https://www.homes.com/real-estate-agents/ | Freemium | Nofollow | ★ | Realtors US | |
| Tripadvisor | https://www.tripadvisor.com/Owners | Freemium | Nofollow | ★★★ | Hospitality, restaurants, tours (global) | |
| OpenTable | https://restaurant.opentable.com/ | Paid | Nofollow | ★ | Restaurants | Client decision. |
| The Knot | https://www.theknot.com/pro | Freemium (paid ads) | Nofollow | ★★ | Wedding vendors US | |
| WeddingWire | https://www.weddingwire.com/vendors | Freemium (paid ads) | Nofollow | ★ | Wedding vendors | Same company as The Knot. |
| DealerRater | https://www.dealerrater.com/ | Freemium | Nofollow | ★★ | Car dealers US/CA | |
| CPA / accounting directories (state CPA society) | (state society site) | Membership | Varies | ★★ | Accountants US | Play: find the state society. |

## H. B2B services: agency and vendor review platforms

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Clutch ✓ | https://clutch.co/get-listed | Freemium (sponsored placement paid) | Follow (typical, profile website) | ★★★ | B2B services | Verified client reviews move the ranking. |
| The Manifest ✓ | https://themanifest.com/ | Free (same profile as Clutch) | Varies | ★★ | B2B services | |
| GoodFirms ✓ | https://www.goodfirms.co/ | Freemium | Varies | ★★ | B2B services / software | |
| DesignRush ✓ | https://www.designrush.com/ | Freemium | Varies | ★★ | Agencies | |
| UpCity ✓ | https://upcity.com/ | Freemium | Varies | ★★ | B2B services US | |
| Sortlist ✓ | https://www.sortlist.com/ | Freemium | Varies | ★ | Agencies (EU/US) | |
| Agency Spotter | https://www.agencyspotter.com/ | Freemium | Varies | ★ | Agencies | |
| Trustpilot ✓ | https://business.trustpilot.com/ | Freemium | Nofollow | ★★ | B2B/B2C | |
| G2 (services categories) ✓ | https://sell.g2.com/ | Freemium | Nofollow (typical) | ★ | B2B services with a software flavour | |

## I. Software, SaaS and app marketplaces

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| G2 ✓ | https://sell.g2.com/ | Freemium | Nofollow (typical) | ★★★ | Software | Reviews drive the grids that buyers and AI answers read. |
| Capterra ✓ | https://www.capterra.com/vendors/ | Free listing (pay per click optional) | Follow (paid clicks); Nofollow (free) | ★★★ | Software | One Gartner Digital Markets listing covers Capterra, GetApp and Software Advice. |
| GetApp ✓ | https://www.getapp.com/ | Free (same as Capterra) | Varies | ★★ | Software | |
| Software Advice ✓ | https://www.softwareadvice.com/ | Free (same as Capterra) | Varies | ★★ | Software B2B | |
| TrustRadius ✓ | https://www.trustradius.com/vendors | Freemium | Nofollow | ★★ | B2B software | |
| Product Hunt ✓ | https://www.producthunt.com/ | Free | Nofollow (typical) | ★★★ | Software / apps / products | A launch day. Plan it; it's not just a listing. |
| AlternativeTo ✓ | https://alternativeto.net/ | Free | Nofollow (typical) | ★★ | Software | |
| SaaSHub ✓ | https://www.saashub.com/ | Freemium | Varies | ★★ | Software | |
| SourceForge / Slashdot | https://sourceforge.net/software/vendors/ | Freemium | Varies | ★★ | B2B software | One listing appears on both. |
| Crozdesk | https://crozdesk.com/ | Free | Varies | ★ | B2B software | |
| SaaSworthy | https://www.saasworthy.com/ | Freemium | Varies | ★ | Software | |
| StackShare | https://stackshare.io/ | Free | Varies | ★ | Dev tools | |
| BetaList | https://betalist.com/ | Freemium (pay to skip the queue) | Varies (sources disagree) | ★★ | Pre-launch startups | |
| Uneed | https://www.uneed.best/ | Freemium (free waits in a queue) | Follow (typical) | ★★ | Startups / indie software | May ask for a badge back. |
| Fazier | https://fazier.com/ | Freemium | Varies | ★ | Startups / indie software | |
| DevHunt | https://devhunt.org/ | Freemium | Varies | ★ | Developer tools | |
| Peerlist Launchpad | https://peerlist.io/ | Free | Varies | ★ | Software (dev audience) | |
| Indie Hackers | https://www.indiehackers.com/ | Free | Nofollow | ★ | Founders / bootstrapped SaaS | A community; share the story, don't drop links. |
| Hacker News (Show HN) | https://news.ycombinator.com/showhn.html | Free | Nofollow | ★ | Dev / technical products | Big traffic if it lands. Strict culture. |
| There's An AI For That | https://theresanaiforthat.com/ | Paid (submission fee) | Varies | ★★ | AI products | |
| Futurepedia | https://www.futurepedia.io/ | Paid (submission fee) | Varies | ★ | AI products | |
| Toolify | https://www.toolify.ai/ | Freemium | Varies | ★ | AI products | |
| Chrome Web Store | https://chrome.google.com/webstore/devconsole | Paid ($5 one-time developer fee) | Nofollow | ★ | Browser extensions | |
| WordPress.org plugin directory | https://wordpress.org/plugins/developers/ | Free | Follow (plugin page) | ★★ | WordPress products | |
| Shopify App Store | https://www.shopify.com/partners | Free to list (revenue share) | Nofollow | ★ | Shopify apps | |
| Zapier app directory | https://developer.zapier.com/ | Free (needs an integration) | Follow (typical) | ★★ | SaaS with an API | Integration and partner pages are strong, relevant links. |
| GitHub (org + README) | https://github.com/ | Free | Nofollow (README) / Follow (profile website, typical) | ★★ | Software / dev | |

## J. Company and brand profiles (entity signals, all clients)

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Crunchbase ✓ | https://www.crunchbase.com/ | Freemium (Pro paid) | Nofollow (typical) | ★★★ | B2B, startups, any company | Entity data that AI tools and journalists use. |
| Wellfound (AngelList) | https://wellfound.com/ | Free | Nofollow | ★ | Startups hiring | |
| F6S | https://www.f6s.com/ | Free | Varies | ★ | Startups | |
| Dun & Bradstreet (D-U-N-S) | https://www.dnb.com/duns/get-a-duns.html | Free (number); paid credit products | None | ★ | B2B US/UK/AU | Needed by some vendor portals and app stores. Ignore their upsells. |
| ZoomInfo company profile | https://www.zoominfo.com/update/company | Free (update) | None | ★ | B2B | Fix the company data. |
| Owler | https://www.owler.com/ | Free | Nofollow | ★ | B2B | |
| Gravatar | https://gravatar.com/ | Free | Follow (typical, profile links) | ★ | Founders / authors | |
| About.me | https://about.me/ | Freemium | Varies | ★ | Founders / personal brands | |
| Wikidata | https://www.wikidata.org/ | Free | None | ★ | Notable companies only | Only with independent sources. Never promotional. Managers only. |
| X / Instagram / YouTube / TikTok / Pinterest / Threads / Bluesky | (each platform's business signup) | Free | Nofollow | ★★ | All (pick what the client will use) | Brand profiles; the bio link. Blocked in Standard Search on purpose, but fine to claim here. |

## K. Publishing platforms (Web 2.0)

Low ranking value. Use them for brand, referral and AI visibility, with real content. Never spin.

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Medium | https://medium.com/ | Free | Nofollow | ★ | All | Republish articles with a canonical link back to the client's site. |
| Substack | https://substack.com/ | Free | Varies | ★ | Thought leadership | |
| LinkedIn Articles | https://www.linkedin.com/ | Free | Nofollow | ★★ | B2B | Posted by the founder or a team member. Reaches real buyers. |
| WordPress.com | https://wordpress.com/ | Freemium | Varies | ★ | All | |
| Blogger | https://www.blogger.com/ | Free | Follow (typical) | ★ | All | Low value; only with real content. |
| Tumblr | https://www.tumblr.com/ | Free | Varies | ★ | B2C / creative | |
| Google Sites | https://sites.google.com/ | Free | Varies (sources disagree) | ★ | All | |
| Hashnode / DEV Community | https://hashnode.com/ · https://dev.to/ | Free | Varies (canonical supported) | ★★ | Developer products | |
| Vocal Media | https://vocal.media/ | Freemium | Varies | ★ | B2C / creators | |

## L. Journalist requests (earned media; often the best links on this list)

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HARO (by Featured) | https://www.helpareporter.com/ | Free (email digest) | Varies (editor decides) | ★★★ | National / global, any expert | Relaunched in April 2025 by Featured. Answer within hours. |
| Featured.com | https://featured.com/ | Freemium (small free allowance; paid plans roughly $29–99/mo) | Varies | ★★★ | Experts, founders | Q&A answers get published on partner sites. |
| Qwoted | https://www.qwoted.com/ | Freemium (free: 2 pitches/mo, delayed; Pro ≈ $149/mo) | Varies | ★★★ | Experts, B2B | Real journalist requests. |
| Source of Sources (SOS) | https://www.sourceofsources.com/ | Free | Varies | ★★ | Any expert | Peter Shankman's HARO successor. |
| MentionMatch (formerly Help a B2B Writer) | https://helpab2bwriter.com/ | Free | Varies | ★★ | B2B experts | |
| SourceBottle | https://www.sourcebottle.com/ | Free (basic) | Varies | ★★★ | AU / NZ / UK experts | The go-to for Australian clients. |
| ResponseSource | https://www.responsesource.com/ | Paid (for brands) | Varies | ★ | UK | |
| #JournoRequest on X | https://x.com/search?q=%23journorequest | Free | Varies | ★★ | UK/US experts | Watch the hashtag. |
| Muck Rack | https://muckrack.com/ | Paid (PR suite) | — | ★ | Team tool | A journalist database for digital PR. Not a link itself. |
| Connectively (old HARO) | — | Closed Dec 2024 | — | — | — | In the catalog as retired, so VAs don't look for it. |

## M. Press release wires (mostly nofollow; pay for coverage, not for the link)

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| EIN Presswire | https://www.einpresswire.com/ | Paid (per release) | Nofollow | ★ | Real news only | The cheapest of the big wires. |
| PR Newswire (Cision) | https://www.prnewswire.com/ | Paid (high, per release) | Nofollow | ★ | Funding, launches | Client decision. |
| Business Wire | https://www.businesswire.com/ | Paid (high) | Nofollow | ★ | Public companies, big news | |
| GlobeNewswire | https://www.globenewswire.com/ | Paid | Nofollow | ★ | Big news | |
| PRWeb (Cision) | https://www.prweb.com/ | Paid (per release) | Nofollow | ★ | SMB news | |
| Newswire.com | https://www.newswire.com/ | Paid | Nofollow | ★ | SMB news | |
| ACCESS Newswire | https://www.accessnewswire.com/ | Paid | Nofollow | ★ | SMB news | |
| PR.com | https://www.pr.com/ | Freemium | Varies | ★ | SMB | Also a company directory. |
| PRLog | https://www.prlog.org/ | Freemium | Nofollow (typical) | ★ | SMB | |
| openPR | https://www.openpr.com/ | Free | Varies | ★ | EU / DE | |

## N. Podcast guesting (show-notes links; very good for B2B and experts)

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PodMatch | https://www.podmatch.com/ | Paid (guest plans; sources say ≈ $32/mo) | Varies (show notes) | ★★ | Experts, founders | Matches guests with hosts. |
| MatchMaker.fm | https://www.matchmaker.fm/ | Freemium / Paid (sources disagree; Pro ≈ $15/mo) | Varies | ★★ | Experts | |
| Talks.co | https://talks.co/ | Freemium (free plan) | Varies | ★ | Experts | |
| PodcastGuests.com | https://podcastguests.com/ | Freemium (free newsletter) | Varies | ★★ | Experts | "Shows looking for guests" email. |
| Podchaser | https://www.podchaser.com/ | Freemium | — | ★ | Team tool | Research shows and contacts. |
| Listen Notes | https://www.listennotes.com/ | Freemium | — | ★ | Team tool | Podcast search. |
| Rephonic | https://rephonic.com/ | Paid | — | ★ | Team tool | Audience size and contacts. |

## O. Local plays (not one fixed site: the VA finds the local one and records its URL)

| Play | Where to start | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Local chamber of commerce | US: https://www.uschamber.com/co/chambers · AU: https://www.australianchamber.com.au/ · UK: https://www.britishchambers.org.uk/ | Membership (≈ $200–600/yr typical US) | Follow (member directory, usually) | ★★★ | Local | One of the best local links. Client decision (cost). |
| Business improvement district / main street association | Google "<city> business association" | Membership / Free | Follow (often) | ★★ | Local | |
| BNI chapter | https://www.bni.com/find-a-chapter | Membership (paid) | Varies | ★ | Local B2B | Chapter member pages. |
| Local sponsorships (youth sports, charity runs, school events) | The client's community | Paid (sponsorship) | Follow (sponsor pages, often) | ★★★ | Local | Real, relevant links; also good PR. |
| Local news: community calendar / business news tips | The city's newspaper and TV sites | Free | Varies | ★★ | Local | Events, openings, awards, hires. |
| Patch.com (US) | https://patch.com/ | Freemium (posts free, ads paid) | Nofollow (typical) | ★★ | Local US | Post events and announcements in the client's town. |
| Eventbrite / Meetup event pages | https://www.eventbrite.com/ · https://www.meetup.com/ | Free (Eventbrite) / Paid (Meetup organiser) | Nofollow | ★ | Local | When the client runs a real event or workshop. |
| City / county government business directory | Google "<city> business directory site:.gov" in your own browser | Free | Follow (often) | ★★ | Local | Some cities list local businesses or licensed contractors. |
| University / college local business or alumni directory | The local school's site | Free | Follow (often) | ★ | Local | Student discounts and career fairs also earn .edu links. **Avoid scholarship link schemes.** |
| Suppliers, partners and manufacturers | The client's vendors | Free | Follow (often) | ★★★ | All | "Our partners", "where to buy", "certified installer" pages. |
| Testimonials for tools the client uses | The client's software and service vendors | Free | Follow (often) | ★★ | All | Vendors publish customer quotes with a link. |
| Unlinked brand mentions | Google Alerts (free): https://www.google.com/alerts | Free | Follow (when they add it) | ★★ | All | Ask sites that mention the client to add a link. |
| "Best <service> in <city>" lists | Google "best <service> <city>" | Free (outreach) | Follow (often) | ★★★ | Local | Ask to be considered. Bring reviews and proof. |

## P. Forums, Q&A and communities (nofollow; brand, referral and AI-answer visibility)

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Reddit | https://www.reddit.com/ | Free | Nofollow | ★★ | All | Heavily cited by AI answers. Help first; no link dropping (accounts get banned). |
| Quora | https://www.quora.com/ | Free | Nofollow | ★ | All | Answer real questions as the founder or expert. |
| Stack Exchange sites | https://stackexchange.com/ | Free | Nofollow | ★ | Technical | |
| Facebook Groups (local and niche) | https://www.facebook.com/groups/ | Free | Nofollow | ★★ | Local B2C | Community recommendations. |
| Industry forums / Slack / Discord communities | Find per niche | Free | Nofollow | ★ | Niche B2B | |

## Q. Products and ecommerce

| Site | Submit / start URL | Cost | Link | Priority | For | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Trustpilot ✓ | https://business.trustpilot.com/ | Freemium | Nofollow | ★★★ | Online stores | |
| Sitejabber ✓ | https://www.sitejabber.com/ | Freemium | Nofollow | ★★ | Online stores | |
| REVIEWS.io | https://www.reviews.io/ | Paid | Nofollow | ★ | Online stores | Review collection; also a public profile. |
| Google Merchant Center (free listings) | https://merchants.google.com/ | Free | Follow (shopping click) | ★★★ | Products | Free product listings in Google Shopping. |
| Pinterest Business | https://business.pinterest.com/ | Free | Nofollow | ★★ | Products B2C | |
| Gift guides and product roundups | Google "<product> gift guide 2026" | Free (send samples) | Follow (often) | ★★ | Products | Play: pitch editors before the season. |

## R. Paid guest posts and link marketplaces (managers only)

**Warning.** Buying links that pass ranking value breaks Google's spam policies. These rows are
only for managers, and every one needs a manager's spend approval in the app. Check real traffic
first (Collaborator shows GA/GSC data), avoid sites that sell on every topic, and record the price.

| Site | Start URL | Cost | Link | Priority | Notes |
| --- | --- | --- | --- | --- | --- |
| Collaborator.pro | https://collaborator.pro/ | Paid (from ≈ $20–40 per post) | Varies | ★ | Shows publishers' GA/GSC traffic. |
| Adsy | https://adsy.com/ | Paid (from ≈ $10–14) | Varies | ★ | Each site sets its own price. |
| WhitePress | https://www.whitepress.com/ | Paid (varies by publisher) | Varies | ★ | Strong in the EU. |
| Linkhouse | https://linkhouse.co/ | Paid (often from ≈ $49) | Varies | ★ | |
| PRNEWS.IO | https://prnews.io/ | Paid (cheap to thousands for top media) | Varies | ★ | Sponsored articles on news sites. |
| Getfluence | https://www.getfluence.com/ | Paid (≈ $50+, or quote) | Varies | ★ | Managed premium media. |
| Authority Builders | https://authority.builders/ | Paid | Varies | ★ | Vetted network. |
| Rhino Rank | https://www.rhinorank.io/ | Paid | Varies | ★ | UK; niche edits. |
| FatJoe | https://fatjoe.com/ | Paid | Varies | ★ | Blogger outreach service. |
| Loganix | https://loganix.com/ | Paid | Varies | ★ | Guest posts and citation building. |

---

## VA toolkit (finding opportunities; shown on the tab as links, not catalog rows)

| Tool | URL | Cost | Use |
| --- | --- | --- | --- |
| Ahrefs free backlink checker | https://ahrefs.com/backlink-checker | Free (top 100 links) / paid suite | See where competitors get links. |
| Semrush | https://www.semrush.com/ | Freemium (limited free) / paid | Backlink gap. |
| Moz Link Explorer | https://moz.com/link-explorer | Freemium | Competitors' links, spam score. |
| Ubersuggest | https://neilpatel.com/ubersuggest/ | Freemium | Cheap backlink look-ups. |
| Majestic | https://majestic.com/ | Paid | Links and Trust Flow. |
| Google search with operators | https://www.google.com/ | Free (in your own browser) | `"write for us" <topic>`, `intitle:"resources" <topic>`, `"<city>" "submit your business"`. |
| Google Alerts | https://www.google.com/alerts | Free | Unlinked brand mentions. |
| Hunter.io | https://hunter.io/ | Freemium | Find an editor's email. |
| Check My Links (Chrome) | Chrome Web Store | Free | Broken links on resource pages. |
| BuzzStream / Pitchbox / Respona | https://www.buzzstream.com/ · https://pitchbox.com/ · https://respona.com/ | Paid | Outreach at scale (later). |
| BrightLocal Citation Builder | https://www.brightlocal.com/ | Paid (per citation) | Hand off a citation batch when VAs are full. |

## Sources

- [Search Engine Land: HARO alternatives](https://searchengineland.com/guide/haro-alternatives) ·
  [LinkBronze: Qwoted vs Featured vs SOS](https://linkbronze.com/articles/haro-alternatives-qwoted-vs-featured-vs-sos/) ·
  [OutreachDesk: HARO alternatives 2026](https://outreachdesk.com/haro-alternatives/) ·
  [FluxWriter: HARO shutdown alternatives](https://fluxwriter.com/blog/haro-shutdown-alternatives-2026) ·
  [Presswhizz](https://presswhizz.com/blog/best-haro-alternatives/)
- [BrightLocal: Australian citation sites](https://www.brightlocal.com/resources/australian-citation-sites) ·
  [Whitespark: top citations, Australia](https://whitespark.ca/top-local-citation-sources-by-country/australia/) ·
  [Jasmine Directory: Australia 2026](https://www.jasminedirectory.com/blog/the-best-australian-business-directories-in-2026/) ·
  [Bloomtools 2026](https://www.bloomtools.com/blog/top-directories-to-help-your-business-get-found-in-2026)
- [Whitehat SEO: UK citation sites](https://whitehat-seo.co.uk/blog/uk-business-directories-citation-sites) ·
  [Uberall: UK directories](https://uberall.com/en-us/resources/blog/the-best-business-directories-in-the-uk) ·
  [Jasmine Directory: UK 2026](https://www.jasminedirectory.com/blog/the-best-uk-business-directories-in-2026/)
- [BrightLocal: Canadian citation sites](https://www.brightlocal.com/canadian-citation-sites/) ·
  [Jasmine Directory: Canada 2026](https://www.jasminedirectory.com/blog/the-best-canadian-business-directories-in-2026/)
- [Directorist: directory list 2026](https://directorist.com/blog/directory-website-list-for-backlinks/) ·
  [Indexed: high-DA sites](https://www.joinindexed.com/blog/high-domain-authority-sites-for-backlinks)
- [Arahi: SaaS directories 2026](https://arahi.ai/blog/best-saas-directories-to-submit-your-startup-2026) ·
  [ScrollLaunch](https://www.scrolllaunch.com/blog/best-saas-directories-2026) ·
  [SaaSCity](https://saascity.io/best-saas-directories) ·
  [FoundrList](https://www.foundrlist.com/blogs/complete-startup-directory-list-2026) ·
  [SaaSLaunch](https://saaslaunch.site/blog/best-saas-directories-2026)
- [Linkforce: guest post marketplaces](https://blog.linkforce.io/guest-post-marketplace/) ·
  [OutreachDesk: marketplace audit](https://outreachdesk.com/top-10-guest-post-marketplaces/) ·
  [LinkDR](https://linkdr.com/blog/best-guest-post-marketplaces)
- [Talks.co: PodMatch vs MatchMaker.fm](https://talks.co/p/podmatch-vs-matchmaker-fm/) ·
  [G2: MatchMaker.fm pricing](https://www.g2.com/products/matchmaker-fm/pricing)
- [Semrush: press release SEO](https://www.semrush.com:443/blog/press-release-seo) ·
  [ContentGrip: press release SEO](https://www.contentgrip.com/press-release-seo/) ·
  [Business Wire: press releases and SEO](https://www.businesswire.com/blog/everything-you-need-to-know-about-press-releases-and-seo)

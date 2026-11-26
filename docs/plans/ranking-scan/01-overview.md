# Ranking scan · 01 · Overview

## What it is

A **Ranking now** tab on the client's Rankings page. It lists every keyword the client's website (and Maps listing) already shows up for, and judges each one:

- **Keep** · **Quick win** · **Brand** · **Watch** · **Not useful**.

Good keywords are then protected from being swapped out as "weak", and the best untracked ones can be tracked in one click.

## Decisions

| Question | Answer |
|---|---|
| Sources | DataForSEO (Labs `ranked_keywords`), Google Search Console through Zernio, Google Business Profile search keywords through Zernio. Every row has a **Source** column |
| When | Automatically once a month (onboarding and active clients), plus **Scan now** (4 a client a month) |
| Search Console window | The last 3 months, ending at the latest complete day |
| Connecting Search Console | The team (signed in with the agency Google account the client added as a Restricted user) or the client through a Zernio link |
| Who | Everyone who sees Rankings can view. Scan now, Track and the settings: admins and managers (`rankings.manage`). Connecting: `connections.manage` |

## How it fits

```
Connections ─ Search data card ─► Zernio googlesearchconsole account ─┐
Connections ─ Google Business Profile (existing) ─────────────────────┤
clients.website + DataForSEO ─────────────────────────────────────────┤
                                                                      ▼
Scan now / monthly cron / first connect ─► rank_scans ─► scan.ts pipeline
   1 DataForSEO   2 Search Console   3 Business Profile   4 merge + fill + verdicts
                                                                      ▼
                                rank_scan_keywords ─► Ranking now tab
                                                    ├► Keywords tab: "Ranking well", never weak
                                                    ├► Research: sources + reuse
                                                    └► Overview: "ranks for N keywords"
```

## Phases

| # | Phase |
|---|---|
| 1 | These docs |
| 2 | Phase 0 live checks (needs your yes): connect Search Console on a test client; Zernio answer shapes; one DataForSEO scan |
| 3 | Database `0061`–`0063` |
| 4 | Search Console connection (Connections → Search data) |
| 5 | Source clients, merging and verdicts (pure, tested) |
| 6 | The scan pipeline, cron, notifications |
| 7 | The Ranking now tab and the Settings section |
| 8 | Keep protection, research reuse, the Overview line, docs, push |

## Later

- City checks for the top Keep and Quick-win keywords before tracking them.
- Page-level reports.
- Search Console sitemaps and URL inspection.
- GA4.

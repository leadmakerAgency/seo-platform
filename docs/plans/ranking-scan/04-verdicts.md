# Ranking scan · 04 · Verdicts

Code: `src/features/rankings/scan-verdicts.ts`, pure. It is checked by `scripts/ranking-scan-check.ts`.

## Facts per keyword

| Fact | Where it comes from |
|---|---|
| `position` | Search Console's average when it has ≥ 10 impressions, else DataForSEO's, else Search Console's |
| `demand` | The city volume. When that's missing, national volume ÷ 4 (a rough city share). Also compared: monthly Search Console impressions (3-month impressions ÷ 3) |
| `clicks` | Search Console clicks in the 3 months |
| `reach` | Business Profile monthly reach |
| `relevant` | Matches a topic term (`topicOf`), or is a brand search, or has buying/comparing intent, or ranks ≤ 20 |
| `excluded` | Has an excluded term (`hasNegative`), or DataForSEO marks it as another language |
| `brand` | Contains the domain stem (e.g. `novachkidev`), the client's full name, or a brand term from Settings (each ≥ 4 characters) |

## Rules (first match wins)

| Verdict | When |
|---|---|
| **Not useful** (`skip`) | Excluded; or informational intent that matches no topic and isn't a brand search; or no demand at all (volume < 10, impressions < 10 a month, no clicks, no Maps reach) |
| **Brand** (`brand`) | A brand search |
| **Keep** (`keep`) | Position ≤ 10 with demand (volume ≥ 10, ≥ 20 impressions a month, or ≥ 3 clicks); or ≥ 10 clicks in 3 months at any position; or Maps reach ≥ 50 a month |
| **Quick win** (`quick_win`) | Position 11–20 with demand (volume ≥ 20 or ≥ 50 impressions a month); or Maps reach 15–49 a month |
| **Watch** (`watch`) | Everything else: relevant, but ranked 21+ or with small demand |

## Flags

- **Rarely clicked (`low_ctr`):** ≥ 300 impressions, position ≤ 10, and CTR under half the expected rate:

  | Position | 1 | 2 | 3 | 4 | 5 | 6–10 |
  |---|---|---|---|---|---|---|
  | Expected rate | 28% | 15% | 10% | 7% | 5% | 3% |

  Shown as "Seen but rarely clicked: improve the title and description".
- **New:** not in the previous scan.
- **Lost:** in the previous scan as Keep or Quick win, but not in this one.

## Score

`scoreKeyword` (volume, intent, ease, value, quick win) plus a clicks bonus (clicks ÷ 2, at most 15), capped at 100. It's used for sorting only.

## Reasons (stored with each row, shown on hover)

- "Position 3 on Google (Search Console, 3-month average)"
- "#4 on Google in the United States (DataForSEO)"
- "41 clicks and 1,250 impressions in 3 months"
- "90 searches a month in Phoenix"
- "Seen by 60 people a month on the Maps listing"
- "Has an excluded word" · "Another language" · "Searching for information, not a business"

## Examples

| Keyword | Facts | Verdict |
|---|---|---|
| "emergency plumber phoenix" | Search Console position 3.2, 41 clicks, 90 a month | Keep |
| "water heater repair" | DataForSEO #14, 320 a month | Quick win |
| "novachkidev" | Brand stem | Brand |
| "plumber jobs" | Excluded word "jobs" | Not useful |
| "how to fix a leaky faucet" | Informational, no topic match | Not useful |
| "drain cleaning mesa" | Search Console position 34, 12 impressions a month | Watch |

## Keep protection (the Keywords tab)

- **No weak flag:** a tracked keyword whose latest scan verdict is Keep never gets weak reasons. It gets a "Ranking well" badge with its reasons instead.
- **No swaps:** `suggestSwaps` skips tracked keywords judged Keep or Quick win.
- **Warnings:** the Replace and Stop tracking dialogs show the scan's numbers before removing a Keep keyword.

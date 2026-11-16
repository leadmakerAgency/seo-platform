# Backlinks phase 3: Check site strength

Part of the Backlinks plan (`00-overview.md`).

## Flow

1. **Check site strength** (selected places, or every waiting and approved place) →
   `checkSiteStrength` action (`backlinks.strength`) → `request_strength_check`: role, `force`
   for managers only, one running per client, 10-minute throttle, budgets, access not denied.
   Returns the `rank_target`s never checked or older than 30 days (all with `force`), ≤ 1,000.
2. `bulkRanks` (`one_thousand`) and `bulkSpamScore` in parallel, `ref` = check id.
3. `dfs_store_strength`: updates `directories` (`authority_raw`, `spam_score`,
   `authority_checked_at`; missing → `no_data`) and closes the check. `authority` (0–100) is a
   generated column: `round(sin(raw / 636.62) * 100)`, DataForSEO's own `one_hundred` formula.
4. Strength belongs to the site, so one check serves every client.

## Bands

| Band      | Authority (0–100) | Tone    |
| --------- | ----------------- | ------- |
| Strong    | ≥ 60              | success |
| Good      | 35–59             | brand   |
| Fair      | 15–34             | neutral |
| Weak      | < 15              | warning |
| Spam risk | spam ≥ 60         | danger  |
| Check     | spam 30–59        | warning |

Calibrate on about 30 real local sites after the first checks and adjust `constants.ts`.

## Access

`40204` (Backlinks not active on the DataForSEO account) → `dfs_settings.backlinks_access =
'denied'`; the button is disabled with "Backlinks API access isn't active. An admin can turn it
on in DataForSEO". A successful call sets it back to `ok`.

## Done when

google.com / yelp.com / bbb.org come back close to 100 / 93 / 91; a re-check within 30 days
calls nothing; a forced re-check does; a double click makes one call; denied access disables the
button with the message.

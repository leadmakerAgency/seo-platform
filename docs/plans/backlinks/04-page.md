# Backlinks phase 4: the page and the rest of the app

Part of the Backlinks plan (`00-overview.md`). Follows `docs/design-system.md`.

## `/clients/[slug]/backlinks` (`?tab=review|approved|rejected|hidden`)

- **Header**: where the searches run from and the last search (searches, cost); **Find places**
  and **Check site strength**, each disabled with its reason; "How scores work".
- **Running**: "Searching Google: 12 of 25"; the page refreshes every 5 s while a run is open.
- **StatStrip**: Waiting for review, Approved (vs the monthly target), Rejected, Strength checked.
- **Table**: select, #, Site (+ Core listing), Type, Why chosen, Site strength, Spam, Found page,
  Score, Found. Best first, with a line after the client's target (20). Bulk Approve,
  Reject…, Check site strength.
- **Row sheet**: strength, every search that found it (position + link), snippet, site details
  (type, submit URL, cost; managers edit or block for all clients), decision, notes, Restore.
- **Hidden**: filtered places with their reason and Restore.
- **Empty states**: no search yet, no city, location not resolved, nothing to review.

## Elsewhere

- `navigation.ts`: Backlinks `comingSoon: false`.
- `roles.ts`: `backlinks.discover`, `backlinks.strength`, `backlinks.review` (admin, manager, va),
  `backlinks.library` (admin, manager).
- `activity.ts`: `backlink.discovery_finished`, `backlink.reviewed`, `backlink.strength_checked`,
  `backlink.directory_blocked`, `backlink.directory_unblocked`.
- Bell: `backlinks_found`.
- `docs/architecture.md` Backlinks section; `CLAUDE.md` rule.

## Done when

Lint, typecheck and build pass; manager, VA (with and without a task for the client) and viewer
each see the right things; dark mode and 375 px checked; live test.

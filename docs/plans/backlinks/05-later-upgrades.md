# Backlinks: later upgrades (not built yet)

Part of the Backlinks plan (`00-overview.md`). The foundation leaves room for each of these.

- **VA work per approved place**: a task with steps (open the submit URL, use the NAP from the
  approved business profile, logins from the vault), assigned from the Approved tab.
- **Submissions**: a separate `backlinks` table (one per approved opportunity: submitted, live,
  failed, listing URL, cost). When a listing goes live it inserts one `work_items` row
  (`source = 'backlink'`, `source_id` = the backlink id) and deletes it if undone; turn
  `counts_as` off on backlink tasks then, so nothing counts twice.
- **Live-check**: a daily job fetches listing URLs (SSRF-safe: http(s) only, no private IPs,
  timeouts, size caps) and checks that the name, address and phone match.
- **Directory library page** (agency level): search, filter by type/state/city/industry, edit
  tags, submit URLs and cost, block and unblock.
- **Competitor gaps**: `backlinks/domain_intersection` / `referring_domains` on the client's
  competitors, to find directories they're listed on and the client isn't.
- **Several cities** for service-area businesses (each resolved with `resolveCity`).
- **Monthly plan**: pick 20 approved places a month against `clients.backlinks_target`.
- **Automatic searches** for new clients, with a per-tick cap and the Backlinks sub-budget.

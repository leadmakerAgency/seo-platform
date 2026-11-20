// Phase 0 probe for Shockwave AI Search (docs/plans/backlinks/08-shockwave-ai-search.md).
// Checks which web tool versions Claude Haiku 5.5 accepts, and what the usage fields report.
// Cost: at most 4 web searches ($0.04) plus a few thousand Haiku tokens (well under $0.01).
//
// Run from the project folder, with ANTHROPIC_API_KEY in .env.local:
//   node --env-file=.env.local scripts/ai-search-phase0-probe.mjs
// The key is read from the environment and never printed.

import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-haiku-5-5"
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (never commit it).")
  process.exit(1)
}
const client = new Anthropic({ maxRetries: 1, timeout: 120_000 })

const results = []
const record = (name, data) => {
  results.push({ name, ...data })
  console.log(`\n== ${name}`)
  console.log(JSON.stringify(data, null, 2))
}

// 1. What the Models API says about server tools for Haiku 5.5.
try {
  const m = await client.models.retrieve(MODEL)
  record("models.retrieve", {
    id: m.id,
    server_tools: m.capabilities?.server_tools ?? "(no capabilities.server_tools field)",
  })
} catch (e) {
  record("models.retrieve", { error: String(e?.message ?? e) })
}

// 2. Web search, newest to oldest version: one search each, local to Toronto, own domain blocked.
const search = (type, extra = {}) =>
  client.messages.create({
    model: MODEL,
    max_tokens: 800,
    output_config: { effort: "low" },
    tools: [
      {
        type,
        name: "web_search",
        max_uses: 1,
        user_location: { type: "approximate", country: "CA", city: "Toronto", timezone: "America/Toronto" },
        blocked_domains: ["example.com"],
        ...extra,
      },
    ],
    messages: [
      {
        role: "user",
        content:
          "Search once for: best web design agencies Toronto list. Then reply with the 3 result URLs only, one per line.",
      },
    ],
  })

for (const [type, extra] of [
  ["web_search_20260318", { allowed_callers: ["direct"] }],
  ["web_search_20260209", { allowed_callers: ["direct"] }],
  ["web_search_20260209", {}],
  ["web_search_20250305", {}],
]) {
  const label = `${type}${extra.allowed_callers ? " (direct)" : ""}`
  try {
    const r = await search(type, extra)
    record(label, {
      accepted: true,
      stop_reason: r.stop_reason,
      usage: r.usage,
      blocks: r.content.map((b) => b.type),
      text: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").slice(0, 400),
    })
    break // the newest accepted version is enough
  } catch (e) {
    record(label, { accepted: false, status: e?.status, error: String(e?.message ?? e).slice(0, 300) })
  }
}

// 3. Web fetch on a URL given in the prompt (fetch only works on URLs already in context).
for (const type of ["web_fetch_20260318", "web_fetch_20250910"]) {
  try {
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      output_config: { effort: "low" },
      tools: [{ type, name: "web_fetch", max_uses: 1, max_content_tokens: 2000, ...(type.endsWith("0318") ? { allowed_callers: ["direct"] } : {}) }],
      messages: [{ role: "user", content: "Fetch https://www.iana.org/help/example-domains and give its page title only." }],
    })
    record(type, {
      accepted: true,
      stop_reason: r.stop_reason,
      usage: r.usage,
      text: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").slice(0, 200),
    })
    break
  } catch (e) {
    record(type, { accepted: false, status: e?.status, error: String(e?.message ?? e).slice(0, 300) })
  }
}

console.log("\n== Summary")
for (const r of results) console.log(`${r.name}: ${r.accepted === false ? "REJECTED" : r.error ? "ERROR" : "ok"}`)

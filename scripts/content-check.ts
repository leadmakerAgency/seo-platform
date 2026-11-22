import assert from "node:assert/strict"

import { buildPostBody, sendKey } from "../src/features/content/body"
import { articleChecks, checkTarget, slugify, wordsOf } from "../src/features/content/constants"
import { cleanArticleHtml } from "../src/features/content/sanitize"
import { utcToZoned, wallClock, zonedToUtc } from "../src/features/content/time"
import { articleFields, platformResults } from "../src/lib/zernio/content-schemas"

let n = 0
const ok = (name: string, fn: () => void) => {
  fn()
  n++
  console.log("ok", name)
}

ok("time zones", () => {
  assert.equal(zonedToUtc("2026-11-22", "09:30", "America/Phoenix"), "2026-11-22T16:30:00.000Z")
  assert.equal(zonedToUtc("2026-07-01", "09:00", "America/New_York"), "2026-07-01T13:00:00.000Z")
  assert.equal(zonedToUtc("2026-12-01", "09:00", "America/New_York"), "2026-12-01T14:00:00.000Z")
  assert.deepEqual(utcToZoned("2026-11-22T16:30:00.000Z", "America/Phoenix"), { date: "2026-11-22", time: "09:30" })
  assert.equal(wallClock("2026-11-22T16:30:00.000Z", "America/Phoenix"), "2026-11-22T09:30:00")
  assert.equal(zonedToUtc("bad", "09:00", "UTC"), null)
})

ok("platform rules", () => {
  const img = { id: "a", kind: "image" as const, mime: "image/png", altText: "x" }
  const vid = { id: "b", kind: "video" as const, mime: "video/mp4", altText: null }
  const errors = (...a: Parameters<typeof checkTarget>) => checkTarget(...a).filter((i) => i.level === "error").map((i) => i.message)
  assert.equal(errors("instagram", "hi", [], {}).length, 1)
  assert.equal(errors("instagram", "hi", [img], {}).length, 0)
  assert.ok(errors("googlebusiness", "hi", [vid], {}).length >= 1)
  assert.ok(errors("googlebusiness", "hi", [img, { ...img, id: "c" }], {}).length >= 1)
  assert.ok(errors("youtube", "desc", [vid], {}).some((m) => m.includes("title")))
  assert.equal(errors("youtube", "desc", [vid], { title: "T" }).length, 0)
  assert.ok(errors("twitter", "x".repeat(281), [], {}).some((m) => m.includes("over")))
  assert.ok(errors("twitter", "hi", [img, vid], {}).some((m) => m.includes("mix")))
  assert.ok(errors("tiktok", "hi", [vid], {}).some((m) => m.includes("consent")))
  assert.ok(errors("pinterest", "hi", [img], {}).some((m) => m.includes("board")))
  assert.ok(errors("linkedin", "hi", [{ id: "d", kind: "document", mime: "application/pdf", altText: null }], {}).length === 0)
  assert.ok(errors("facebook", "hi", [{ id: "d", kind: "document", mime: "application/pdf", altText: null }], {}).length === 1)
  assert.ok(checkTarget("twitter", "see https://x.com", [], {}).some((i) => i.message.includes("$0.20")))
})

ok("zernio body", () => {
  const media = new Map([
    ["m1", { kind: "image" as const, url: "https://cdn/1.png", altText: "Alt" }],
    ["m2", { kind: "image" as const, url: "https://cdn/2.png", altText: null }],
  ])
  const body = buildPostBody({
    postId: "p1",
    clientId: "c1",
    content: "Main",
    mediaIds: ["m1"],
    media,
    timezone: "America/Phoenix",
    scheduledFor: "2026-11-22T16:30:00.000Z",
    targets: [
      { zernioAccountId: "a1", platform: "facebook", customContent: null, customMediaIds: null, settings: {} },
      { zernioAccountId: "a2", platform: "googlebusiness", customContent: "Short", customMediaIds: ["m2"], settings: { ctaType: "LEARN_MORE", ctaUrl: "https://x.com" } },
      { zernioAccountId: "a3", platform: "youtube", customContent: "Main", customMediaIds: null, settings: { title: "Vid", visibility: "unlisted" } },
      { zernioAccountId: "a4", platform: "tiktok", customContent: null, customMediaIds: null, settings: { consent: true, privacy: "SELF_ONLY" } },
    ],
  })
  assert.equal(body.scheduledFor, "2026-11-22T09:30:00")
  assert.equal(body.timezone, "America/Phoenix")
  assert.equal(body.publishNow, undefined)
  assert.deepEqual(body.mediaItems, [{ type: "image", url: "https://cdn/1.png", altText: "Alt" }])
  assert.deepEqual(body.metadata, { content_post_id: "p1", client_id: "c1" })
  assert.equal(body.externalId, "p1")
  assert.equal(body.platforms[0].customContent, undefined)
  assert.equal(body.platforms[1].customContent, "Short")
  assert.deepEqual(body.platforms[1].customMedia, [{ type: "image", url: "https://cdn/2.png" }])
  assert.deepEqual(body.platforms[1].platformSpecificData, { callToAction: { type: "LEARN_MORE", url: "https://x.com" } })
  assert.equal(body.platforms[2].customContent, undefined, "same text as main is not repeated")
  assert.deepEqual(body.platforms[2].platformSpecificData, { title: "Vid", visibility: "unlisted" })
  assert.equal(body.tiktokSettings?.privacy_level, "SELF_ONLY")
  assert.equal(body.tiktokSettings?.express_consent_given, true)
  const now = buildPostBody({ postId: "p", clientId: "c", content: "x", mediaIds: [], media, timezone: "UTC", scheduledFor: null, targets: [] })
  assert.equal(now.publishNow, true)
  assert.equal(sendKey("post", "p", 3, "now"), "lm-post-p-v3-now")
})

ok("zernio parsing", () => {
  const r = platformResults({
    platforms: [
      { platform: "facebook", accountId: { _id: "a1" }, status: "published", platformPostUrl: "https://fb/1", platformPostId: 123 },
      { platform: "x", accountId: null, status: "failed" },
    ],
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].accountId, "a1")
  assert.equal(r[0].platformPostId, "123")
  assert.deepEqual(articleFields({ id: 12, link: "https://s/a", status: "publish" }), { id: "12", url: "https://s/a", status: "publish" })
  assert.equal(articleFields({ _id: "x", isPublished: false }).status, "draft")
})

ok("slugs and words", () => {
  assert.equal(slugify("Héllo, World & Friends!"), "hello-world-and-friends")
  assert.equal(slugify("---"), "")
  assert.equal(wordsOf("<p>One two</p><p>three&nbsp;four</p>"), 4)
  const checks = articleChecks({ title: "Plumber Phoenix tips", bodyHtml: '<p>x</p><img src="https://a">', featured: false, focusKeyword: "plumber phoenix", seoTitle: "", metaDescription: "" })
  assert.equal(checks.find((c) => c.label.startsWith("Focus"))?.ok, true)
  assert.equal(checks.find((c) => c.label.startsWith("Every image"))?.ok, false)
})

ok("html cleaning", () => {
  const dirty = `<h1>T</h1><p onclick="x()">Hi <a href="javascript:alert(1)">bad</a> <a href="https://ok.com" target="_blank">ok</a></p>
    <script>alert(1)</script><style>p{}</style><img src="http://insecure/x.png" onerror="x()"><img src="https://s/x.png" alt="A">
    <iframe src="https://evil"></iframe><p style="color:red">styled</p>`
  const clean = cleanArticleHtml(dirty)
  assert.ok(!/script|style=|onclick|onerror|javascript:|iframe|<style/i.test(clean), clean)
  assert.ok(clean.includes("<h2>T</h2>"), clean)
  assert.ok(clean.includes('href="https://ok.com"') && clean.includes('rel="noopener"'), clean)
  assert.ok(!clean.includes("http://insecure"), clean)
  assert.ok(clean.includes('<img src="https://s/x.png" alt="A" />') || clean.includes('<img src="https://s/x.png" alt="A">'), clean)
})

console.log(`${n} groups pass`)

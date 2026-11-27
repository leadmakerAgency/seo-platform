import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto"

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  configLinkFromIndexHtml,
  guessBlogCollection,
  parseCmsConfig,
  safePublicPath,
  safeRepoPath,
  type CmsCollection,
  type CmsConfig,
} from "../src/features/git-sites/config"
import { autoFieldMap, emptyRequired, excerptIsMeta, fieldDefaults, readFieldMap } from "../src/features/git-sites/field-map"
import {
  formatDate,
  imageExtension,
  isPublicSiteUrl,
  liveUrl,
  mediaPath,
  patternFromPermalink,
  patternFromPreviewPath,
  postPath,
  publicUrl,
  renderSlugTemplate,
  withSuffix,
} from "../src/features/git-sites/files"
import { composePost, parseFrontMatter } from "../src/features/git-sites/frontmatter"
import { normaliseTitle } from "../src/features/git-sites/deploy"
import { parseState } from "../src/features/git-sites/state"
import { htmlToMarkdown, imageSources, needsTemplateGuard, rewriteImages } from "../src/features/git-sites/markdown"
import { GitHub, GitHubError, signAppJwt, toGitHubError, verifyGitHubSignature, type FetchLike } from "../src/lib/github/core"
import { articleFromCommit, commitMessage, gitBlobSha } from "../src/lib/github/sha"

const FIXTURES = join(__dirname, "fixtures", "git-cms")
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8")
const asConfig = (r: CmsConfig | { error: string }): CmsConfig => {
  if ("error" in r) throw new Error(r.error)
  return r
}

/**
 * Pure checks for Git sites (docs/plans/git-cms/09-checks.md):
 *   npx tsx --conditions=react-server scripts/git-cms-check.ts
 * Nothing here calls GitHub: requests go to a mocked fetch.
 */

let n = 0
const ok = async (name: string, fn: () => void | Promise<void>) => {
  await fn()
  n++
  console.log("ok", name)
}

type Call = { method: string; path: string; body: unknown }
type Handler = (c: Call) => { status?: number; body?: unknown; headers?: Record<string, string> }

/** A fake api.github.com: records calls and answers from `handler`. */
function mock(handler: Handler) {
  const calls: Call[] = []
  const slept: number[] = []
  const fetchFn: FetchLike = async (url, init) => {
    const u = new URL(url)
    const c = { method: init.method ?? "GET", path: u.pathname + u.search, body: init.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(c)
    const r = handler(c)
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    })
  }
  const gh = new GitHub({ token: "t", fetch: fetchFn, sleep: async (ms) => void slept.push(ms) })
  return { gh, calls, slept }
}

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
})()

async function main() {
  await ok("blob sha = git hash-object", () => {
    assert.equal(gitBlobSha(""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")
    assert.equal(gitBlobSha("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a")
    const bin = Uint8Array.from([0, 255, 10, 13, 137, 80, 78, 71])
    if (hasGit) {
      const text = "---\ntitle: \"Café ☕\"\n---\n\nBody\n"
      assert.equal(gitBlobSha(text), execFileSync("git", ["hash-object", "--stdin"], { input: text }).toString().trim())
      assert.equal(gitBlobSha(bin), execFileSync("git", ["hash-object", "--stdin"], { input: Buffer.from(bin) }).toString().trim())
    }
    assert.equal(gitBlobSha(Buffer.from("hello\n")), gitBlobSha("hello\n"))
  })

  await ok("commit message trailer", () => {
    const id = "0b0e6e2c-3a65-4a4e-9d2f-4d2a1f0c9a11"
    const m = commitMessage("publish", "  My   post\ttitle ", id, 7)
    assert.ok(m.startsWith("Publish: My post title\n\n"))
    assert.deepEqual(articleFromCommit(m), { id, version: 7 })
    assert.equal(articleFromCommit("Update post"), null)
    assert.ok(commitMessage("update", "", id, 1).startsWith("Update: Untitled"))
  })

  await ok("app JWT (RS256)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString()
    const jwt = signAppJwt("123456", pem, 1_800_000_000)
    const [h, p, s] = jwt.split(".")
    assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "RS256", typ: "JWT" })
    assert.deepEqual(JSON.parse(Buffer.from(p, "base64url").toString()), { iat: 1_800_000_000 - 60, exp: 1_800_000_000 + 540, iss: "123456" })
    const v = createVerify("RSA-SHA256")
    v.update(`${h}.${p}`)
    assert.ok(v.verify(publicKey, Buffer.from(s, "base64url")))
    assert.ok(!/[=+/]/.test(jwt), "base64url without padding")
  })

  await ok("webhook signature", () => {
    const body = '{"action":"deleted"}'
    const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`
    assert.ok(verifyGitHubSignature("s3cret", body, sig))
    assert.ok(!verifyGitHubSignature("other", body, sig))
    assert.ok(!verifyGitHubSignature("s3cret", body + " ", sig))
    assert.ok(!verifyGitHubSignature("s3cret", body, null))
    assert.ok(!verifyGitHubSignature("s3cret", body, "sha1=abc"))
  })

  await ok("readable errors", () => {
    assert.equal(toGitHubError(401, {}).code, "auth")
    assert.equal(toGitHubError(403, { message: "Resource not accessible by integration" }).code, "forbidden")
    assert.equal(toGitHubError(404, {}).code, "not_found")
    assert.equal(toGitHubError(422, { message: "Update is not a fast forward" }).code, "conflict")
    assert.equal(toGitHubError(422, { message: "Protected branch update failed for refs/heads/main." }).code, "protected")
    assert.equal(toGitHubError(422, { message: "tree.path contains a malformed path component" }).code, "invalid")
    assert.equal(toGitHubError(403, {}, 120).code, "rate_limited")
    assert.ok(toGitHubError(403, {}, 120).message.includes("2 min"))
    assert.equal(toGitHubError(502, {}).code, "server")
  })

  await ok("GET retries 5xx, writes don't", async () => {
    let tries = 0
    const a = mock(() => (++tries < 3 ? { status: 502, body: {} } : { body: { id: 9, full_name: "o/r", default_branch: "main", permissions: { push: true } } }))
    const repo = await a.gh.getRepo("o", "r")
    assert.equal(repo.id, 9)
    assert.ok(repo.canPush)
    assert.equal(a.calls.length, 3)
    const b = mock(() => ({ status: 500, body: {} }))
    await assert.rejects(b.gh.request("PATCH", "/repos/o/r/git/refs/heads/main", { sha: "x" }), (e: unknown) => e instanceof GitHubError && e.code === "server")
    assert.equal(b.calls.length, 1)
  })

  await ok("rate limits: short wait retried once, long wait fails", async () => {
    let tries = 0
    const reset = String(Math.ceil(Date.now() / 1000) + 5)
    const a = mock(() =>
      ++tries === 1 ? { status: 403, body: { message: "API rate limit exceeded" }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset } } : { body: [] },
    )
    await a.gh.request("GET", "/x")
    assert.equal(a.calls.length, 2)
    assert.ok(a.slept[0] >= 1000 && a.slept[0] <= 6000)
    const b = mock(() => ({ status: 429, body: {}, headers: { "retry-after": "600" } }))
    await assert.rejects(b.gh.request("GET", "/x"), (e: unknown) => e instanceof GitHubError && e.code === "rate_limited" && e.retryAfterSec === 600)
    assert.equal(b.calls.length, 1)
  })

  await ok("token expiry header", async () => {
    const a = mock(() => ({ body: {}, headers: { "github-authentication-token-expiration": "2027-01-01 00:00:00 UTC" } }))
    await a.gh.request("GET", "/user")
    assert.equal(a.gh.tokenExpiresAt, "2027-01-01T00:00:00.000Z")
  })

  /** A tiny in-memory repo: branch head, trees and commits. */
  function repoMock(opts: { conflicts?: number; sameTree?: boolean } = {}) {
    let head = { commit: "c0".padEnd(40, "0"), tree: "t0".padEnd(40, "0") }
    let conflicts = opts.conflicts ?? 0
    let seq = 1
    const commits = new Map<string, string>()
    const m = mock(({ method, path, body }) => {
      const b = (body ?? {}) as Record<string, unknown>
      if (method === "GET" && path.includes("/git/ref/heads/")) return { body: { object: { sha: head.commit } } }
      if (method === "GET" && path.includes("/git/commits/")) return { body: { tree: { sha: commits.get(path.split("/").pop()!) ?? head.tree } } }
      if (method === "POST" && path.endsWith("/git/blobs")) return { status: 201, body: { sha: "b".repeat(40) } }
      if (method === "POST" && path.endsWith("/git/trees")) {
        return { status: 201, body: { sha: opts.sameTree ? (b.base_tree as string) : `t${seq++}`.padEnd(40, "0") } }
      }
      if (method === "POST" && path.endsWith("/git/commits")) {
        const sha = `c${seq++}`.padEnd(40, "0")
        commits.set(sha, b.tree as string)
        return { status: 201, body: { sha } }
      }
      if (method === "PATCH" && path.includes("/git/refs/heads/")) {
        if (conflicts > 0) {
          conflicts--
          head = { commit: `x${seq++}`.padEnd(40, "0"), tree: head.tree } // someone else pushed
          return { status: 422, body: { message: "Update is not a fast forward" } }
        }
        head = { commit: b.sha as string, tree: commits.get(b.sha as string)! }
        return { body: { object: { sha: b.sha } } }
      }
      return { status: 404, body: {} }
    })
    return { ...m, head: () => head }
  }

  const files = [
    { path: "content/posts/hello.md", content: "---\ntitle: \"Hello\"\n---\n\nHi\n" },
    { path: "content/media/hello.png", content: Uint8Array.from([137, 80, 78, 71, 1, 2, 3]) },
  ]

  await ok("commitFiles: one commit, text inline, binary as blob", async () => {
    const r = repoMock()
    const res = await r.gh.commitFiles({ owner: "o", repo: "r", branch: "main", files, message: "Publish: Hello" })
    assert.ok(res.commitSha)
    assert.equal(res.attempts, 1)
    assert.equal(r.head().commit, res.commitSha)
    assert.equal(r.calls.filter((c) => c.path.endsWith("/git/blobs")).length, 1)
    const tree = r.calls.find((c) => c.path.endsWith("/git/trees"))!.body as { tree: { path: string; content?: string; sha?: string }[] }
    assert.equal(tree.tree[0].content, files[0].content)
    assert.equal(res.blobs["content/posts/hello.md"], gitBlobSha(files[0].content))
  })

  await ok("commitFiles: unchanged binary isn't uploaded again; deletes", async () => {
    const r = repoMock()
    const existing = new Map([["content/media/hello.png", gitBlobSha(files[1].content)]])
    await r.gh.commitFiles({ owner: "o", repo: "r", branch: "main", files, deletes: ["content/posts/old.md"], message: "m", existing })
    assert.equal(r.calls.filter((c) => c.path.endsWith("/git/blobs")).length, 0)
    const tree = r.calls.find((c) => c.path.endsWith("/git/trees"))!.body as { tree: { path: string; sha?: string | null }[] }
    assert.deepEqual(tree.tree.find((e) => e.path === "content/posts/old.md")?.sha, null)
  })

  await ok("commitFiles: rebuilds on a moved branch, then gives up", async () => {
    const r = repoMock({ conflicts: 1 })
    const res = await r.gh.commitFiles({ owner: "o", repo: "r", branch: "main", files, message: "m" })
    assert.equal(res.attempts, 2)
    assert.equal(r.head().commit, res.commitSha)
    assert.equal(r.calls.filter((c) => c.path.endsWith("/git/blobs")).length, 1, "blobs uploaded once")
    const r2 = repoMock({ conflicts: 5 })
    await assert.rejects(
      r2.gh.commitFiles({ owner: "o", repo: "r", branch: "main", files, message: "m", maxAttempts: 3 }),
      (e: unknown) => e instanceof GitHubError && e.code === "conflict",
    )
    assert.equal(r2.calls.filter((c) => c.method === "PATCH").length, 3)
  })

  await ok("commitFiles: nothing changed → no commit", async () => {
    const r = repoMock({ sameTree: true })
    const res = await r.gh.commitFiles({ owner: "o", repo: "r", branch: "main", files, message: "m" })
    assert.equal(res.commitSha, null)
    assert.equal(r.calls.filter((c) => c.path.endsWith("/git/commits") && c.method === "POST").length, 0)
    assert.equal(r.calls.filter((c) => c.method === "PATCH").length, 0)
  })

  await ok("getFile: base64, large files via blobs, missing → null", async () => {
    const big = Buffer.from("x".repeat(10)).toString("base64")
    const a = mock(({ path }) => {
      if (path.startsWith("/repos/o/r/contents/content/posts/a%20b.md")) return { body: { type: "file", sha: "s1", size: 5, encoding: "base64", content: "aGVs\nbG8=" } }
      if (path.startsWith("/repos/o/r/contents/big.png")) return { body: { type: "file", sha: "s2", size: 2_000_000, encoding: "none", content: "" } }
      if (path === "/repos/o/r/git/blobs/s2") return { body: { content: big, encoding: "base64" } }
      return { status: 404, body: { message: "Not Found" } }
    })
    const f = await a.gh.getFile("o", "r", "content/posts/a b.md", "main")
    assert.equal(f?.content.toString(), "hello")
    assert.equal((await a.gh.getFile("o", "r", "big.png", "main"))?.content.toString(), "x".repeat(10))
    assert.equal(await a.gh.getFile("o", "r", "nope.md", "main"), null)
  })

  await ok("deployment status: Vercel production, Netlify commit status", async () => {
    const a = mock(({ path }) => {
      if (path.startsWith("/repos/o/r/deployments?")) return { body: [{ id: 1, environment: "Preview" }, { id: 2, environment: "Production", production_environment: true }] }
      if (path.startsWith("/repos/o/r/deployments/2/statuses")) return { body: [{ state: "success", environment_url: "https://site.test", log_url: "https://vercel.com/x" }] }
      if (path === "/repos/o/r/commits/abc/status") return { body: { state: "failure", statuses: [{ state: "failure", context: "netlify/site/deploy-preview", target_url: "https://app.netlify.com/x", description: "Build failed" }] } }
      return { body: [] }
    })
    const d = await a.gh.deploymentsFor("o", "r", "abc")
    assert.deepEqual(d, { state: "success", environment: "Production", url: "https://site.test", logUrl: "https://vercel.com/x", description: null })
    const s = await a.gh.combinedStatus("o", "r", "abc")
    assert.equal(s?.state, "failure")
    assert.equal(s?.description, "Build failed")
    const empty = mock(() => ({ body: [] }))
    assert.equal(await empty.gh.deploymentsFor("o", "r", "abc"), null)
  })

  await ok("installations: token limited to the repo, paging", async () => {
    const a = mock(({ method, path, body }) => {
      if (method === "POST" && path === "/app/installations/77/access_tokens") {
        assert.deepEqual(body, { repository_ids: [999] })
        return { status: 201, body: { token: "ghs_x", expires_at: "2026-11-27T12:00:00Z" } }
      }
      if (path.startsWith("/user/installations")) {
        const page = Number(new URL("https://x" + path).searchParams.get("page"))
        return { body: { installations: page === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) : [{ id: 777 }] } }
      }
      return { status: 404, body: {} }
    })
    assert.deepEqual(await a.gh.createInstallationToken(77, [999]), { token: "ghs_x", expiresAt: "2026-11-27T12:00:00Z" })
    const ids = await a.gh.userInstallationIds()
    assert.equal(ids.length, 101)
    assert.ok(ids.includes(777))
  })

  // ---- Phase 4: discovery and mapping --------------------------------------

  const sasdr = asConfig(parseCmsConfig(fixture("south-africa-sdr-config.yml"), "leadmakerAgency/South-Africa-SDR"))
  const posts = sasdr.collections[0]

  await ok("config: South Africa SDR", () => {
    assert.deepEqual(sasdr.backend, { name: "github", repo: "leadmakerAgency/South-Africa-SDR", branch: "main" })
    assert.deepEqual(sasdr.warnings, [])
    assert.equal(sasdr.collections.length, 1)
    assert.equal(posts.name, "posts")
    assert.equal(posts.label, "Blog Posts")
    assert.equal(posts.folder, "content/posts")
    assert.equal(posts.slug, "{{slug}}")
    assert.equal(posts.mediaFolder, "content/media")
    assert.equal(posts.publicFolder, "/media")
    assert.ok(posts.supported && posts.hasBody && posts.reason === null)
    const date = posts.fields.find((f) => f.name === "date")!
    assert.equal(date.widget, "datetime")
    assert.equal(date.format, "YYYY-MM-DD")
    assert.equal(posts.fields.find((f) => f.name === "hero_emoji")?.default, "📈")
    assert.equal(guessBlogCollection(sasdr)?.name, "posts")
    const other = asConfig(parseCmsConfig(fixture("south-africa-sdr-config.yml"), "someone/else"))
    assert.equal(other.warnings.length, 1)
  })

  await ok("config: Decap variants and refusals", () => {
    const yml = `
backend: { name: github, repo: acme/site, branch: develop }
media_folder: "/static/img"
public_folder: "/img"
collections:
  - name: pages
    label: Pages
    files: [{ name: about, file: content/about.md, fields: [{ name: title, widget: string }] }]
  - name: blog
    label: Blog
    folder: content/blog
    media_folder: images
    public_folder: images
    create: true
    preview_path: "blog/{{slug}}"
    fields:
      - { name: title, widget: string }
      - { name: pubDate, widget: datetime }
      - { name: published, widget: boolean, default: true }
      - { name: description, widget: text }
      - { name: cover, widget: image }
      - { name: categories, widget: list }
      - { name: author, widget: string, required: true }
      - { name: layout, widget: hidden, default: post }
      - { name: body, widget: markdown }
  - { name: news, folder: content/news, i18n: true, fields: [] }
  - { name: docs, folder: content/docs, extension: toml, format: toml-frontmatter, fields: [] }
  - { name: bad, folder: "../outside", fields: [] }
  - { name: deep, folder: content/deep, path: "{{year}}/{{slug}}", fields: [] }
`
    const cfg = asConfig(parseCmsConfig(yml, "acme/site"))
    assert.equal(cfg.mediaFolder, "static/img")
    assert.equal(cfg.backend.branch, "develop")
    const by = (n: string) => cfg.collections.find((c) => c.name === n)!
    assert.equal(by("pages").supported, false)
    assert.equal(by("news").supported, false)
    assert.equal(by("docs").supported, false)
    assert.equal(by("bad").supported, false)
    assert.equal(by("deep").supported, false)
    const blog = by("blog")
    assert.ok(blog.supported)
    assert.equal(blog.mediaFolder, "content/blog/images")
    assert.equal(blog.publicFolder, "/images")
    assert.equal(guessBlogCollection(cfg)?.name, "blog")
    assert.equal(patternFromPreviewPath(blog.previewPath), "/blog/{slug}/")

    const map = autoFieldMap(blog)
    assert.equal(map.date, "pubDate")
    assert.deepEqual(map.draft, { name: "published", invert: true })
    assert.equal(map.excerpt, "description")
    assert.equal(map.metaDescription, null, "description is taken by the excerpt")
    assert.equal(map.featuredImage, "cover")
    assert.equal(map.tags, "categories")
    assert.equal(map.author, "author")
    assert.deepEqual(fieldDefaults(blog, map), { layout: "post" })
    assert.deepEqual(emptyRequired(blog, map), [])
    assert.ok(excerptIsMeta(map))

    assert.ok("error" in parseCmsConfig("backend: { name: gitlab }\ncollections: []"))
    assert.ok("error" in parseCmsConfig("backend: [unclosed"))
    assert.ok("error" in parseCmsConfig("collections: []"))
  })

  await ok("paths are kept inside the repo", () => {
    assert.equal(safeRepoPath("/content/posts/"), "content/posts")
    assert.equal(safeRepoPath("content//posts"), "content/posts")
    assert.equal(safeRepoPath("../etc"), null)
    assert.equal(safeRepoPath("content/../etc"), null)
    assert.equal(safeRepoPath("C:\\Windows"), null)
    assert.equal(safeRepoPath(""), "")
    assert.equal(safePublicPath("media"), "/media")
    assert.equal(safePublicPath("/media/"), "/media")
    assert.equal(safePublicPath("/a/../b"), null)
    assert.equal(configLinkFromIndexHtml('<link href="config.yml" type="text/yaml" rel="cms-config-url">'), "admin/config.yml")
    assert.equal(configLinkFromIndexHtml('<link rel="cms-config-url" href="/cms/site.yml">', "public/admin/index.html"), "cms/site.yml")
    assert.equal(configLinkFromIndexHtml('<link rel="cms-config-url" href="https://evil.test/x.yml">'), null)
  })

  await ok("field map: South Africa SDR", () => {
    const map = autoFieldMap(posts)
    assert.deepEqual(map, {
      title: "title",
      slug: "slug",
      date: "date",
      draft: { name: "draft", invert: false },
      excerpt: "excerpt",
      metaDescription: null,
      seoTitle: null,
      featuredImage: "featured_image",
      imageAlt: null,
      tags: "tags",
      author: null,
    })
    assert.ok(excerptIsMeta(map), "excerpt doubles as the meta description")
    assert.deepEqual(fieldDefaults(posts, map), { hero_emoji: "📈" })
    assert.deepEqual(emptyRequired(posts, map), [])
    assert.deepEqual(readFieldMap(JSON.parse(JSON.stringify(map))), map)
    assert.deepEqual(readFieldMap({ title: 5, draft: { name: "" }, junk: "x" }).title, null)
  })

  await ok("slug templates, files, media, URLs", () => {
    const date = new Date("2026-11-27T22:30:05Z")
    const v = { slug: "my-post", title: "My Post: Ünïcode!", date }
    assert.equal(renderSlugTemplate("{{slug}}", v), "my-post")
    assert.equal(renderSlugTemplate("{{year}}-{{month}}-{{day}}-{{slug}}", v), "2026-11-27-my-post")
    assert.equal(renderSlugTemplate("{{ title }}", v), "my-post-unicode")
    assert.equal(renderSlugTemplate("{{fields.slug}}", v), "my-post")
    assert.equal(renderSlugTemplate("../{{slug}}/x", v), "my-post-x")
    assert.equal(renderSlugTemplate("{{unknown}}", v), "my-post")
    assert.equal(postPath("content/posts", "my-post"), "content/posts/my-post.md")
    assert.equal(postPath("../x", "my-post"), null)
    assert.equal(withSuffix("content/posts/my-post.md", 2), "content/posts/my-post-2.md")
    assert.equal(withSuffix("content/posts/my-post.md", 1), "content/posts/my-post.md")
    assert.equal(mediaPath("content/media", "my-post", 1, "png"), "content/media/my-post.png")
    assert.equal(mediaPath("content/media", "my-post", 3, "jpg"), "content/media/my-post-3.jpg")
    assert.equal(publicUrl("/media", "my-post.png"), "/media/my-post.png")
    assert.equal(publicUrl("", "x.png"), "/x.png")
    assert.equal(imageExtension("image/jpeg"), "jpg")
    assert.equal(imageExtension(null, "photo.JPEG?x=1"), "jpg")
    assert.equal(imageExtension("application/pdf", "doc.pdf"), null)
    assert.equal(liveUrl("https://southafricasdr.com", "/blog/{slug}/", { slug: "my-post", date }), "https://southafricasdr.com/blog/my-post/")
    assert.equal(liveUrl("https://a.test", "/{year}/{month}/{slug}.html", { slug: "x", date }), "https://a.test/2026/11/x.html")
    assert.equal(liveUrl("https://a.test/", "/blog/{slug}/", { slug: "x", date }), null)
    assert.equal(liveUrl("https://a.test", "/blog/{oops}/", { slug: "x", date }), null)
  })

  await ok("dates are UTC (a Sydney evening is never a future date)", () => {
    // 09:30 on the 28th in Sydney = 22:30 on the 27th UTC: the build compares against UTC.
    const d = new Date("2026-11-27T22:30:05.123Z")
    assert.equal(formatDate(d, "YYYY-MM-DD"), "2026-11-27")
    assert.equal(formatDate(d, null), "2026-11-27T22:30:05.123Z")
    assert.equal(formatDate(d, "YYYY-MM-DD[T]HH:mm:ssZ"), "2026-11-27T22:30:05+00:00")
    assert.equal(formatDate(d, "DD.MM.YYYY HH:mm"), "27.11.2026 22:30")
  })

  await ok("existing post: front matter and URL pattern", () => {
    const parsed = parseFrontMatter(fixture("south-africa-sdr-post.md"))!
    assert.equal(parsed.data.title, "Africa SDR Pipeline Generation Guide for Consistent Leads")
    assert.equal(parsed.data.date, "2026-10-05T14:02:28.323Z")
    assert.ok(parsed.body.startsWith("\nThere is a moment") || parsed.body.startsWith("There is a moment"))
    assert.equal(patternFromPermalink(parsed.data.permalink, parsed.data.slug), "/blog/{slug}/")
    assert.equal(parseFrontMatter("no front matter"), null)
  })

  await ok("HTML → Markdown (every tag the sanitizer allows)", () => {
    const html = [
      "<h2>Why it matters</h2><h3>Sub</h3><h4>Small</h4>",
      '<p>Text with <strong>bold</strong>, <em>italic</em>, <u>under</u>, <s>gone</s> and <a href="https://x.test/a">a link</a>.<br>Next line.</p>',
      "<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><ol><li>First</li><li>Second</li></ol>",
      "<blockquote><p>Quote</p></blockquote><p>Use <code>npm run build</code>.</p><pre><code>const a = 1\n</code></pre><hr>",
      '<p><img src="https://cdn.test/a.png" alt="A chart"></p>',
      '<figure><img src="https://cdn.test/b.png" alt="B"><figcaption>Caption</figcaption></figure>',
      "<table><thead><tr><th>Plan</th><th>Price</th></tr></thead><tbody><tr><td>Basic</td><td>$10</td></tr></tbody></table>",
    ].join("")
    const md = htmlToMarkdown(html)
    for (const want of [
      "## Why it matters",
      "### Sub",
      "#### Small",
      "**bold**",
      "_italic_",
      "<u>under</u>",
      "~gone~",
      "[a link](https://x.test/a)",
      "  \nNext line.",
      "- One\n    - Nested\n- Two",
      "1. First\n2. Second",
      "> Quote",
      "`npm run build`",
      "```\nconst a = 1",
      "---",
      "![A chart](https://cdn.test/a.png)",
      "<figure>",
      "<figcaption>Caption</figcaption>",
      "| Plan | Price |",
      "| Basic | $10 |",
    ]) {
      assert.ok(md.includes(want), `missing ${JSON.stringify(want)} in:\n${md}`)
    }
    assert.ok(md.endsWith("\n") && !md.endsWith("\n\n"))
    assert.equal(htmlToMarkdown(""), "")

    assert.deepEqual(imageSources(html), ["https://cdn.test/a.png", "https://cdn.test/b.png"])
    const moved = rewriteImages(html, { "https://cdn.test/a.png": "/media/my-post-2.png" })
    assert.ok(htmlToMarkdown(moved).includes("![A chart](/media/my-post-2.png)"))
    assert.ok(moved.includes("https://cdn.test/b.png"), "other images untouched")

    assert.ok(needsTemplateGuard("Use {{ name }} here"))
    assert.ok(needsTemplateGuard("{% if x %}"))
    assert.ok(needsTemplateGuard("{# note #}"))
    assert.ok(!needsTemplateGuard("Prices {from} $10 and {50%} off"))
  })

  const input = (over: Partial<Parameters<typeof composePost>[0]> = {}) => ({
    title: 'SDR pricing: "real" costs #2026 ☕',
    slug: "sdr-pricing",
    excerpt: "The short excerpt.",
    metaDescription: "Meta: what SDRs cost in 2026.",
    seoTitle: "SDR pricing 2026",
    tags: ["sdr", "pricing", "sdr", " "],
    author: "Jane",
    featuredImage: "/media/sdr-pricing.png",
    imageAlt: null,
    date: new Date("2026-11-27T22:30:00Z"),
    draft: false,
    markdown: "## Intro\n\nBody text.\n",
    ...over,
  })

  await ok("post file: South Africa SDR front matter", () => {
    const map = autoFieldMap(posts)
    const post = composePost(input(), posts, map)
    assert.deepEqual(post.data, {
      title: 'SDR pricing: "real" costs #2026 ☕',
      slug: "sdr-pricing",
      date: "2026-11-27",
      draft: false,
      excerpt: "Meta: what SDRs cost in 2026.",
      featured_image: "/media/sdr-pricing.png",
      tags: ["sdr", "pricing"],
      hero_emoji: "📈",
    })
    assert.ok(!post.guarded)
    assert.ok(post.text.startsWith('---\ntitle: "SDR pricing: \\"real\\" costs #2026 ☕"\nslug: "sdr-pricing"\ndate: "2026-11-27"\ndraft: false\n'))
    assert.ok(post.text.includes('tags:\n  - "sdr"\n  - "pricing"\n'))
    assert.ok(post.text.endsWith("---\n\n## Intro\n\nBody text.\n"))
    const back = parseFrontMatter(post.text)!
    assert.deepEqual(back.data, post.data, "round-trips through YAML")
    assert.equal(back.body, "## Intro\n\nBody text.\n")

    const noMeta = composePost(input({ metaDescription: null }), posts, map)
    assert.equal(noMeta.data.excerpt, "The short excerpt.")
    const noImage = composePost(input({ featuredImage: null, tags: [] }), posts, map)
    assert.ok(!("featured_image" in noImage.data) && !("tags" in noImage.data))
    const draft = composePost(input({ draft: true }), posts, map)
    assert.equal(draft.data.draft, true)
  })

  await ok("post file: other sites, the template guard", () => {
    const blog: CmsCollection = asConfig(
      parseCmsConfig(`backend: { name: github }
collections:
  - name: blog
    folder: content/blog
    fields:
      - { name: title, widget: string }
      - { name: date, widget: datetime }
      - { name: published, widget: boolean }
      - { name: summary, widget: text }
      - { name: meta_description, widget: text }
      - { name: seo_title, widget: string }
      - { name: image, widget: image }
      - { name: image_alt, widget: string }
      - { name: keywords, widget: string }
      - { name: authors, widget: list }
      - { name: body, widget: markdown }
`),
    ).collections[0]
    const map = autoFieldMap(blog)
    const post = composePost(input({ markdown: "Use {{ name }} in templates.\n" }), blog, map)
    assert.deepEqual(post.data, {
      title: 'SDR pricing: "real" costs #2026 ☕',
      date: "2026-11-27T22:30:00.000Z",
      published: true,
      summary: "The short excerpt.",
      meta_description: "Meta: what SDRs cost in 2026.",
      seo_title: "SDR pricing 2026",
      image: "/media/sdr-pricing.png",
      image_alt: 'SDR pricing: "real" costs #2026 ☕',
      keywords: "sdr, pricing",
      authors: ["Jane"],
      templateEngineOverride: "md",
    })
    assert.ok(post.guarded)
    assert.deepEqual(parseFrontMatter(post.text)!.data, post.data)
  })

  // ---- Phase 5: connecting ------------------------------------------------

  await ok("only public https sites are fetched", () => {
    for (const good of ["https://southafricasdr.com/blog/x/", "https://www.example.co.uk/a", "https://blog.acme.io:443/x"]) {
      assert.ok(isPublicSiteUrl(good), good)
    }
    for (const bad of [
      "http://southafricasdr.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://169.254.169.254/latest",
      "https://10.0.0.5/x",
      "https://intranet/x",
      "https://db.internal/x",
      "https://printer.local/x",
      "https://user:pw@site.com/x",
      "https://site.com:8443/x",
      "not a url",
    ]) {
      assert.ok(!isPublicSiteUrl(bad), bad)
    }
  })

  await ok("install state: <attempt id>.<64 hex key>", () => {
    const id = "0b0e6e2c-3a65-4a4e-9d2f-4d2a1f0c9a11"
    const key = "a".repeat(64)
    assert.deepEqual(parseState(`${id}.${key}`), { attemptId: id, key })
    assert.deepEqual(parseState(`${id.toUpperCase()}.${key.toUpperCase()}`), { attemptId: id, key })
    assert.equal(parseState(`${id}.${key}x`), null)
    assert.equal(parseState(`${id}`), null)
    assert.equal(parseState("../../etc"), null)
    assert.equal(parseState(null), null)
  })

  // ---- Phase 6: the publishing pipeline, end to end against a fake repo and database ----

  await ok("live check: title matching", () => {
    assert.equal(normaliseTitle("SDR &amp; Sales: “Costs” in&nbsp;2026"), 'sdr & sales: "costs" in 2026')
    assert.equal(normaliseTitle("It&#39;s &#x2014; done"), "it's — done")
  })

  await ok("publish now / conflict / overwrite / unpublish / delete", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co"
    const { runGitSend } = await import("../src/features/git-sites/publish")
    const map = autoFieldMap(posts)
    const detected = {
      collections: [{ name: "posts", fields: posts.fields }],
    }
    const conn = {
      id: "c0000000-0000-4000-8000-000000000001",
      client_id: "c1000000-0000-4000-8000-000000000001",
      auth_method: "token",
      installation_id: null,
      repo_id: 1,
      owner: "leadmakerAgency",
      repo: "South-Africa-SDR",
      branch: "main",
      status: "connected",
      collection: "posts",
      folder: "content/posts",
      extension: "md",
      slug_template: "{{slug}}",
      media_folder: "content/media",
      public_folder: "/media",
      date_format: "YYYY-MM-DD",
      field_map: map,
      url_pattern: "/blog/{slug}/",
      site_url: "https://southafricasdr.com",
      commit_name: null,
      commit_email: null,
      detected,
    }
    const inlineUrl = "https://proj.supabase.co/storage/v1/object/public/content-inline/c1000000-0000-4000-8000-000000000001/abc.png"
    const article: Record<string, unknown> = {
      id: "a0000000-0000-4000-8000-000000000001",
      client_id: conn.client_id,
      title: "How much does an SDR cost?",
      slug: "sdr-cost",
      body_html: `<p>Intro <strong>bold</strong>.</p><h2>Costs</h2><p><img src="${inlineUrl}" alt="Chart"></p><p>Use {{ this }} carefully.</p>`,
      excerpt: "Short.",
      meta_description: "What an SDR costs.",
      seo_title: null,
      tags: ["sdr"],
      author_name: null,
      status: "draft",
      publish_at: null,
      published_at: null,
      version: 3,
      site_kind: "git",
      git_connection_id: conn.id,
      git_path: null,
      git_blob_sha: null,
      git_commit_sha: null,
      git_media: [],
      live_url: null,
      featured: { storage_path: "cl/m1/photo.jpg", bytes: 4, mime: "image/jpeg", alt_text: "A photo" },
    }

    // Fake database (admin client): two tables, the RPCs, storage.
    const rpcs: { name: string; args: Record<string, unknown> }[] = []
    const updates: unknown[] = []
    const admin = {
      from(table: string) {
        let rows: Record<string, unknown>[] =
          table === "content_articles" ? [article] : table === "git_connections" ? [conn] : table === "content_settings" ? [{ git_default_author: "Team", git_default_tags: [] }] : []
        const q = {
          select: () => q,
          eq: (col: string, val: unknown) => {
            if (table !== "content_settings") rows = rows.filter((r) => r[col] === val)
            return q
          },
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          update: (vals: unknown) => {
            updates.push(vals)
            return { eq: async () => ({ error: null }) }
          },
        }
        return q
      },
      async rpc(name: string, args: Record<string, unknown>) {
        rpcs.push({ name, args })
        if (name === "git_connection_secret") return { data: args.p_kind === "token" ? "github_pat_test" : null, error: null }
        if (name === "git_store_article_result") {
          const p = args.p as Record<string, unknown>
          for (const k of ["status", "git_path", "git_blob_sha", "git_media", "live_url"]) if (k in p) article[k] = p[k] === "" ? null : p[k]
          if (p.git_commit_sha) article.git_commit_sha = p.git_commit_sha
        }
        return { data: { ok: true }, error: null }
      },
      storage: {
        from: (bucket: string) => ({
          download: async (path: string) =>
            bucket === "content-media" && path === "cl/m1/photo.jpg"
              ? { data: new Blob([Uint8Array.from([255, 216, 255, 224])], { type: "image/jpeg" }), error: null }
              : bucket === "content-inline" && path === "c1000000-0000-4000-8000-000000000001/abc.png"
                ? { data: new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" }), error: null }
                : { data: null, error: { message: "not found" } },
        }),
      },
    }

    // Fake GitHub repo.
    const repo = { head: "c".repeat(40), tree: "t".repeat(40), files: new Map<string, string>(), seq: 0 }
    const commits: { message: string; tree: unknown; author?: unknown }[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input))
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
      const p = decodeURIComponent(u.pathname)
      const base = "/repos/leadmakerAgency/South-Africa-SDR"
      if (p === `${base}/git/ref/heads/main`) return json({ object: { sha: repo.head } })
      if (p.startsWith(`${base}/git/commits/`) && method === "GET") return json({ tree: { sha: repo.tree } })
      if (p === `${base}/contents/content/media`) {
        return json([...repo.files.keys()].filter((k) => k.startsWith("content/media/")).map((k) => ({ type: "file", name: k.split("/").pop(), path: k, sha: repo.files.get(k), size: 4 })))
      }
      if (p.startsWith(`${base}/contents/`)) {
        const path = p.slice(`${base}/contents/`.length)
        const sha = repo.files.get(path)
        return sha ? json({ type: "file", sha, size: 10, encoding: "base64", content: Buffer.from("x").toString("base64") }) : json({ message: "Not Found" }, 404)
      }
      if (p === `${base}/git/blobs` && method === "POST") return json({ sha: gitBlobSha(Buffer.from(body.content, "base64")) }, 201)
      if (p === `${base}/git/trees` && method === "POST") {
        const changes = (body.tree as { path: string; sha?: string | null; content?: string }[])
        const same = changes.every((e) => (e.sha === null ? !repo.files.has(e.path) : repo.files.get(e.path) === (e.content !== undefined ? gitBlobSha(e.content) : e.sha)))
        if (same) return json({ sha: body.base_tree }, 201)
        for (const e of changes) {
          if (e.sha === null) repo.files.delete(e.path)
          else repo.files.set(e.path, e.content !== undefined ? gitBlobSha(e.content) : e.sha!)
        }
        return json({ sha: `t${++repo.seq}`.padEnd(40, "0") }, 201)
      }
      if (p === `${base}/git/commits` && method === "POST") {
        commits.push({ message: body.message, tree: body.tree, author: body.author })
        return json({ sha: `c${++repo.seq}`.padEnd(40, "0") }, 201)
      }
      if (p === `${base}/git/refs/heads/main` && method === "PATCH") {
        repo.head = body.sha
        repo.tree = `t${repo.seq}`.padEnd(40, "0")
        return json({ object: { sha: body.sha } })
      }
      return json({ message: `unexpected ${method} ${p}` }, 500)
    }) as typeof fetch

    const treeBodies: { path: string; content?: string }[][] = []
    const wrapped = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/git/trees") && init?.body) treeBodies.push(JSON.parse(String(init.body)).tree)
      return wrapped(input, init)
    }) as typeof fetch

    try {
      const db = admin as unknown as Parameters<typeof runGitSend>[0]
      // 1. Publish now.
      const r1 = await runGitSend(db, article.id as string, { mode: "now", version: 3, actor: null })
      assert.ok(r1.ok, JSON.stringify(r1))
      assert.equal(r1.ok && r1.url, "https://southafricasdr.com/blog/sdr-cost/")
      assert.equal(commits.length, 1)
      assert.ok(commits[0].message.startsWith("Publish: How much does an SDR cost?"))
      assert.ok(repo.files.has("content/posts/sdr-cost.md"))
      assert.ok(repo.files.has("content/media/sdr-cost.jpg"), "featured image")
      assert.ok(repo.files.has("content/media/sdr-cost-2.png"), "inline image")
      const postText = treeBodies[0].find((e) => e.path === "content/posts/sdr-cost.md")!.content!
      const fm = parseFrontMatter(postText)!
      assert.equal(fm.data.title, "How much does an SDR cost?")
      assert.equal(fm.data.excerpt, "What an SDR costs.", "meta description into the excerpt")
      assert.equal(fm.data.featured_image, "/media/sdr-cost.jpg")
      assert.equal(fm.data.draft, false)
      assert.equal(fm.data.hero_emoji, "📈")
      assert.equal(fm.data.templateEngineOverride, "md", "the {{ }} in the text is guarded")
      assert.match(String(fm.data.date), /^\d{4}-\d{2}-\d{2}$/)
      assert.ok(fm.body.includes("![Chart](/media/sdr-cost-2.png)"))
      assert.equal(article.status, "publishing")
      assert.equal(article.git_path, "content/posts/sdr-cost.md")
      assert.equal(article.live_url, "https://southafricasdr.com/blog/sdr-cost/")
      assert.equal(article.git_blob_sha, gitBlobSha(postText))

      // 2. Nothing changed → no second commit.
      article.status = "published"
      article.published_at = new Date().toISOString()
      const r2 = await runGitSend(db, article.id as string, { mode: "update", version: 4, actor: null })
      assert.ok(r2.ok && !r2.committed, JSON.stringify(r2))
      assert.equal(commits.length, 1)

      // 3. Someone edits it in the CMS → conflict; overwrite → commit.
      repo.files.set("content/posts/sdr-cost.md", "f".repeat(40))
      article.title = "How much does an SDR cost in 2026?"
      const r3 = await runGitSend(db, article.id as string, { mode: "update", version: 5, actor: null })
      assert.ok(!r3.ok && r3.conflict === "changed", JSON.stringify(r3))
      const r4 = await runGitSend(db, article.id as string, { mode: "update", version: 5, actor: null, force: true })
      assert.ok(r4.ok && r4.committed)
      assert.equal(commits.length, 2)
      assert.ok(commits[1].message.startsWith("Update: How much does an SDR cost in 2026?"))
      assert.equal(repo.files.get("content/media/sdr-cost.jpg") !== undefined, true, "same image name reused")
      assert.ok(![...repo.files.keys()].some((k) => k.endsWith("sdr-cost-3.png")), "images not duplicated")

      // 4. Unpublish → draft: true, same file.
      const r5 = await runGitSend(db, article.id as string, { mode: "unpublish", version: 6, actor: null })
      assert.ok(r5.ok && r5.status === "draft")
      const unpub = treeBodies[treeBodies.length - 1].find((e) => e.path === "content/posts/sdr-cost.md")!.content!
      assert.equal(parseFrontMatter(unpub)!.data.draft, true)
      assert.equal(article.status, "draft")

      // 5. A new article can't take an address that's already on the site.
      const other = { ...article, id: "a0000000-0000-4000-8000-000000000002", git_path: null, git_blob_sha: null, status: "draft" }
      Object.assign(article, other)
      const r6 = await runGitSend(db, article.id as string, { mode: "now", version: 1, actor: null })
      assert.ok(!r6.ok && r6.conflict === "exists", JSON.stringify(r6))

      // 6. Delete from site (back to the first article's state).
      Object.assign(article, { id: "a0000000-0000-4000-8000-000000000001", git_path: "content/posts/sdr-cost.md", status: "published" })
      const r7 = await runGitSend(db, article.id as string, { mode: "delete", version: 7, actor: null })
      assert.ok(r7.ok && r7.committed)
      assert.ok(!repo.files.has("content/posts/sdr-cost.md"))
      assert.ok(repo.files.has("content/media/sdr-cost.jpg"), "images stay")
      assert.ok(rpcs.every((c) => c.name !== "git_store_article_result" || (c.args.p as { release?: boolean }).release === true), "every store releases the lock")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  console.log(`${n} groups pass`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

import { createHash } from "node:crypto"

/** Pure helpers for Git sites (docs/plans/git-cms/03-github-library.md). */

/** The git blob sha of some bytes: the same as `git hash-object` and GitHub's file `sha`. */
export function gitBlobSha(content: string | Uint8Array): string {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content)
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf8"), bytes]))
    .digest("hex")
}

export type CommitKind = "publish" | "update" | "unpublish" | "delete"

const VERB: Record<CommitKind, string> = { publish: "Publish", update: "Update", unpublish: "Unpublish", delete: "Delete" }

/** "Publish: My post" plus a trailer that ties the commit to one article version. */
export function commitMessage(kind: CommitKind, title: string, articleId: string, version: number): string {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled"
  return `${VERB[kind]}: ${clean}\n\nLeadMaker-Article: ${articleId} v${version}\n`
}

/** The article id and version from a commit message we wrote, or null. */
export function articleFromCommit(message: string): { id: string; version: number } | null {
  const m = /^LeadMaker-Article: ([0-9a-f-]{36}) v(\d+)$/m.exec(message)
  return m ? { id: m[1], version: Number(m[2]) } : null
}

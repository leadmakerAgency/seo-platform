import { Fragment, type ReactNode } from "react"

/**
 * Renders an AI answer (untrusted text) without any HTML from it: paragraphs, "#" headings as bold
 * lines, "-", "*" and "1." lists, **bold** and [text](url) links. Everything else is plain text.
 * Tracked brand names are highlighted (the client's in violet).
 */

type Highlight = { name: string; own: boolean }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function safeHref(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

function highlightText(text: string, highlights: Highlight[], keyBase: string): ReactNode[] {
  const names = highlights.filter((h) => h.name.trim().length >= 2)
  if (!names.length) return [text]
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map((h) => escape(h.name)).join("|")})(?![\\p{L}\\p{N}])`, "giu")
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const own = names.find((h) => h.name.toLowerCase() === m![1].toLowerCase())?.own
    out.push(
      <mark key={`${keyBase}-h${i++}`} className={own ? "rounded-sm bg-brand-soft px-0.5 font-medium text-brand" : "bg-transparent underline decoration-muted-foreground/60 decoration-2 underline-offset-2"}>
        {m[1]}
      </mark>,
    )
    last = m.index + m[1].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function inline(text: string, highlights: Highlight[], keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\[([^\]]{1,300})\]\((https?:\/\/[^\s)]{1,2000})\)|\*\*([^*]{1,500})\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...highlightText(text.slice(last, m.index), highlights, `${keyBase}-t${i}`))
    if (m[1] && m[2]) {
      const href = safeHref(m[2])
      let host = ""
      try {
        host = new URL(m[2]).hostname.replace(/^www\./, "")
      } catch {}
      out.push(
        href ? (
          <a key={`${keyBase}-a${i}`} href={href} target="_blank" rel="nofollow noopener noreferrer" className="text-brand underline underline-offset-2">
            {m[1]}
            {host && <span className="ml-1 text-xs text-muted-foreground">({host})</span>}
          </a>
        ) : (
          <Fragment key={`${keyBase}-a${i}`}>{m[1]}</Fragment>
        ),
      )
    } else if (m[3]) {
      out.push(<strong key={`${keyBase}-b${i}`}>{highlightText(m[3], highlights, `${keyBase}-bb${i}`)}</strong>)
    }
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) out.push(...highlightText(text.slice(last), highlights, `${keyBase}-end`))
  return out
}

export function SafeAnswer({ text, highlights }: { text: string; highlights: Highlight[] }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/)
  return (
    <div className="flex flex-col gap-3 text-sm leading-6">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim())
        if (!lines.length) return null
        const isList = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))
        if (isList) {
          const ordered = /^\s*\d/.test(lines[0])
          const Tag = ordered ? "ol" : "ul"
          return (
            <Tag key={bi} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), highlights, `${bi}-${li}`)}</li>
              ))}
            </Tag>
          )
        }
        return (
          <div key={bi} className="flex flex-col gap-1">
            {lines.map((l, li) => {
              const heading = /^#{1,6}\s+/.test(l)
              const t = l.replace(/^#{1,6}\s+/, "").replace(/^>\s?/, "")
              return heading ? (
                <p key={li} className="font-semibold">{inline(t, highlights, `${bi}-${li}`)}</p>
              ) : (
                <p key={li}>{inline(t, highlights, `${bi}-${li}`)}</p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

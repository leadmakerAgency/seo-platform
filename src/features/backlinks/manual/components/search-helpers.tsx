import { ArrowUpRight, Compass } from "lucide-react"

import { TOOLKIT, type HelperGroup } from "../search-helpers"

/** Ready-made Google searches and tools for finding sites by hand (opens in the VA's browser). */
export function SearchHelpers({ groups }: { groups: HelperGroup[] }) {
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden">
        <Compass className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] leading-[22px] font-semibold">Find more sites by hand</span>
          <span className="text-[13px] text-muted-foreground">
            Google searches built from the brief and the client&apos;s places. They open in your
            browser and cost nothing.
          </span>
        </span>
        <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <div className="grid gap-5 border-t px-4 py-4 md:grid-cols-2">
        {groups.length === 0 && (
          <p className="text-[13px] text-muted-foreground md:col-span-2">
            Write the strategy brief (topics) and add the client&apos;s places to get ready-made
            searches.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <p className="text-xs text-muted-foreground">{g.note}</p>
            <ul className="flex flex-col gap-1">
              {g.links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-[13px] text-brand underline-offset-2 hover:underline"
                  >
                    {l.label} <ArrowUpRight className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <h3 className="text-sm font-semibold">Toolkit</h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {TOOLKIT.map((t) => (
              <li key={t.href} className="text-[13px]">
                <a
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-brand underline-offset-2 hover:underline"
                >
                  {t.name}
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  · {t.cost} · {t.use}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Found a good one? Use &ldquo;Add a site by hand&rdquo; above.
          </p>
        </div>
      </div>
    </details>
  )
}

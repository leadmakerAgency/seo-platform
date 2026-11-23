// Builds src/components/icons/index.tsx: the app's icon set.
//
// Style: Iconsax "Bulk" (MIT, https://iconsax.io, via the iconsax-reactjs dev dependency):
// solid filled shapes in two tones, the main part in full ink and the body at 40%.
// Small functional glyphs (arrows, check, close, chevrons, spinner...) have no Bulk form
// without a box around them, so they are drawn here as plain rounded strokes.
//
// Icons keep the names the app used with lucide (`<Trash2 />`, `<ChevronDown />`), so a
// component only imports from "@/components/icons". To add an icon: add a line to ICONS
// (an Iconsax name or a glyph below) and run `npm run icons`.
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const ESM = path.join(path.dirname(require.resolve("iconsax-reactjs")), "../esm")
const OUT = "src/components/icons/index.tsx"

/** App name -> Iconsax Bulk icon name, `glyph:<key>`, or `slash:<Iconsax name>` (pale + slash). */
const ICONS = {
  // Status and feedback
  CircleAlert: "InfoCircle",
  InfoIcon: "InfoCircle",
  TriangleAlert: "Danger",
  TriangleAlertIcon: "Danger",
  CircleCheck: "TickCircle",
  CircleCheckIcon: "TickCircle",
  CircleCheckBig: "TickCircle",
  CircleX: "CloseCircle",
  OctagonXIcon: "CloseCircle",
  CircleDashed: "RecordCircle",
  BadgeCheck: "Verify",
  Ban: "Forbidden2",
  ShieldCheck: "ShieldTick",
  ShieldAlert: "ShieldCross",
  HeartPulse: "Health",
  // Objects
  Trash2: "Trash",
  Copy: "Copy",
  FileText: "DocumentText",
  Newspaper: "DocumentText1",
  NotebookPen: "Notepad2",
  ClipboardCheck: "ClipboardTick",
  ReceiptText: "ReceiptText",
  Archive: "Archive",
  ArchiveRestore: "ArchiveTick",
  BookMarked: "BookSaved",
  Library: "Book",
  Package: "Box",
  Paperclip: "Paperclip2",
  Tag: "Tag",
  Wallet: "Wallet",
  Database: "Driver2",
  Lock: "Lock",
  LockOpen: "Unlock",
  KeyRound: "Key",
  IdCard: "Personalcard",
  Inbox: "DirectInbox",
  MailCheck: "SmsTracking",
  Send: "Send2",
  Bell: "Notification",
  BellOff: "slash:Notification",
  Camera: "Camera",
  ImageIcon: "Gallery",
  ImagePlus: "GalleryAdd",
  Film: "VideoHorizontal",
  Mic: "Microphone2",
  Quote: "QuoteUp",
  Lightbulb: "LampOn",
  Brain: "LampCharge",
  Trophy: "Cup",
  Swords: "Ranking",
  Gauge: "Speedometer",
  Zap: "Flash",
  Bot: "Cpu",
  Sparkles: "MagicStar",
  Star: "Star1",
  Flag: "Flag",
  Target: "Gps",
  Radar: "Radar",
  Compass: "Discover",
  Globe: "Global",
  Globe2: "Global",
  MapPin: "Location",
  MapPinned: "Map",
  Store: "Shop",
  Landmark: "Bank",
  Building2: "Buliding",
  BriefcaseBusiness: "Briefcase",
  House: "Home2",
  Sun: "Sun1",
  Moon: "Moon",
  // People
  Users: "People",
  UserRound: "User",
  UserPlus: "UserAdd",
  Contact: "ProfileCircle",
  Handshake: "Profile2User",
  AtSign: "Brodcast",
  // Messages
  MessageSquare: "Message",
  MessageSquareText: "MessageText",
  MessageSquarePlus: "MessageAdd",
  MessagesSquare: "Messages2",
  MessageCircleQuestion: "MessageQuestion",
  // Time
  Clock: "Clock",
  Clock3: "Timer1",
  History: "Clock",
  CalendarDays: "Calendar",
  CalendarClock: "Calendar2",
  CalendarMinus: "CalendarRemove",
  CalendarOff: "CalendarRemove",
  // Layout, lists and data
  LayoutDashboard: "Category",
  LayoutList: "RowVertical",
  Table2: "Grid5",
  ListChecks: "TaskSquare",
  ListTodo: "Task",
  ListPlus: "NoteAdd",
  List: "TextalignJustifyleft",
  ListOrdered: "Firstline",
  ChartNoAxesColumn: "Chart21",
  Network: "Hierarchy",
  GitCompareArrows: "ArrangeHorizontal",
  PanelLeftIcon: "SidebarLeft",
  // Actions
  Search: "SearchNormal1",
  SearchIcon: "SearchNormal1",
  SearchX: "SearchZoomOut",
  Pencil: "Edit2",
  PenLine: "Edit",
  Hand: "PenAdd",
  Eye: "Eye",
  EyeOff: "EyeSlash",
  ExternalLink: "ExportSquare",
  Download: "Import",
  Upload: "Export",
  LogOut: "Logout",
  Settings2: "Setting4",
  Plug: "Electricity",
  Unplug: "slash:Electricity",
  Link2: "Link21",
  Unlink: "slash:Link21",
  RefreshCw: "Refresh",
  Repeat: "Repeat",
  Play: "Play",
  SkipForward: "Next",
  Power: "ToggleOn",
  PowerOff: "ToggleOff",
  // Glyphs (plain strokes, no Bulk form without a box)
  Check: "glyph:check",
  CheckIcon: "glyph:check",
  X: "glyph:x",
  XIcon: "glyph:x",
  Plus: "glyph:plus",
  Minus: "glyph:minus",
  ChevronDown: "glyph:chevronDown",
  ChevronDownIcon: "glyph:chevronDown",
  ChevronUp: "glyph:chevronUp",
  ChevronUpIcon: "glyph:chevronUp",
  ChevronLeft: "glyph:chevronLeft",
  ChevronLeftIcon: "glyph:chevronLeft",
  ChevronRight: "glyph:chevronRight",
  ChevronRightIcon: "glyph:chevronRight",
  ChevronsUpDown: "glyph:chevronsUpDown",
  ArrowRight: "glyph:arrowRight",
  ArrowLeft: "glyph:arrowLeft",
  ArrowUp: "glyph:arrowUp",
  ArrowDown: "glyph:arrowDown",
  ArrowUpRight: "glyph:arrowUpRight",
  ArrowDownRight: "glyph:arrowDownRight",
  ArrowDownUp: "glyph:arrowDownUp",
  TrendingUp: "glyph:trendingUp",
  TrendingDown: "glyph:trendingDown",
  RotateCcw: "glyph:rotateCcw",
  RotateCw: "glyph:rotateCw",
  Undo2: "glyph:undo",
  Redo2: "glyph:redo",
  CornerUpLeft: "glyph:cornerUpLeft",
  Ellipsis: "glyph:ellipsis",
  MoreHorizontalIcon: "glyph:ellipsis",
  Circle: "glyph:circle",
  Loader2: "glyph:spinner",
  Loader2Icon: "glyph:spinner",
  LoaderCircle: "glyph:spinner",
  Bold: "glyph:bold",
  Italic: "glyph:italic",
  Heading2: "glyph:heading2",
  Heading3: "glyph:heading3",
}

// Glyphs: 24-unit box, 2 px round strokes; the secondary stroke sits at 40% like Bulk.
const s = (d, extra = "") =>
  `<path d="${d}" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"${extra} />`
const pale = ' opacity=".4"'
const GLYPHS = {
  check: s("m5 12.5 4.5 4.5L19 7.5"),
  x: s("M17.5 6.5l-11 11M6.5 6.5l11 11"),
  plus: s("M12 5.5v13M5.5 12h13"),
  minus: s("M5.5 12h13"),
  chevronDown: s("m6.5 9.5 5.5 5.5 5.5-5.5"),
  chevronUp: s("m6.5 14.5 5.5-5.5 5.5 5.5"),
  chevronLeft: s("m14.5 6.5-5.5 5.5 5.5 5.5"),
  chevronRight: s("m9.5 6.5 5.5 5.5-5.5 5.5"),
  chevronsUpDown: s("m8 9 4-4 4 4M8 15l4 4 4-4"),
  arrowRight: s("M4.5 12h13", pale) + s("m13 6.5 5.5 5.5-5.5 5.5"),
  arrowLeft: s("M19.5 12h-13", pale) + s("m11 6.5-5.5 5.5 5.5 5.5"),
  arrowUp: s("M12 19.5v-13", pale) + s("m6.5 11 5.5-5.5 5.5 5.5"),
  arrowDown: s("M12 4.5v13", pale) + s("m6.5 13 5.5 5.5 5.5-5.5"),
  arrowUpRight: s("M6.5 17.5l10-10", pale) + s("M8.5 6.5h9v9"),
  arrowDownRight: s("M6.5 6.5l10 10", pale) + s("M17.5 8.5v9h-9"),
  arrowDownUp: s("M7 5v13M17 19V6", pale) + s("M3.5 14.5 7 18l3.5-3.5M13.5 9.5 17 6l3.5 3.5"),
  trendingUp: s("M3 17l6.5-6.5 4 4L20 8", pale) + s("M14.5 7.5H20.5V13.5"),
  trendingDown: s("M3 7l6.5 6.5 4-4L20 16", pale) + s("M14.5 16.5H20.5V10.5"),
  rotateCcw: s("M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5", pale) + s("M3.5 3.5v5h5"),
  rotateCw: s("M20.5 12a8.5 8.5 0 1 1-2.5-6l2.5 2.5", pale) + s("M20.5 3.5v5h-5"),
  undo: s("M4.5 9h10a5 5 0 0 1 0 10H11", pale) + s("M9 13.5 4.5 9 9 4.5"),
  redo: s("M19.5 9h-10a5 5 0 0 0 0 10H13", pale) + s("m15 13.5 4.5-4.5L15 4.5"),
  cornerUpLeft: s("M4.5 9h9.5a6 6 0 0 1 6 6v4.5", pale) + s("M9 13.5 4.5 9 9 4.5"),
  ellipsis:
    '<circle cx="5" cy="12" r="1.9" fill="currentColor" /><circle cx="12" cy="12" r="1.9" fill="currentColor" /><circle cx="19" cy="12" r="1.9" fill="currentColor" />',
  circle:
    '<circle cx="12" cy="12" r="8.5" fill="currentColor" opacity=".18" /><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" opacity=".55" />',
  spinner:
    '<circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.5" opacity=".25" />' +
    s("M20.5 12A8.5 8.5 0 0 0 12 3.5", ' strokeWidth="2.5"').replace(' strokeWidth="2"', ""),
  bold: s(
    "M7 5h5.5a3.5 3.5 0 0 1 0 7H7zM7 12h6.5a3.5 3.5 0 0 1 0 7H7z",
    ' strokeWidth="2.25"',
  ).replace(' strokeWidth="2"', ""),
  italic: s("M18.5 4.5h-8M13.5 19.5h-8M15 4.5 9 19.5"),
  heading2: s("M4 6v12M12 6v12M4 12h8") + s("M21 18h-4c0-3.5 4-3 4-6 0-1.6-2.2-2.4-4-1.2", pale),
  heading3:
    s("M4 6v12M12 6v12M4 12h8") +
    s(
      "M17.2 10.6c1.6-1.2 3.8-.6 3.8 1.1 0 1.2-1 1.8-2 1.8 1 0 2 .7 2 1.9 0 1.8-2.4 2.4-4 1.1",
      pale,
    ),
}

const React = {
  Fragment: "__frag",
  createElement(type, props, ...children) {
    const inner = children.flat().join("")
    if (type === "__frag") return inner
    const attrs = Object.entries(props || {})
      .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`)
      .join("")
    return `<${type}${attrs}${inner ? `>${inner}</${type}>` : " />"}`
  },
}

function bulk(name) {
  const src = fs.readFileSync(path.join(ESM, `${name}.js`), "utf8")
  const m = src.match(/var Bulk = (function Bulk\([\s\S]*?\n\});\n/)
  if (!m) throw new Error(`Iconsax "${name}" has no Bulk variant`)
  return new Function("React", `return (${m[1]})`)(React)({ color: "currentColor" })
}

function body(source) {
  if (source.startsWith("glyph:")) {
    const g = GLYPHS[source.slice(6)]
    if (!g) throw new Error(`Unknown glyph ${source}`)
    return g
  }
  if (source.startsWith("slash:")) {
    return `<g opacity=".45">${bulk(source.slice(6))}</g>${s("M4 4l16 16")}`
  }
  return bulk(source)
}

// One function per distinct shape; aliases re-export it under the other names.
const shapes = new Map()
for (const [name, source] of Object.entries(ICONS)) {
  if (!shapes.has(source)) shapes.set(source, [])
  shapes.get(source).push(name)
}

let out = `// Generated by scripts/build-icons.mjs. Do not edit by hand: change the map there and run \`npm run icons\`.
//
// Shockwave icons: Iconsax "Bulk" two-tone shapes (MIT, https://iconsax.io) and a few plain
// rounded-stroke glyphs. Names match the lucide names the app used before.
import type { ComponentProps, ReactNode } from "react"

export type IconProps = Omit<ComponentProps<"svg">, "children"> & {
  size?: number | string
  /** Accepted for lucide compatibility; the shapes are filled, so it does nothing. */
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
}
export type IconComponent = (props: IconProps) => ReactNode

function Svg({
  size = 24,
  strokeWidth,
  absoluteStrokeWidth,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  void strokeWidth
  void absoluteStrokeWidth
  const labelled = rest["aria-label"] !== undefined || rest["aria-labelledby"] !== undefined
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      {...rest}
    >
      {children}
    </svg>
  )
}
`
for (const [source, names] of shapes) {
  const [main, ...aliases] = names
  out += `\nexport function ${main}(props: IconProps) {\n  return <Svg {...props}>${body(source)}</Svg>\n}\n`
  for (const a of aliases) out += `export { ${main} as ${a} }\n`
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, out)
console.log(`Wrote ${OUT}: ${Object.keys(ICONS).length} names, ${shapes.size} shapes`)

/**
 * CSV for spreadsheets (Excel, Google Sheets, Numbers). Pure, so it runs on the server and in
 * the browser: UTF-8 with a BOM (so Excel reads accents), CRLF line endings, quoted cells, and
 * text that a spreadsheet would run as a formula (= + - @, tab, carriage return) prefixed with '.
 */

const FORMULA = /^[=+\-@\t\r]/

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : ""
  if (typeof v === "boolean") return v ? "Yes" : "No"
  let s = String(v)
  if (FORMULA.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(head: string[], rows: unknown[][]): string {
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")
}

/** "market-beacon-report-tracked-keywords-2026-11-27.csv" (date in UTC, today by default). */
export function csvFileName(slug: string, list: string, date: Date | string = new Date()): string {
  const day = (typeof date === "string" ? date : date.toISOString()).slice(0, 10)
  const safe = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  return `${[safe(slug), safe(list), day].filter(Boolean).join("-")}.csv`
}

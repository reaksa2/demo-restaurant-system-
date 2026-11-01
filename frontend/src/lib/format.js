// Small shared helpers for the back-office pages.

export const money = (n) => {
  const v = Number(n || 0)
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export const qty = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })

const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
]

/**
 * Turns a period choice into BOTH:
 *   - local calendar dates (from/to inclusive, "YYYY-MM-DD") for date-only data (expenses)
 *   - UTC instants (start inclusive, end exclusive) for timestamped data (bills),
 *     built from the viewer's LOCAL midnight so "today" is the viewer's today.
 */
export function periodRange(key, customFrom, customTo) {
  const now = new Date()
  const day = (y, m, d) => new Date(y, m, d, 0, 0, 0, 0)
  let from, toExcl
  if (key === 'today') { from = day(now.getFullYear(), now.getMonth(), now.getDate()); toExcl = day(now.getFullYear(), now.getMonth(), now.getDate() + 1) }
  else if (key === '7d') { from = day(now.getFullYear(), now.getMonth(), now.getDate() - 6); toExcl = day(now.getFullYear(), now.getMonth(), now.getDate() + 1) }
  else if (key === 'month') { from = day(now.getFullYear(), now.getMonth(), 1); toExcl = day(now.getFullYear(), now.getMonth() + 1, 1) }
  else if (key === 'lastmonth') { from = day(now.getFullYear(), now.getMonth() - 1, 1); toExcl = day(now.getFullYear(), now.getMonth(), 1) }
  else if (key === 'year') { from = day(now.getFullYear(), 0, 1); toExcl = day(now.getFullYear() + 1, 0, 1) }
  else {
    const f = customFrom ? new Date(`${customFrom}T00:00:00`) : day(now.getFullYear(), now.getMonth(), 1)
    const t = customTo ? new Date(`${customTo}T00:00:00`) : f
    from = f; toExcl = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)
  }
  const lastDay = new Date(toExcl.getFullYear(), toExcl.getMonth(), toExcl.getDate() - 1)
  return {
    fromDate: ymd(from),
    toDate: ymd(lastDay),
    start: from.toISOString(),
    end: toExcl.toISOString(),
    // minutes AHEAD of UTC (Cambodia = 420) — what the API wants for local dating/hours
    tz: -now.getTimezoneOffset(),
    label: `${ymd(from)} → ${ymd(lastDay)}`,
  }
}

// CSV that opens correctly in Excel, including Khmer (UTF-8 BOM) and commas/quotes in text.
export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

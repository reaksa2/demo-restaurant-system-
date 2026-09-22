// Groups paid bills into a continuous Daily / Monthly / Yearly timeline,
// ending "now" in the viewer's own local time zone — so a manager in
// Phnom Penh and one in a different zone each see "today" as their own day,
// not a UTC day that might already have rolled over for one of them.

const BUCKET_COUNTS = { daily: 14, monthly: 12, yearly: 5 }

function shiftDate(date, period, amount) {
  const d = new Date(date)
  if (period === 'daily') d.setDate(d.getDate() + amount)
  else if (period === 'monthly') d.setMonth(d.getMonth() + amount)
  else d.setFullYear(d.getFullYear() + amount)
  return d
}

function bucketKey(date, period) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  if (period === 'daily') return `${y}-${m}-${d}`
  if (period === 'monthly') return `${y}-${m}`
  return `${y}`
}

function bucketLabel(date, period) {
  if (period === 'daily') return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (period === 'monthly') return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  return date.toLocaleDateString(undefined, { year: 'numeric' })
}

/**
 * @param {Array<{paidAtOrCreatedAt: Date, amount: number}>} rows
 * @param {'daily'|'monthly'|'yearly'} period
 * @returns {Array<{key: string, label: string, total: number}>}
 */
export function buildRevenueTrend(rows, period) {
  const count = BUCKET_COUNTS[period] || BUCKET_COUNTS.daily
  const now = new Date()

  const buckets = []
  const indexByKey = new Map()
  for (let i = count - 1; i >= 0; i--) {
    const d = shiftDate(now, period, -i)
    const key = bucketKey(d, period)
    indexByKey.set(key, buckets.length)
    buckets.push({ key, label: bucketLabel(d, period), total: 0 })
  }

  for (const row of rows) {
    const key = bucketKey(row.paidAtOrCreatedAt, period)
    const idx = indexByKey.get(key)
    if (idx !== undefined) buckets[idx].total += row.amount
  }

  return buckets
}

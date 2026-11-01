import { useEffect, useMemo, useState } from 'react'
import { financeApi } from '../services/resources'
import { Button, EmptyState } from '../components/ui'
import { BrandPicker, PeriodPicker, useBrands } from '../components/BrandPicker'
import { money, qty, PERIODS, periodRange, downloadCsv } from '../lib/format'
import BillingReportTab from './reports/BillingReportTab'
import { Download, Printer } from 'lucide-react'

const TABS = [
  ['pl', 'Profit & Loss'],
  ['food', 'Best sellers'],
  ['hours', 'Busy hours'],
  ['bills', 'Bills & revenue trend'],
]

const sumDict = (a, b) => { const o = { ...a }; Object.entries(b || {}).forEach(([k, v]) => { o[k] = (Number(o[k]) || 0) + Number(v) }); return o }

/**
 * Financial reporting. One brand or (for people who manage several) all of
 * them combined — each brand is fetched separately and merged here, so the
 * server-side access scoping stays exactly the same as everywhere else.
 */
export default function ReportsPage() {
  const { brands, brandId, setBrandId, loading: brandsLoading } = useBrands()
  const [tab, setTab] = useState('pl')
  const [period, setPeriod] = useState('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [scopeId, setScopeId] = useState('all')
  const range = useMemo(() => periodRange(period, from, to), [period, from, to])
  const targets = useMemo(() => (scopeId === 'all' ? brands : brands.filter((b) => b.id === scopeId)), [scopeId, brands])

  if (brandsLoading) return <p className="text-sm text-slate">Loading…</p>
  if (!brands.length) return <EmptyState title="No brand available" />

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Reports</h1>
          <p className="mt-1 text-sm text-slate">Profit, best sellers and busy hours{brands.length > 1 ? ' — one brand or all combined' : ''}.</p>
        </div>
        <Button variant="secondary" onClick={() => window.print()} className="print:hidden"><Printer size={15} /> Print / Save as PDF</Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex flex-wrap gap-1 rounded-md border border-sand bg-white p-1">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded px-3 py-1.5 text-sm ${tab === k ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'bills' ? (
        <div className="mt-6"><BillingReportTab /></div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <BrandPicker brands={brands} brandId={scopeId} onChange={setScopeId} allowAll={brands.length > 1} />
            <PeriodPicker period={period} onPeriod={setPeriod} from={from} to={to} onFrom={setFrom} onTo={setTo} periods={PERIODS} />
          </div>
          <p className="mt-3 text-xs text-slate">{targets.length > 1 ? 'All brands' : targets[0]?.name_en} · {range.label}</p>
          {tab === 'pl' && <ProfitLoss targets={targets} range={range} />}
          {tab === 'food' && <BestSellers targets={targets} range={range} />}
          {tab === 'hours' && <BusyHours targets={targets} range={range} />}
        </>
      )}
    </div>
  )
}

function useReport(targets, range, fetcher) {
  const [data, setData] = useState(null) // [{brand, data}]
  const [error, setError] = useState('')
  const key = `${targets.map((t) => t.id).join(',')}|${range.start}|${range.end}`
  useEffect(() => {
    let live = true
    setData(null); setError('')
    Promise.all(targets.map((b) => fetcher(b.id, { start: range.start, end: range.end, tz_offset_minutes: range.tz }).then((d) => ({ brand: b, data: d }))))
      .then((r) => live && setData(r))
      .catch(() => live && setError('Could not load this report.'))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { data, error }
}

function Stat({ label, value, tone = 'text-ink', hint }) {
  return (
    <div className="rounded-lg border border-sand bg-white p-4">
      <p className="text-xs text-slate">{label}</p>
      <p className={`mt-1 font-display text-2xl tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate">{hint}</p>}
    </div>
  )
}

function ProfitLoss({ targets, range }) {
  const { data, error } = useReport(targets, range, financeApi.profitLoss)
  if (error) return <p className="mt-6 text-sm text-clay">{error}</p>
  if (!data) return <p className="mt-6 text-sm text-slate">Loading…</p>

  const t = data.reduce((acc, { data: d }) => ({
    revenue: acc.revenue + Number(d.revenue), bills: acc.bills + d.bills_paid, expenses: acc.expenses + Number(d.expenses_total),
    net: acc.net + Number(d.net_profit), owed: acc.owed + Number(d.owed_to_suppliers), stock: acc.stock + Number(d.stock_value),
    cats: sumDict(acc.cats, d.expenses_by_category), methods: sumDict(acc.methods, d.revenue_by_payment_method),
  }), { revenue: 0, bills: 0, expenses: 0, net: 0, owed: 0, stock: 0, cats: {}, methods: {} })
  const margin = t.revenue > 0 ? (t.net / t.revenue) * 100 : null
  const cats = Object.entries(t.cats).sort((a, b) => b[1] - a[1])

  const exportCsv = () => {
    const rows = [['Revenue (paid bills)', t.revenue.toFixed(2)], ['Expenses', t.expenses.toFixed(2)], ['Net profit', t.net.toFixed(2)], [], ['Expenses by category', 'Amount'], ...cats.map(([c, v]) => [c, Number(v).toFixed(2)])]
    if (data.length > 1) rows.push([], ['Brand', 'Revenue', 'Expenses', 'Net'], ...data.map(({ brand, data: d }) => [brand.name_en, Number(d.revenue).toFixed(2), Number(d.expenses_total).toFixed(2), Number(d.net_profit).toFixed(2)]))
    downloadCsv(`profit_loss_${range.fromDate}_${range.toDate}.csv`, ['Profit & Loss', range.label], rows)
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Revenue (paid bills)" value={money(t.revenue)} tone="text-moss" hint={`${t.bills} bill${t.bills === 1 ? '' : 's'}`} />
        <Stat label="Expenses" value={money(t.expenses)} tone="text-clay" />
        <Stat label="Net profit" value={money(t.net)} tone={t.net >= 0 ? 'text-moss' : 'text-clay'} hint={margin === null ? undefined : `${margin.toFixed(1)}% margin`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Owed to suppliers (now)" value={money(t.owed)} tone={t.owed > 0 ? 'text-clay' : 'text-ink'} />
        <Stat label="Stock on hand (now, at cost)" value={money(t.stock)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="mb-3 text-sm font-medium text-ink">Expenses by category</p>
          {cats.length === 0 ? <p className="text-sm text-slate">No expenses in this period.</p> : cats.map(([c, v]) => (
            <div key={c} className="mb-1.5 flex items-center gap-3 text-sm">
              <span className="w-24 capitalize text-ink">{c}</span>
              <div className="h-2 flex-1 rounded bg-paper"><div className="h-2 rounded bg-clay/70" style={{ width: `${t.expenses ? (v / t.expenses) * 100 : 0}%` }} /></div>
              <span className="w-24 text-right tabular-nums">{money(v)}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="mb-3 text-sm font-medium text-ink">Revenue by payment method</p>
          {Object.keys(t.methods).length === 0 ? <p className="text-sm text-slate">No paid bills in this period.</p> : Object.entries(t.methods).sort((a, b) => b[1] - a[1]).map(([m, v]) => (
            <div key={m} className="mb-1.5 flex items-center gap-3 text-sm">
              <span className="w-24 capitalize text-ink">{m}</span>
              <div className="h-2 flex-1 rounded bg-paper"><div className="h-2 rounded bg-moss/70" style={{ width: `${t.revenue ? (v / t.revenue) * 100 : 0}%` }} /></div>
              <span className="w-24 text-right tabular-nums">{money(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {data.length > 1 && (
        <div className="overflow-x-auto rounded-lg border border-sand bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-sand bg-paper text-left text-xs text-slate"><tr><th className="px-4 py-2.5">Brand</th><th className="px-3 py-2.5 text-right">Revenue</th><th className="px-3 py-2.5 text-right">Expenses</th><th className="px-3 py-2.5 text-right">Net profit</th></tr></thead>
            <tbody className="divide-y divide-sand">
              {data.map(({ brand, data: d }) => (
                <tr key={brand.id}><td className="px-4 py-2.5 text-ink">{brand.name_en}</td><td className="px-3 py-2.5 text-right tabular-nums">{money(d.revenue)}</td><td className="px-3 py-2.5 text-right tabular-nums">{money(d.expenses_total)}</td><td className={`px-3 py-2.5 text-right tabular-nums ${Number(d.net_profit) >= 0 ? 'text-moss' : 'text-clay'}`}>{money(d.net_profit)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button variant="secondary" onClick={exportCsv} className="print:hidden"><Download size={15} /> Excel (CSV)</Button>
      <p className="text-xs text-slate">Cash basis: revenue is counted when a bill is paid and expenses on their expense date (a supplier is counted when you pay them, not when you order).</p>
    </div>
  )
}

function BestSellers({ targets, range }) {
  const { data, error } = useReport(targets, range, financeApi.salesByFood)
  const rows = useMemo(() => {
    if (!data) return []
    const m = {}
    data.forEach(({ data: list }) => list.forEach((r) => {
      const x = (m[r.name_en] ||= { ...r, quantity: 0, revenue: 0 })
      x.quantity += r.quantity; x.revenue += Number(r.revenue)
    }))
    return Object.values(m).sort((a, b) => b.quantity - a.quantity || a.name_en.localeCompare(b.name_en))
  }, [data])
  if (error) return <p className="mt-6 text-sm text-clay">{error}</p>
  if (!data) return <p className="mt-6 text-sm text-slate">Loading…</p>
  if (!rows.length) return <div className="mt-6"><EmptyState title="No sales in this period" description="Only paid bills are counted." /></div>
  const maxQty = rows[0].quantity
  const total = rows.reduce((s, r) => s + r.revenue, 0)
  return (
    <div className="mt-4">
      <div className="overflow-x-auto rounded-lg border border-sand bg-white">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="border-b border-sand bg-paper text-left text-xs text-slate"><tr><th className="px-4 py-2.5 w-10">#</th><th className="px-3 py-2.5">Food</th><th className="px-3 py-2.5 w-1/3" /><th className="px-3 py-2.5 text-right">Sold</th><th className="px-3 py-2.5 text-right">Revenue</th></tr></thead>
          <tbody className="divide-y divide-sand">
            {rows.map((r, i) => (
              <tr key={r.name_en}>
                <td className="px-4 py-2 text-slate">{i + 1}</td>
                <td className="px-3 py-2"><span className="text-ink">{r.name_en}</span> <span className="font-khmer text-xs text-slate">{r.name_kh}</span></td>
                <td className="px-3 py-2"><div className="h-2 rounded bg-paper"><div className="h-2 rounded bg-marigold" style={{ width: `${(r.quantity / maxQty) * 100}%` }} /></div></td>
                <td className="px-3 py-2 text-right tabular-nums">{qty(r.quantity)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between print:hidden">
        <Button variant="secondary" onClick={() => downloadCsv(`best_sellers_${range.fromDate}_${range.toDate}.csv`, ['Rank', 'Food', 'Khmer name', 'Sold', 'Revenue'], rows.map((r, i) => [i + 1, r.name_en, r.name_kh, r.quantity, r.revenue.toFixed(2)]))}><Download size={15} /> Excel (CSV)</Button>
        <p className="text-sm text-slate">Items total {money(total)} (before discounts/tax)</p>
      </div>
    </div>
  )
}

function BusyHours({ targets, range }) {
  const { data, error } = useReport(targets, range, financeApi.salesByHour)
  const hours = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, bills: 0, revenue: 0 }))
    ;(data || []).forEach(({ data: list }) => list.forEach((r) => { h[r.hour].bills += r.bills; h[r.hour].revenue += Number(r.revenue) }))
    return h
  }, [data])
  if (error) return <p className="mt-6 text-sm text-clay">{error}</p>
  if (!data) return <p className="mt-6 text-sm text-slate">Loading…</p>
  const totalBills = hours.reduce((s, h) => s + h.bills, 0)
  if (!totalBills) return <div className="mt-6"><EmptyState title="No paid bills in this period" /></div>
  const max = Math.max(...hours.map((h) => h.revenue)) || 1
  const best = hours.reduce((a, b) => (b.revenue > a.revenue ? b : a))
  const label = (h) => `${String(h).padStart(2, '0')}:00`
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-ink">Busiest hour: <span className="font-medium">{label(best.hour)}–{label((best.hour + 1) % 24)}</span> · {money(best.revenue)} from {best.bills} bill{best.bills === 1 ? '' : 's'}</p>
      <div className="rounded-lg border border-sand bg-white p-4">
        <div className="flex h-44 items-end gap-1">
          {hours.map((h) => (
            <div key={h.hour} className="flex h-full flex-1 flex-col items-center justify-end" title={`${label(h.hour)} · ${money(h.revenue)} · ${h.bills} bills`}>
              <div className="w-full rounded-t bg-marigold" style={{ height: `${(h.revenue / max) * 100}%`, minHeight: h.bills ? 3 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1">{hours.map((h) => <span key={h.hour} className="flex-1 text-center text-[9px] text-slate">{h.hour % 3 === 0 ? h.hour : ''}</span>)}</div>
        <p className="mt-1 text-center text-xs text-slate">Hour of day (your local time)</p>
      </div>
      <Button variant="secondary" className="print:hidden" onClick={() => downloadCsv(`busy_hours_${range.fromDate}_${range.toDate}.csv`, ['Hour', 'Bills', 'Revenue'], hours.map((h) => [label(h.hour), h.bills, h.revenue.toFixed(2)]))}><Download size={15} /> Excel (CSV)</Button>
    </div>
  )
}

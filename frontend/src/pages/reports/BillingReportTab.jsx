import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { brandsApi, billsApi } from '../../services/resources'
import { Badge, EmptyState, Select } from '../../components/ui'
import { Receipt } from 'lucide-react'

const STATUS_TONES = { unpaid: 'accent', paid: 'success', void: 'danger' }
const PAYMENT_LABELS = { cash: 'Cash', card: 'Card', qr: 'QR', other: 'Other' }

function parseUtcDate(dateString) {
  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(dateString)
  return new Date(hasTimezone ? dateString : `${dateString}Z`)
}

/**
 * Cross-brand view: Level1 sees every brand with billing on, Level2 sees it
 * for their group's brands, Level3 sees just their one brand (brandsApi.list
 * is already scoped server-side the same way it is everywhere else in the
 * app, so this tab just renders whatever brands come back). Read-only report
 * — paying/voiding a bill still happens from the brand's own Billing tab.
 */
export default function BillingReportTab() {
  const [brands, setBrands] = useState([])
  const [bills, setBills] = useState([]) // [{ ...bill, brand_id, brand_name }]
  const [brandFilter, setBrandFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const allBrands = await brandsApi.list()
      const billingBrands = allBrands.filter((b) => b.billing_enabled)
      setBrands(billingBrands)

      const perBrand = await Promise.all(
        billingBrands.map((b) =>
          billsApi.list(b.id).then((rows) => rows.map((r) => ({ ...r, brand_id: b.id, brand_name: b.name_en })))
        )
      )
      setBills(perBrand.flat().sort((a, b) => parseUtcDate(b.created_at) - parseUtcDate(a.created_at)))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return bills.filter((b) => {
      if (brandFilter !== 'all' && b.brand_id !== brandFilter) return false
      if (statusFilter !== 'all' && b.status !== statusFilter) return false
      return true
    })
  }, [bills, brandFilter, statusFilter])

  const totals = useMemo(() => {
    const paid = filtered.filter((b) => b.status === 'paid').reduce((sum, b) => sum + Number(b.total_amount), 0)
    const unpaid = filtered.filter((b) => b.status === 'unpaid').reduce((sum, b) => sum + Number(b.total_amount), 0)
    return { paid, unpaid, count: filtered.length }
  }, [filtered])

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  if (brands.length === 0) {
    return (
      <EmptyState
        title="No brands have billing turned on yet"
        description="Turn on billing for a brand from its Brand info tab to start seeing invoices here."
      />
    )
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-xs text-slate">Bills</p>
          <p className="mt-1 font-display text-2xl text-ink">{totals.count}</p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-xs text-slate">Paid</p>
          <p className="mt-1 font-display text-2xl text-moss">${totals.paid.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-xs text-slate">Unpaid</p>
          <p className="mt-1 font-display text-2xl text-marigold-dark">${totals.unpaid.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {brands.length > 1 && (
          <Select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="w-56">
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name_en}</option>
            ))}
          </Select>
        )}
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
          <option value="all">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </Select>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState title="No bills match this filter" />
        ) : (
          <div className="divide-y divide-sand rounded-lg border border-sand bg-white">
            {filtered.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <p className="font-medium text-ink">
                    #{String(b.invoice_number).padStart(4, '0')} · {b.table_label || 'No table label'}
                  </p>
                  <p className="text-xs text-slate">
                    {b.brand_name} · {parseUtcDate(b.created_at).toLocaleString()}
                    {b.created_by_name && ` · ${b.created_by_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONES[b.status]}>
                    {b.status === 'paid' ? `Paid (${PAYMENT_LABELS[b.payment_method] || ''})` : b.status}
                  </Badge>
                  <span className="font-display text-lg text-marigold-dark">${Number(b.total_amount).toFixed(2)}</span>
                  <Link
                    to={`/admin/brands/${b.brand_id}`}
                    className="flex items-center gap-1 rounded-md border border-sand px-3 py-1.5 text-sm text-slate hover:text-ink"
                  >
                    <Receipt size={14} /> Open brand
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

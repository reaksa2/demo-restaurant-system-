import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { brandsApi, ordersApi } from '../../services/resources'
import { Badge, EmptyState, Select } from '../../components/ui'
import { ExternalLink } from 'lucide-react'

const STATUS_TONES = { pending: 'accent', completed: 'success', cancelled: 'danger' }

function parseUtcDate(dateString) {
  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(dateString)
  return new Date(hasTimezone ? dateString : `${dateString}Z`)
}

/**
 * Read-only cross-brand order overview — a report, not a working queue.
 * Staff/admins still manage individual orders from a brand's own Orders tab
 * (or the staff Orders page); this just rolls everything up so a Group/Brand
 * Manager can see what's happening across brands without opening each one.
 */
export default function OrdersReportTab() {
  const [brands, setBrands] = useState([])
  const [orders, setOrders] = useState([]) // flattened, each tagged with brand_id/brand_name
  const [brandFilter, setBrandFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const allBrands = await brandsApi.list()
      const orderingBrands = allBrands.filter((b) => b.ordering_enabled)
      setBrands(orderingBrands)

      const perBrand = await Promise.all(
        orderingBrands.map((b) =>
          ordersApi.list(b.id).then((rows) => rows.map((r) => ({ ...r, brand_id: b.id, brand_name: b.name_en })))
        )
      )
      setOrders(perBrand.flat().sort((a, b) => parseUtcDate(b.created_at) - parseUtcDate(a.created_at)))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (brandFilter !== 'all' && o.brand_id !== brandFilter) return false
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      return true
    })
  }, [orders, brandFilter, statusFilter])

  const totals = useMemo(() => {
    const pending = filtered.filter((o) => o.status === 'pending').length
    const completed = filtered.filter((o) => o.status === 'completed')
    const completedRevenue = completed.reduce((sum, o) => sum + Number(o.total_amount), 0)
    return { pending, completedCount: completed.length, completedRevenue, cancelled: filtered.filter((o) => o.status === 'cancelled').length }
  }, [filtered])

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  if (brands.length === 0) {
    return (
      <EmptyState
        title="No brands have ordering turned on yet"
        description="Turn on ordering for a brand from its Brand info tab to start seeing orders here."
      />
    )
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-xs text-slate">Pending</p>
          <p className="mt-1 font-display text-2xl text-marigold-dark">{totals.pending}</p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-xs text-slate">Completed</p>
          <p className="mt-1 font-display text-2xl text-moss">{totals.completedCount} · ${totals.completedRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-xs text-slate">Cancelled</p>
          <p className="mt-1 font-display text-2xl text-clay">{totals.cancelled}</p>
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
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState title="No orders match this filter" />
        ) : (
          <div className="divide-y divide-sand rounded-lg border border-sand bg-white">
            {filtered.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <p className="font-medium text-ink">{o.table_label || 'No table label'}</p>
                  <p className="text-xs text-slate">
                    {o.brand_name} · {parseUtcDate(o.created_at).toLocaleString()}
                    {o.placed_by_name && ` · ${o.placed_by_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONES[o.status]}>{o.status}</Badge>
                  {o.billed && <Badge tone="default">Billed</Badge>}
                  <span className="font-display text-lg text-marigold-dark">${Number(o.total_amount).toFixed(2)}</span>
                  <Link
                    to={`/admin/brands/${o.brand_id}`}
                    className="flex items-center gap-1 rounded-md border border-sand px-3 py-1.5 text-sm text-slate hover:text-ink"
                  >
                    <ExternalLink size={14} /> Open brand
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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { brandsApi, ordersApi } from '../services/resources'
import { Badge, EmptyState, Select } from '../components/ui'
import { usePolling } from '../hooks/usePolling'
import { ExternalLink, Check, X, RotateCcw, Receipt, Clock } from 'lucide-react'

const STATUS_TONES = { pending: 'accent', completed: 'success', cancelled: 'danger' }

function parseUtcDate(dateString) {
  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(dateString)
  return new Date(hasTimezone ? dateString : `${dateString}Z`)
}

/**
 * Cross-brand, LIVE order board — first-class sidebar item rather than a
 * tab buried in Reports, since watching for and acting on incoming orders
 * is an operational task (a manager needs to act now), not an analytical
 * one. Scoped the same way brandsApi.list() scopes everything else:
 * Level1 sees every brand, Level2 their group's brands, Level3 their one.
 *
 * Deliberately a flat list rather than OrdersView's "by table" grouping —
 * grouping by table_label alone would silently merge two different
 * brands' "Table 9" into one card, which is fine within a single brand
 * (OrdersTab/StaffOrdersPage) but wrong once orders span brands.
 */
export default function OrderingPage() {
  const navigate = useNavigate()
  const [brands, setBrands] = useState([])
  const [orders, setOrders] = useState([]) // flattened, tagged with brand_id/brand_name
  const [brandFilter, setBrandFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active') // active (pending) | completed | cancelled | all
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState(null)

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => { load() }, [load])
  usePolling(load, 15000)

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (brandFilter !== 'all' && o.brand_id !== brandFilter) return false
      if (statusFilter === 'active') return o.status === 'pending'
      if (statusFilter !== 'all') return o.status === statusFilter
      return true
    })
  }, [orders, brandFilter, statusFilter])

  // Brand objects from brandsApi.list() already carry billing_enabled, so no
  // extra fetch is needed — just index the ones we already have by id.
  const billingByBrand = useMemo(() => {
    const map = {}
    for (const b of brands) map[b.id] = !!b.billing_enabled
    return map
  }, [brands])

  const totals = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'pending').length
    const completed = orders.filter((o) => o.status === 'completed')
    return {
      pending,
      completedCount: completed.length,
      completedRevenue: completed.reduce((sum, o) => sum + Number(o.total_amount), 0),
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
    }
  }, [orders])

  const changeStatus = async (order, status) => {
    setActioningId(order.id)
    try {
      await ordersApi.updateStatus(order.brand_id, order.id, status)
      await load()
    } catch (err) {
      // Billing may have been turned on for this brand since the list
      // loaded — the backend is the real guard, this just routes to that
      // brand's Billing tab instead of surfacing a raw error.
      if (err.response?.status === 400 && status === 'completed') {
        goToBilling(order)
      } else {
        throw err
      }
    } finally {
      setActioningId(null)
    }
  }

  const goToBilling = (order) => navigate(`/admin/brands/${order.brand_id}`, { state: { tab: 'billing' } })

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  if (brands.length === 0) {
    return (
      <div>
        <h1 className="font-display text-2xl text-ink">Ordering</h1>
        <p className="mt-1 text-sm text-slate">Live orders across every brand you manage.</p>
        <div className="mt-6">
          <EmptyState
            title="No brands have ordering turned on yet"
            description="Turn on ordering for a brand from its Brand info tab to start seeing orders here."
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Ordering</h1>
      <p className="mt-1 text-sm text-slate">Live orders across every brand you manage — updates automatically.</p>

      <div className="mt-6 grid grid-cols-3 gap-4">
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {brands.length > 1 && (
            <Select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="w-56">
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name_en}</option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex gap-1 rounded-md border border-sand bg-white p-1">
          {[
            ['active', 'Pending'],
            ['completed', 'Completed'],
            ['cancelled', 'Cancelled'],
            ['all', 'All'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded px-3 py-1.5 text-sm ${statusFilter === key ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState title="No orders match this filter" />
        ) : (
          <div className="divide-y divide-sand rounded-lg border border-sand bg-white">
            {filtered.map((o) => (
              <div key={o.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink">{o.table_label || 'No table label'}</p>
                    <Badge>{o.brand_name}</Badge>
                    <Badge tone={STATUS_TONES[o.status]}>{o.status}</Badge>
                    {o.billed && <Badge tone="default">Billed</Badge>}
                  </div>
                  <span className="font-display text-lg text-marigold-dark">${Number(o.total_amount).toFixed(2)}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate">
                  {parseUtcDate(o.created_at).toLocaleString()}
                  {o.placed_by_name && ` · ${o.placed_by_name}`}
                </p>
                <ul className="mt-2 space-y-0.5 text-sm text-slate">
                  {o.items.map((item, i) => (
                    <li key={i}>{item.quantity}x {item.food_name_en}</li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center gap-2">
                  {o.status === 'pending' ? (
                    <>
                      {billingByBrand[o.brand_id] ? (
                        o.billed ? (
                          <button
                            onClick={() => goToBilling(o)}
                            className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-slate ring-1 ring-inset ring-sand hover:text-ink"
                          >
                            <Clock size={12} /> Awaiting payment
                          </button>
                        ) : (
                          <button
                            onClick={() => goToBilling(o)}
                            className="flex items-center gap-1 rounded-full bg-moss px-2.5 py-1 text-xs font-medium text-white hover:bg-moss/90"
                          >
                            <Receipt size={12} /> Bill to complete
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => changeStatus(o, 'completed')}
                          disabled={actioningId === o.id}
                          className="flex items-center gap-1 rounded-full bg-moss px-2.5 py-1 text-xs font-medium text-white hover:bg-moss/90 disabled:opacity-50"
                        >
                          <Check size={12} /> Complete
                        </button>
                      )}
                      <button
                        onClick={() => changeStatus(o, 'cancelled')}
                        disabled={actioningId === o.id}
                        className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-clay ring-1 ring-inset ring-clay/30 hover:bg-clay/5 disabled:opacity-50"
                      >
                        <X size={12} /> Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => changeStatus(o, 'pending')}
                      disabled={actioningId === o.id}
                      className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-slate hover:text-ink disabled:opacity-50"
                    >
                      <RotateCcw size={12} /> Reopen
                    </button>
                  )}
                  <Link
                    to={`/admin/brands/${o.brand_id}`}
                    className="flex items-center gap-1 rounded-md border border-sand px-3 py-1.5 text-xs text-slate hover:text-ink"
                  >
                    <ExternalLink size={12} /> Open brand
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

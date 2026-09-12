import { useMemo, useState } from 'react'
import { Badge } from './ui'
import { List, Receipt, Check, X, RotateCcw } from 'lucide-react'

const STATUS_TONES = { pending: 'accent', completed: 'success', cancelled: 'danger' }
const STATUS_LABELS = { pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' }
const TELEGRAM_TONES = { sent: 'success', failed: 'danger', not_configured: 'default' }
const TELEGRAM_LABELS = { sent: 'Sent to Telegram', failed: 'Telegram failed', not_configured: 'No Telegram set up' }

// The backend sends UTC timestamps without a timezone marker (e.g.
// "2026-09-09T15:51:46"). Without a marker, browsers wrongly assume the
// string is already in the viewer's local time and skip conversion — which
// silently shifts every displayed time by the local UTC offset (7 hours
// early for Cambodia). Appending "Z" tells the browser it's UTC, so it
// converts to the viewer's actual local time correctly.
function parseUtcDate(dateString) {
  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(dateString)
  return new Date(hasTimezone ? dateString : `${dateString}Z`)
}

/**
 * Shared by the admin Orders tab and the staff Orders page. Groups orders by
 * table for at-a-glance billing totals, with a status filter and per-order
 * status actions (mark completed / cancel / reopen).
 */
export default function OrdersView({ orders, onStatusChange }) {
  const [view, setView] = useState('table')
  const [statusFilter, setStatusFilter] = useState('active') // active (pending) | completed | cancelled | all

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return orders
    if (statusFilter === 'active') return orders.filter((o) => o.status === 'pending')
    return orders.filter((o) => o.status === statusFilter)
  }, [orders, statusFilter])

  const tableGroups = useMemo(() => {
    const groups = {}
    for (const o of filtered) {
      const key = o.table_label || '__no_table__'
      if (!groups[key]) groups[key] = { label: o.table_label || 'No table label', orders: [], total: 0 }
      groups[key].orders.push(o)
      if (o.status !== 'cancelled') groups[key].total += Number(o.total_amount)
    }
    return Object.values(groups).sort((a, b) => {
      const aLatest = Math.max(...a.orders.map((o) => parseUtcDate(o.created_at).getTime()))
      const bLatest = Math.max(...b.orders.map((o) => parseUtcDate(o.created_at).getTime()))
      return bLatest - aLatest
    })
  }, [filtered])

  if (orders.length === 0) {
    return <p className="py-12 text-center text-sm text-slate">No orders yet.</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
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
        <div className="flex gap-1 rounded-md border border-sand bg-white p-1">
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${view === 'table' ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}
          >
            <Receipt size={14} /> By table
          </button>
          <button
            onClick={() => setView('all')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${view === 'all' ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}
          >
            <List size={14} /> All orders
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate">No orders in this view.</p>
      ) : view === 'table' ? (
        <ByTableView groups={tableGroups} onStatusChange={onStatusChange} />
      ) : (
        <FlatView orders={filtered} onStatusChange={onStatusChange} />
      )}
    </div>
  )
}

function StatusActions({ order, onStatusChange }) {
  if (order.status === 'pending') {
    return (
      <div className="flex gap-1">
        <button
          onClick={() => onStatusChange(order.id, 'completed')}
          className="flex items-center gap-1 rounded-full bg-moss px-2.5 py-1 text-xs font-medium text-white hover:bg-moss/90"
        >
          <Check size={12} /> Complete
        </button>
        <button
          onClick={() => onStatusChange(order.id, 'cancelled')}
          className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-clay ring-1 ring-inset ring-clay/30 hover:bg-clay/5"
        >
          <X size={12} /> Cancel
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={() => onStatusChange(order.id, 'pending')}
      className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-slate hover:text-ink"
    >
      <RotateCcw size={12} /> Reopen
    </button>
  )
}

function ByTableView({ groups, onStatusChange }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label} className="overflow-hidden rounded-lg border border-sand bg-white">
          <div className="flex items-center justify-between bg-paper px-5 py-3">
            <div>
              <p className="font-medium text-ink">{group.label}</p>
              <p className="text-xs text-slate">{group.orders.length} order{group.orders.length === 1 ? '' : 's'}</p>
            </div>
            <span className="font-display text-2xl text-marigold-dark">${group.total.toFixed(2)}</span>
          </div>
          <div className="divide-y divide-sand">
            {group.orders
              .slice()
              .sort((a, b) => parseUtcDate(a.created_at) - parseUtcDate(b.created_at))
              .map((o) => (
                <div key={o.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate">
                      {parseUtcDate(o.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      {o.placed_by_name && ` · ${o.placed_by_name}`}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                      <span className="text-sm font-medium text-ink">${Number(o.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate">
                    {o.items.map((item, i) => (
                      <li key={i}>{item.quantity}x {item.food_name_en}</li>
                    ))}
                  </ul>
                  <div className="mt-2">
                    <StatusActions order={o} onStatusChange={onStatusChange} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FlatView({ orders, onStatusChange }) {
  return (
    <div className="divide-y divide-sand rounded-lg border border-sand bg-white">
      {orders.map((o) => (
        <div key={o.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="font-medium text-ink">{o.table_label || 'No table label'}</p>
              {o.zone_name_en && <Badge>{o.zone_name_en}</Badge>}
              <Badge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
              <Badge tone={TELEGRAM_TONES[o.telegram_notified]}>{TELEGRAM_LABELS[o.telegram_notified]}</Badge>
            </div>
            <span className="font-display text-lg text-marigold-dark">${Number(o.total_amount).toFixed(2)}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate">
            {o.placed_by_name && `${o.placed_by_name} · `}
            {parseUtcDate(o.created_at).toLocaleString()}
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-slate">
            {o.items.map((item, i) => (
              <li key={i}>
                {item.quantity}x {item.food_name_en} — ${Number(item.line_total).toFixed(2)}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <StatusActions order={o} onStatusChange={onStatusChange} />
          </div>
        </div>
      ))}
    </div>
  )
}

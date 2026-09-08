import { useEffect, useState } from 'react'
import { ordersApi } from '../../services/resources'
import { Badge, EmptyState } from '../ui'

const STATUS_TONES = { sent: 'success', failed: 'danger', not_configured: 'default' }
const STATUS_LABELS = { sent: 'Sent to Telegram', failed: 'Telegram failed', not_configured: 'No Telegram set up' }

export default function OrdersTab({ brandId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ordersApi.list(brandId).then((data) => { setOrders(data); setLoading(false) })
  }, [brandId])

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  if (orders.length === 0) {
    return <EmptyState title="No orders yet" description="Orders placed by staff from the menu display will show up here." />
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate">The most recent 100 orders, newest first.</p>
      <div className="divide-y divide-sand rounded-lg border border-sand bg-white">
        {orders.map((o) => (
          <div key={o.id} className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="font-medium text-ink">{o.table_label || 'No table label'}</p>
                {o.zone_name_en && <Badge>{o.zone_name_en}</Badge>}
                <Badge tone={STATUS_TONES[o.telegram_notified]}>{STATUS_LABELS[o.telegram_notified]}</Badge>
              </div>
              <span className="font-display text-lg text-marigold-dark">${Number(o.total_amount).toFixed(2)}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate">
              {o.placed_by_name && `${o.placed_by_name} · `}
              {new Date(o.created_at).toLocaleString()}
            </p>
            <ul className="mt-2 space-y-0.5 text-sm text-slate">
              {o.items.map((item, i) => (
                <li key={i}>
                  {item.quantity}x {item.food_name_en} — ${Number(item.line_total).toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

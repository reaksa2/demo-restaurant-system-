import { useEffect, useState } from 'react'
import { useAuth } from '../stores/authStore'
import { ordersApi, brandsApi } from '../services/resources'
import OrdersView from '../components/OrdersView'
import BillingTab from '../components/brand/BillingTab'
import { usePolling } from '../hooks/usePolling'

/**
 * The Sales role's home: live orders for their one brand, plus checkout /
 * payment (Billing) when the brand has billing turned on. Same engine as the
 * staff orders screen, but inside the admin layout so a salesperson gets the
 * sidebar, profile menu and nothing else — no menu editing, no reports, no
 * user management (see backend/app/core/modules.py).
 */
export default function SalesPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [brand, setBrand] = useState(null)
  const [tab, setTab] = useState('orders')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () =>
    Promise.all([ordersApi.list(user.brand_id), brandsApi.get(user.brand_id)])
      .then(([orderData, b]) => {
        setOrders(orderData)
        setBrand(b)
        setLoading(false)
      })
      .catch(() => { setError('Could not load orders.'); setLoading(false) })

  useEffect(() => { load() }, [])
  usePolling(() => (tab === 'orders' ? load() : Promise.resolve()), 15000)

  const billingEnabled = !!brand?.billing_enabled

  const handleStatusChange = async (orderId, status) => {
    try {
      await ordersApi.updateStatus(user.brand_id, orderId, status)
      load()
    } catch (err) {
      // Billing may have been turned on since this list loaded — the
      // backend is the real guard; route to checkout instead of an error.
      if (err.response?.status === 400 && status === 'completed') setTab('billing')
      else throw err
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Sales</h1>
      <p className="mt-1 text-sm text-slate">
        {brand ? `${brand.name_en} — ` : ''}live orders{billingEnabled ? ' and checkout' : ''}.
      </p>

      {billingEnabled && (
        <div className="mt-6 flex w-fit gap-1 rounded-md border border-sand bg-white p-1">
          {[['orders', 'Orders'], ['billing', 'Billing']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded px-3 py-1.5 text-sm ${tab === key ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : error ? (
          <p className="text-sm text-clay">{error}</p>
        ) : tab === 'billing' && billingEnabled ? (
          <BillingTab brandId={user.brand_id} />
        ) : (
          <OrdersView
            orders={orders}
            onStatusChange={handleStatusChange}
            billingEnabled={billingEnabled}
            onNeedsBilling={() => setTab('billing')}
          />
        )}
      </div>
    </div>
  )
}

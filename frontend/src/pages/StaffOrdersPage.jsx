import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/authStore'
import { ordersApi, brandsApi } from '../services/resources'
import { ProfileMenu } from '../components/ProfileMenu'
import OrdersView from '../components/OrdersView'
import BillingTab from '../components/brand/BillingTab'
import { usePolling } from '../hooks/usePolling'
import { ArrowLeft } from 'lucide-react'

export default function StaffOrdersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [billingEnabled, setBillingEnabled] = useState(false)
  const [tab, setTab] = useState('orders')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () =>
    Promise.all([ordersApi.list(user.brand_id), brandsApi.get(user.brand_id)])
      .then(([orderData, brand]) => {
        setOrders(orderData)
        setBillingEnabled(!!brand.billing_enabled)
        setLoading(false)
      })
      .catch(() => { setError('Could not load orders.'); setLoading(false) })

  useEffect(() => { load() }, [])

  // Silent refresh so a new order (or a bill closing one out elsewhere)
  // shows up without staff needing to reload the page — skipped while the
  // Billing tab is active, since BillingTab already polls itself.
  usePolling(() => (tab === 'orders' ? load() : Promise.resolve()), 15000)

  const handleStatusChange = async (orderId, status) => {
    await ordersApi.updateStatus(user.brand_id, orderId, status)
    load()
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-sand bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/staff/menu')} className="flex h-9 w-9 items-center justify-center rounded-full text-slate hover:bg-paper hover:text-ink">
              <ArrowLeft size={18} />
            </button>
            <h1 className="font-display text-2xl text-ink">{tab === 'billing' ? 'Billing' : 'Orders'}</h1>
          </div>
          <ProfileMenu dropDirection="down" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {billingEnabled && (
          <div className="mb-6 flex gap-1 rounded-md border border-sand bg-white p-1 w-fit">
            <button
              onClick={() => setTab('orders')}
              className={`rounded px-3 py-1.5 text-sm ${tab === 'orders' ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}
            >
              Orders
            </button>
            <button
              onClick={() => setTab('billing')}
              className={`rounded px-3 py-1.5 text-sm ${tab === 'billing' ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}
            >
              Billing
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : error ? (
          <p className="text-sm text-clay">{error}</p>
        ) : tab === 'billing' ? (
          <BillingTab brandId={user.brand_id} />
        ) : (
          <OrdersView orders={orders} onStatusChange={handleStatusChange} />
        )}
      </main>
    </div>
  )
}

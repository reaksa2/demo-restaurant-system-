import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/authStore'
import { ordersApi } from '../services/resources'
import { ProfileMenu } from '../components/ProfileMenu'
import OrdersView from '../components/OrdersView'
import { ArrowLeft } from 'lucide-react'

export default function StaffOrdersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () =>
    ordersApi
      .list(user.brand_id)
      .then((data) => { setOrders(data); setLoading(false) })
      .catch(() => { setError('Could not load orders.'); setLoading(false) })

  useEffect(() => { load() }, [])

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
            <h1 className="font-display text-2xl text-ink">Orders</h1>
          </div>
          <ProfileMenu dropDirection="down" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : error ? (
          <p className="text-sm text-clay">{error}</p>
        ) : (
          <OrdersView orders={orders} onStatusChange={handleStatusChange} />
        )}
      </main>
    </div>
  )
}

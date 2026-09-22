import { useEffect, useState } from 'react'
import { ordersApi } from '../../services/resources'
import { EmptyState } from '../ui'
import OrdersView from '../OrdersView'
import { usePolling } from '../../hooks/usePolling'

export default function OrdersTab({ brandId, billingEnabled, onNeedsBilling }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // silent, no setLoading — keeps the list fresh without flashing "Loading…"
  const refresh = () => ordersApi.list(brandId).then((data) => setOrders(data))
  const load = () => refresh().finally(() => setLoading(false))
  useEffect(() => { setLoading(true); load() }, [brandId])
  usePolling(refresh, 15000)

  const handleStatusChange = async (orderId, status) => {
    // Belt-and-suspenders: OrdersView already hides "Complete" in favor of
    // "Bill to complete" when billing is on, but the backend is the real
    // guard (e.g. billing could've been turned on in another tab since this
    // list loaded), so a rejection here still routes to Billing instead of
    // surfacing a raw error.
    try {
      await ordersApi.updateStatus(brandId, orderId, status)
      load()
    } catch (err) {
      if (err.response?.status === 400 && status === 'completed' && onNeedsBilling) {
        onNeedsBilling()
      } else {
        throw err
      }
    }
  }

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  if (orders.length === 0) {
    return <EmptyState title="No orders yet" description="Orders placed by staff from the menu display will show up here." />
  }

  return (
    <OrdersView
      orders={orders}
      onStatusChange={handleStatusChange}
      billingEnabled={billingEnabled}
      onNeedsBilling={onNeedsBilling}
    />
  )
}

import { useEffect, useState } from 'react'
import { ordersApi } from '../../services/resources'
import { EmptyState } from '../ui'
import OrdersView from '../OrdersView'

export default function OrdersTab({ brandId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => ordersApi.list(brandId).then((data) => { setOrders(data); setLoading(false) })
  useEffect(() => { load() }, [brandId])

  const handleStatusChange = async (orderId, status) => {
    await ordersApi.updateStatus(brandId, orderId, status)
    load()
  }

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  if (orders.length === 0) {
    return <EmptyState title="No orders yet" description="Orders placed by staff from the menu display will show up here." />
  }

  return <OrdersView orders={orders} onStatusChange={handleStatusChange} />
}

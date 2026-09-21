import { useState } from 'react'
import OrdersReportTab from './reports/OrdersReportTab'
import BillingReportTab from './reports/BillingReportTab'

const TABS = [
  { key: 'orders', label: 'Orders' },
  { key: 'billing', label: 'Billing' },
  // Stock/Inventory isn't built yet — add a tab here once that module exists,
  // following the same per-brand feature-flag pattern as ordering/billing.
]

/**
 * Cross-brand reporting for Group Managers (all their group's brands) and
 * Brand Managers (their one brand) — same access scoping the rest of the
 * app already uses (brandsApi.list() is scoped server-side per role).
 * Read-only: actually managing an order or a bill still happens from the
 * brand's own tabs, this is just the rolled-up view.
 */
export default function ReportsPage() {
  const [tab, setTab] = useState('orders')

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Reports</h1>
      <p className="mt-1 text-sm text-slate">A rolled-up view across every brand you manage.</p>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-sand">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-marigold text-ink' : 'border-transparent text-slate hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'orders' && <OrdersReportTab />}
        {tab === 'billing' && <BillingReportTab />}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ordersApi, billsApi } from '../../services/resources'
import { Button, Badge, Input, EmptyState } from '../ui'
import { Modal } from '../Modal'
import { Receipt, Printer, CheckCircle2, Ban } from 'lucide-react'

const BILL_STATUS_TONES = { unpaid: 'accent', paid: 'success', void: 'danger' }
const PAYMENT_LABELS = { cash: 'Cash', card: 'Card', qr: 'QR', other: 'Other' }

function parseUtcDate(dateString) {
  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(dateString)
  return new Date(hasTimezone ? dateString : `${dateString}Z`)
}

export default function BillingTab({ brandId }) {
  const [orders, setOrders] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkoutTable, setCheckoutTable] = useState(null) // { label, orders }
  const [viewBill, setViewBill] = useState(null)

  const load = async () => {
    const [o, b] = await Promise.all([ordersApi.list(brandId), billsApi.list(brandId)])
    setOrders(o)
    setBills(b)
    setLoading(false)
  }
  useEffect(() => { load() }, [brandId])

  // Group unbilled, non-cancelled orders by table — these are the tables
  // that still need to be checked out.
  const billableTables = useMemo(() => {
    const groups = {}
    for (const o of orders) {
      if (o.billed || o.status === 'cancelled') continue
      const key = o.table_label || '__no_table__'
      if (!groups[key]) groups[key] = { label: o.table_label || 'No table label', orders: [], total: 0 }
      groups[key].orders.push(o)
      groups[key].total += Number(o.total_amount)
    }
    return Object.values(groups)
  }, [orders])

  const handleBilled = async () => {
    setCheckoutTable(null)
    await load()
  }

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Ready to check out</h3>
        {billableTables.length === 0 ? (
          <EmptyState
            title="Nothing to bill right now"
            description="Once staff place orders, unbilled tables will show up here to check out."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {billableTables.map((g) => (
              <div key={g.label} className="rounded-lg border border-sand bg-white p-4">
                <p className="font-medium text-ink">{g.label}</p>
                <p className="text-xs text-slate">{g.orders.length} order{g.orders.length === 1 ? '' : 's'}</p>
                <p className="mt-2 font-display text-xl text-marigold-dark">${g.total.toFixed(2)}</p>
                <Button className="mt-3 w-full" onClick={() => setCheckoutTable(g)}>
                  <Receipt size={14} /> Check out
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Bills</h3>
        {bills.length === 0 ? (
          <EmptyState title="No bills yet" description="Bills you create from checked-out tables will show up here." />
        ) : (
          <div className="divide-y divide-sand rounded-lg border border-sand bg-white">
            {bills.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <p className="font-medium text-ink">
                    #{String(b.invoice_number).padStart(4, '0')} · {b.table_label || 'No table label'}
                  </p>
                  <p className="text-xs text-slate">
                    {parseUtcDate(b.created_at).toLocaleString()}
                    {b.created_by_name && ` · ${b.created_by_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={BILL_STATUS_TONES[b.status]}>
                    {b.status === 'paid' ? `Paid (${PAYMENT_LABELS[b.payment_method] || ''})` : b.status}
                  </Badge>
                  <span className="font-display text-lg text-marigold-dark">${Number(b.total_amount).toFixed(2)}</span>
                  <Button variant="secondary" onClick={() => setViewBill(b)}>
                    <Printer size={14} /> Invoice
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {checkoutTable && (
        <CheckoutModal
          brandId={brandId}
          table={checkoutTable}
          onClose={() => setCheckoutTable(null)}
          onBilled={handleBilled}
        />
      )}

      {viewBill && (
        <InvoiceModal
          brandId={brandId}
          bill={viewBill}
          onClose={() => setViewBill(null)}
          onChanged={async (updated) => {
            setViewBill(updated)
            await load()
          }}
        />
      )}
    </div>
  )
}

function CheckoutModal({ brandId, table, onClose, onBilled }) {
  const [discount, setDiscount] = useState('0')
  const [taxRate, setTaxRate] = useState('0')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const subtotal = table.total
  const discountNum = Number(discount) || 0
  const taxRateNum = Number(taxRate) || 0
  const taxable = Math.max(subtotal - discountNum, 0)
  const taxAmount = (taxable * taxRateNum) / 100
  const total = taxable + taxAmount

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await billsApi.create(brandId, {
        order_ids: table.orders.map((o) => o.id),
        discount_amount: discount || '0',
        tax_rate: taxRate || '0',
        notes: notes || null,
      })
      onBilled()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create the bill.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Check out — ${table.label}`}>
      <form onSubmit={submit} className="space-y-4">
        <ul className="space-y-1 rounded-md border border-sand bg-paper p-3 text-sm text-ink">
          {table.orders.flatMap((o) => o.items).reduce((acc, item) => {
            const key = `${item.food_name_en}|${item.unit_price}`
            const existing = acc.find((a) => a.key === key)
            if (existing) existing.quantity += item.quantity
            else acc.push({ key, name: item.food_name_en, price: Number(item.unit_price), quantity: item.quantity })
            return acc
          }, []).map((line) => (
            <li key={line.key} className="flex justify-between">
              <span>{line.quantity}x {line.name}</span>
              <span>${(line.price * line.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Discount ($)" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <Input label="Tax rate (%)" type="number" min="0" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </div>
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="space-y-1 border-t border-sand pt-3 text-sm">
          <div className="flex justify-between text-slate"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate"><span>Discount</span><span>-${discountNum.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate"><span>Tax ({taxRateNum || 0}%)</span><span>${taxAmount.toFixed(2)}</span></div>
          <div className="flex justify-between text-base font-semibold text-ink"><span>Total</span><span>${total.toFixed(2)}</span></div>
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create bill'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function InvoiceModal({ brandId, bill, onClose, onChanged }) {
  const [busy, setBusy] = useState(false)

  const markPaid = async (method) => {
    setBusy(true)
    try {
      const updated = await billsApi.pay(brandId, bill.id, method)
      onChanged(updated)
    } finally {
      setBusy(false)
    }
  }

  const voidBill = async () => {
    setBusy(true)
    try {
      const updated = await billsApi.void(brandId, bill.id)
      onChanged(updated)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Invoice #${String(bill.invoice_number).padStart(4, '0')}`}>
      <div id="invoice-print" className="space-y-3">
        <div className="flex justify-between text-sm text-slate">
          <span>{bill.table_label || 'No table label'}</span>
          <span>{parseUtcDate(bill.created_at).toLocaleString()}</span>
        </div>
        <ul className="space-y-1 rounded-md border border-sand p-3 text-sm">
          {bill.items.map((item, i) => (
            <li key={i} className="flex justify-between">
              <span>{item.quantity}x {item.food_name_en}</span>
              <span>${Number(item.line_total).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-sand pt-3 text-sm">
          <div className="flex justify-between text-slate"><span>Subtotal</span><span>${Number(bill.subtotal).toFixed(2)}</span></div>
          <div className="flex justify-between text-slate"><span>Discount</span><span>-${Number(bill.discount_amount).toFixed(2)}</span></div>
          <div className="flex justify-between text-slate"><span>Tax ({Number(bill.tax_rate)}%)</span><span>${Number(bill.tax_amount).toFixed(2)}</span></div>
          <div className="flex justify-between text-base font-semibold text-ink"><span>Total</span><span>${Number(bill.total_amount).toFixed(2)}</span></div>
        </div>
        {bill.notes && <p className="text-xs text-slate">Note: {bill.notes}</p>}

        <div className="flex items-center gap-2 pt-2">
          <Badge tone={BILL_STATUS_TONES[bill.status]}>
            {bill.status === 'paid' ? `Paid via ${PAYMENT_LABELS[bill.payment_method] || ''}` : bill.status}
          </Badge>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-sand pt-4">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </Button>
        {bill.status === 'unpaid' && (
          <>
            <Button variant="secondary" onClick={voidBill} disabled={busy}>
              <Ban size={14} /> Void
            </Button>
            {['cash', 'card', 'qr'].map((m) => (
              <Button key={m} onClick={() => markPaid(m)} disabled={busy}>
                <CheckCircle2 size={14} /> Paid ({PAYMENT_LABELS[m]})
              </Button>
            ))}
          </>
        )}
      </div>
    </Modal>
  )
}

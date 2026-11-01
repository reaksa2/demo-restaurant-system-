import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../stores/authStore'
import { purchasingApi, stockApi } from '../services/resources'
import { Button, Input, Select, Badge, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { BrandPicker, useBrands } from '../components/BrandPicker'
import { can } from '../lib/access'
import { money, qty, downloadCsv, ymd } from '../lib/format'
import { Plus, Pencil, Trash2, Download, Truck, PackageCheck, Wallet, X } from 'lucide-react'

const TONES = { draft: 'default', ordered: 'accent', received: 'success', cancelled: 'danger' }
const METHODS = ['cash', 'bank', 'card', 'qr', 'other']
const apiErr = (err, fallback) => { const d = err.response?.data?.detail; return typeof d === 'string' ? d : fallback }
const when = (s) => new Date(s + (/[Zz]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')).toLocaleDateString()

export default function PurchasingPage() {
  const { user } = useAuth()
  const canManage = can(user, 'purchasing.manage')
  const canPay = can(user, 'purchasing.pay')
  const { brands, brandId, setBrandId, loading: brandsLoading } = useBrands()
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [loading, setLoading] = useState(false)
  const [poModal, setPoModal] = useState(null)
  const [supModal, setSupModal] = useState(null)
  const [payModal, setPayModal] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!brandId) return
    setLoading(true)
    try {
      const [o, s] = await Promise.all([purchasingApi.orders(brandId), purchasingApi.suppliers(brandId)])
      setOrders(o); setSuppliers(s)
    } finally { setLoading(false) }
  }, [brandId])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (brandId && can(user, 'inventory.view')) stockApi.list(brandId).then(setStockItems).catch(() => setStockItems([])) }, [brandId, user])

  const owed = useMemo(() => orders.filter((o) => o.status === 'received').reduce((s, o) => s + Number(o.balance), 0), [orders])
  const shown = orders.filter((o) => statusFilter === 'all' ? true : statusFilter === 'open' ? ['draft', 'ordered'].includes(o.status) : statusFilter === 'unpaid' ? o.status === 'received' && Number(o.balance) > 0 : o.status === statusFilter)

  const act = async (fn, fallback) => { try { await fn(); load(); if (can(user, 'inventory.view')) stockApi.list(brandId).then(setStockItems).catch(() => {}) } catch (err) { alert(apiErr(err, fallback)) } }
  const setStatus = (po, status, msg) => { if (msg && !confirm(msg)) return; act(() => purchasingApi.setStatus(brandId, po.id, status), 'Could not update the order.') }

  const savePo = async (e) => {
    e.preventDefault(); setError('')
    const lines = poModal.lines.filter((l) => l.stock_item_id && Number(l.quantity) > 0)
    if (!lines.length) { setError('Add at least one item with a quantity.'); return }
    try {
      await purchasingApi.createOrder(brandId, { supplier_id: poModal.supplier_id || null, note: poModal.note || null, items: lines.map((l) => ({ stock_item_id: l.stock_item_id, quantity: l.quantity, unit_cost: l.unit_cost === '' ? 0 : l.unit_cost })) })
      setPoModal(null); load()
    } catch (err) { setError(apiErr(err, 'Could not create the order.')) }
  }
  const saveSupplier = async (e) => {
    e.preventDefault(); setError('')
    const f = supModal.form
    try {
      if (supModal.id) await purchasingApi.updateSupplier(brandId, supModal.id, { name: f.name, phone: f.phone || null, note: f.note || null, is_active: f.is_active })
      else await purchasingApi.createSupplier(brandId, { name: f.name, phone: f.phone || null, note: f.note || null })
      setSupModal(null); load()
    } catch (err) { setError(apiErr(err, 'Could not save the supplier.')) }
  }
  const savePay = async (e) => {
    e.preventDefault(); setError('')
    try { await purchasingApi.pay(brandId, payModal.po.id, { amount: payModal.amount, payment_method: payModal.method, payment_date: payModal.date }); setPayModal(null); load() }
    catch (err) { setError(apiErr(err, 'Could not record the payment.')) }
  }

  const exportCsv = () => downloadCsv('purchase_orders.csv', ['PO #', 'Date', 'Supplier', 'Status', 'Total', 'Paid', 'Balance'],
    orders.map((o) => [o.po_number, when(o.created_at), o.supplier_name || '', o.status, Number(o.total_amount).toFixed(2), Number(o.paid_amount).toFixed(2), Number(o.balance).toFixed(2)]))

  if (brandsLoading) return <p className="text-sm text-slate">Loading…</p>
  if (!brandId) return <EmptyState title="No brand available" />
  const poTotal = poModal ? poModal.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0) : 0

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Purchasing</h1>
          <p className="mt-1 text-sm text-slate">Suppliers, purchase orders and what you still owe.</p>
        </div>
        {canManage && tab === 'orders' && <Button onClick={() => { setError(''); setPoModal({ supplier_id: '', note: '', lines: [{ stock_item_id: '', quantity: '', unit_cost: '' }] }) }}><Plus size={16} /> New purchase order</Button>}
        {canManage && tab === 'suppliers' && <Button onClick={() => { setError(''); setSupModal({ form: { name: '', phone: '', note: '', is_active: true } }) }}><Plus size={16} /> New supplier</Button>}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BrandPicker brands={brands} brandId={brandId} onChange={setBrandId} />
        <div className="flex gap-1 rounded-md border border-sand bg-white p-1">
          {[['orders', 'Purchase orders'], ['suppliers', 'Suppliers']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded px-3 py-1.5 text-sm ${tab === k ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}>{l}</button>
          ))}
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={!orders.length}><Download size={15} /> Excel (CSV)</Button>
      </div>

      <div className="mt-6 rounded-lg border border-sand bg-white p-4 sm:w-72">
        <p className="text-xs text-slate">Owed to suppliers (received, unpaid)</p>
        <p className={`mt-1 font-display text-2xl ${owed > 0 ? 'text-clay' : 'text-moss'}`}>{money(owed)}</p>
      </div>

      {tab === 'orders' ? (
        <div className="mt-6">
          <div className="mb-3 w-52"><Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter">
            <option value="open">Open (draft / ordered)</option><option value="unpaid">Received, unpaid</option><option value="received">Received</option><option value="cancelled">Cancelled</option><option value="all">All</option>
          </Select></div>
          {loading && orders.length === 0 ? <p className="text-sm text-slate">Loading…</p> : shown.length === 0 ? <EmptyState title="No purchase orders here" /> : (
            <div className="space-y-3">
              {shown.map((o) => (
                <div key={o.id} className="rounded-lg border border-sand bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">PO #{String(o.po_number).padStart(4, '0')} <Badge tone={TONES[o.status]}>{o.status}</Badge></p>
                      <p className="text-xs text-slate">{o.supplier_name || 'No supplier'} · {when(o.created_at)}{o.note ? ` · ${o.note}` : ''}</p>
                    </div>
                    <div className="text-right"><p className="font-display text-lg tabular-nums">{money(o.total_amount)}</p>
                      {o.status === 'received' && <p className={`text-xs ${Number(o.balance) > 0 ? 'text-clay' : 'text-moss'}`}>{Number(o.balance) > 0 ? `Owe ${money(o.balance)}` : 'Paid in full'}</p>}</div>
                  </div>
                  <p className="mt-2 text-xs text-slate">{o.items.map((i) => `${qty(i.quantity)} ${i.unit || ''} ${i.item_name} @ ${money(i.unit_cost)}`).join(' · ')}</p>
                  <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                    {canManage && o.status === 'draft' && <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setStatus(o, 'ordered')}><Truck size={13} /> Mark as ordered</Button>}
                    {canManage && o.status === 'ordered' && <Button className="!py-1.5 text-xs" onClick={() => setStatus(o, 'received', 'Mark as received? This adds the items to stock.')}><PackageCheck size={13} /> Mark received (adds stock)</Button>}
                    {canManage && ['draft', 'ordered'].includes(o.status) && <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => setStatus(o, 'cancelled', 'Cancel this purchase order?')}><X size={13} /> Cancel</Button>}
                    {canPay && o.status === 'received' && Number(o.balance) > 0 && <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => { setError(''); setPayModal({ po: o, amount: o.balance, method: 'cash', date: ymd(new Date()) }) }}><Wallet size={13} /> Pay supplier</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          {suppliers.length === 0 ? <EmptyState title="No suppliers yet" /> : (
            <div className="divide-y divide-sand overflow-hidden rounded-lg border border-sand bg-white">
              {suppliers.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div><p className="text-sm text-ink">{s.name} {!s.is_active && <Badge>inactive</Badge>}</p><p className="text-xs text-slate">{[s.phone, s.note].filter(Boolean).join(' · ') || '—'}</p></div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm tabular-nums ${Number(s.balance_owed) > 0 ? 'text-clay' : 'text-slate'}`}>{Number(s.balance_owed) > 0 ? `Owe ${money(s.balance_owed)}` : 'Settled'}</span>
                    {canManage && <Button variant="ghost" onClick={() => { setError(''); setSupModal({ id: s.id, form: { name: s.name, phone: s.phone || '', note: s.note || '', is_active: s.is_active } }) }}><Pencil size={15} /></Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={!!poModal} onClose={() => setPoModal(null)} title="New purchase order" width="max-w-2xl">
        {poModal && (
          <form onSubmit={savePo} className="space-y-3">
            <Select label="Supplier" value={poModal.supplier_id} onChange={(e) => setPoModal({ ...poModal, supplier_id: e.target.value })}>
              <option value="">— none —</option>{suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <div className="space-y-2">
              {poModal.lines.map((l, idx) => {
                const set = (patch) => setPoModal({ ...poModal, lines: poModal.lines.map((x, i) => (i === idx ? { ...x, ...patch } : x)) })
                const it = stockItems.find((i) => i.id === l.stock_item_id)
                return (
                  <div key={idx} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[10rem] flex-1"><Select value={l.stock_item_id} onChange={(e) => { const s = stockItems.find((i) => i.id === e.target.value); set({ stock_item_id: e.target.value, unit_cost: l.unit_cost === '' && s && Number(s.avg_cost) > 0 ? Number(s.avg_cost).toFixed(2) : l.unit_cost }) }}>
                      <option value="">Select item…</option>{stockItems.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.name_en} ({i.unit})</option>)}
                    </Select></div>
                    <div className="w-24"><Input type="number" step="0.001" min="0" placeholder={it ? `Qty ${it.unit}` : 'Qty'} value={l.quantity} onChange={(e) => set({ quantity: e.target.value })} /></div>
                    <div className="w-28"><Input type="number" step="0.0001" min="0" placeholder="$ / unit" value={l.unit_cost} onChange={(e) => set({ unit_cost: e.target.value })} /></div>
                    <Button type="button" variant="ghost" onClick={() => setPoModal({ ...poModal, lines: poModal.lines.filter((_, i) => i !== idx) })}><Trash2 size={15} /></Button>
                  </div>
                )
              })}
            </div>
            <Button type="button" variant="secondary" onClick={() => setPoModal({ ...poModal, lines: [...poModal.lines, { stock_item_id: '', quantity: '', unit_cost: '' }] })}><Plus size={14} /> Add item</Button>
            <Input label="Note (optional)" value={poModal.note} onChange={(e) => setPoModal({ ...poModal, note: e.target.value })} />
            <p className="text-right text-sm text-ink">Total: <span className="font-display text-lg">{money(poTotal)}</span></p>
            {stockItems.length === 0 && <p className="text-xs text-clay">Add stock items in Inventory first — purchase lines are picked from them.</p>}
            {error && <p className="text-sm text-clay">{error}</p>}
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setPoModal(null)}>Cancel</Button><Button type="submit">Create order</Button></div>
          </form>
        )}
      </Modal>

      <Modal open={!!supModal} onClose={() => setSupModal(null)} title={supModal?.id ? 'Edit supplier' : 'New supplier'}>
        {supModal && (
          <form onSubmit={saveSupplier} className="space-y-4">
            <Input label="Name" required value={supModal.form.name} onChange={(e) => setSupModal({ ...supModal, form: { ...supModal.form, name: e.target.value } })} />
            <Input label="Phone" value={supModal.form.phone} onChange={(e) => setSupModal({ ...supModal, form: { ...supModal.form, phone: e.target.value } })} />
            <Input label="Note" value={supModal.form.note} onChange={(e) => setSupModal({ ...supModal, form: { ...supModal.form, note: e.target.value } })} />
            {supModal.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={supModal.form.is_active} onChange={(e) => setSupModal({ ...supModal, form: { ...supModal.form, is_active: e.target.checked } })} /> Active</label>}
            {error && <p className="text-sm text-clay">{error}</p>}
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setSupModal(null)}>Cancel</Button><Button type="submit">Save</Button></div>
          </form>
        )}
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={payModal ? `Pay supplier · PO #${String(payModal.po.po_number).padStart(4, '0')}` : ''}>
        {payModal && (
          <form onSubmit={savePay} className="space-y-4">
            <p className="text-sm text-slate">Balance owed: <span className="text-clay">{money(payModal.po.balance)}</span>. This also records an expense.</p>
            <Input label="Amount ($)" type="number" step="0.01" min="0.01" max={payModal.po.balance} required value={payModal.amount} onChange={(e) => setPayModal({ ...payModal, amount: e.target.value })} />
            <Select label="Paid by" value={payModal.method} onChange={(e) => setPayModal({ ...payModal, method: e.target.value })}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
            <Input label="Date" type="date" required value={payModal.date} onChange={(e) => setPayModal({ ...payModal, date: e.target.value })} />
            {error && <p className="text-sm text-clay">{error}</p>}
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button><Button type="submit">Record payment</Button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

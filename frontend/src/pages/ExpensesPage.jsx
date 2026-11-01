import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../stores/authStore'
import { expensesApi, purchasingApi } from '../services/resources'
import { Button, Input, Select, Badge, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { BrandPicker, PeriodPicker, useBrands } from '../components/BrandPicker'
import { can } from '../lib/access'
import { money, PERIODS, periodRange, downloadCsv, ymd } from '../lib/format'
import { Plus, Pencil, Trash2, Download } from 'lucide-react'

const METHODS = ['cash', 'bank', 'card', 'qr', 'other']
const blank = () => ({ expense_date: ymd(new Date()), category: 'ingredients', amount: '', description: '', payment_method: 'cash', supplier_id: '' })

export default function ExpensesPage() {
  const { user } = useAuth()
  const canManage = can(user, 'expenses.manage')
  const { brands, brandId, setBrandId, loading: brandsLoading } = useBrands()
  const [period, setPeriod] = useState('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [catFilter, setCatFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null) // null | {id?, form}
  const [error, setError] = useState('')

  const range = useMemo(() => periodRange(period, from, to), [period, from, to])

  const load = useCallback(async () => {
    if (!brandId) return
    setLoading(true)
    try {
      setRows(await expensesApi.list(brandId, { start: range.fromDate, end: range.toDate }))
    } finally { setLoading(false) }
  }, [brandId, range.fromDate, range.toDate])

  useEffect(() => { load() }, [load])
  useEffect(() => { expensesApi.categories().then(setCategories).catch(() => {}) }, [])
  useEffect(() => {
    if (brandId && can(user, 'purchasing.view')) purchasingApi.suppliers(brandId).then(setSuppliers).catch(() => setSuppliers([]))
  }, [brandId, user])

  const shown = rows.filter((r) => !catFilter || r.category === catFilter)
  const total = shown.reduce((s, r) => s + Number(r.amount), 0)
  const byCategory = useMemo(() => {
    const m = {}
    rows.forEach((r) => { m[r.category] = (m[r.category] || 0) + Number(r.amount) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [rows])
  const grand = byCategory.reduce((s, [, v]) => s + v, 0)

  const save = async (e) => {
    e.preventDefault()
    setError('')
    const f = modal.form
    const payload = {
      expense_date: f.expense_date, category: f.category, amount: f.amount, description: f.description || null,
      payment_method: f.payment_method || null, supplier_id: f.supplier_id || null,
    }
    try {
      if (modal.id) await expensesApi.update(brandId, modal.id, payload)
      else await expensesApi.create(brandId, payload)
      setModal(null)
      load()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Could not save the expense.')
    }
  }

  const remove = async (r) => {
    if (!confirm(`Delete this ${money(r.amount)} ${r.category} expense?`)) return
    try { await expensesApi.remove(brandId, r.id); load() } catch (err) { alert(err.response?.data?.detail || 'Could not delete.') }
  }

  const exportCsv = () =>
    downloadCsv(`expenses_${range.fromDate}_${range.toDate}.csv`,
      ['Date', 'Category', 'Description', 'Supplier', 'Method', 'Amount'],
      shown.map((r) => [r.expense_date, r.category, r.description || '', r.supplier_name || '', r.payment_method || '', Number(r.amount).toFixed(2)]))

  if (brandsLoading) return <p className="text-sm text-slate">Loading…</p>
  if (!brandId) return <EmptyState title="No brand available" description="There is no brand assigned to your account yet." />

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Expenses</h1>
          <p className="mt-1 text-sm text-slate">Money going out — rent, salaries, utilities, supplier payments.</p>
        </div>
        {canManage && <Button onClick={() => { setError(''); setModal({ form: blank() }) }}><Plus size={16} /> Add expense</Button>}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <BrandPicker brands={brands} brandId={brandId} onChange={setBrandId} />
        <PeriodPicker period={period} onPeriod={setPeriod} from={from} to={to} onFrom={setFrom} onTo={setTo} periods={PERIODS} />
        <div className="w-44 print:hidden">
          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={!shown.length}><Download size={15} /> Excel (CSV)</Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-xs text-slate">Total {catFilter ? `· ${catFilter}` : ''} · {range.label}</p>
          <p className="mt-1 font-display text-2xl text-clay">{money(total)}</p>
          <p className="mt-1 text-xs text-slate">{shown.length} expense{shown.length === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4 md:col-span-2">
          <p className="mb-2 text-xs text-slate">By category</p>
          {byCategory.length === 0 ? <p className="text-sm text-slate">Nothing recorded in this period.</p> : (
            <div className="space-y-1.5">
              {byCategory.map(([c, v]) => (
                <div key={c} className="flex items-center gap-3 text-sm">
                  <span className="w-28 capitalize text-ink">{c}</span>
                  <div className="h-2 flex-1 rounded bg-paper"><div className="h-2 rounded bg-marigold" style={{ width: `${grand ? (v / grand) * 100 : 0}%` }} /></div>
                  <span className="w-24 text-right tabular-nums text-ink">{money(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        {loading && rows.length === 0 ? <p className="text-sm text-slate">Loading…</p> : shown.length === 0 ? (
          <EmptyState title="No expenses" description="Nothing matches this period / category." />
        ) : (
          <div className="divide-y divide-sand overflow-hidden rounded-lg border border-sand bg-white">
            {shown.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    <span className="capitalize">{r.category}</span>
                    {r.purchase_order_id && <Badge tone="accent">Supplier payment</Badge>}
                    {r.supplier_name && <span className="text-slate">· {r.supplier_name}</span>}
                  </p>
                  <p className="text-xs text-slate">{r.expense_date}{r.payment_method ? ` · ${r.payment_method}` : ''}{r.description ? ` · ${r.description}` : ''}{r.created_by_name ? ` · by ${r.created_by_name}` : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-display text-lg text-clay tabular-nums">{money(r.amount)}</span>
                  {canManage && !r.purchase_order_id && (
                    <span className="print:hidden">
                      <Button variant="ghost" onClick={() => { setError(''); setModal({ id: r.id, form: { expense_date: r.expense_date, category: r.category, amount: r.amount, description: r.description || '', payment_method: r.payment_method || '', supplier_id: r.supplier_id || '' } }) }}><Pencil size={15} /></Button>
                      <Button variant="ghost" onClick={() => remove(r)}><Trash2 size={15} /></Button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit expense' : 'Add expense'}>
        {modal && (
          <form onSubmit={save} className="space-y-4">
            <Input label="Date" type="date" required value={modal.form.expense_date} onChange={(e) => setModal({ ...modal, form: { ...modal.form, expense_date: e.target.value } })} />
            <Select label="Category" value={modal.form.category} onChange={(e) => setModal({ ...modal, form: { ...modal.form, category: e.target.value } })}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Amount ($)" type="number" step="0.01" min="0.01" required value={modal.form.amount} onChange={(e) => setModal({ ...modal, form: { ...modal.form, amount: e.target.value } })} />
            <Select label="Paid by" value={modal.form.payment_method} onChange={(e) => setModal({ ...modal, form: { ...modal.form, payment_method: e.target.value } })}>
              <option value="">—</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            {suppliers.length > 0 && (
              <Select label="Supplier (optional)" value={modal.form.supplier_id} onChange={(e) => setModal({ ...modal, form: { ...modal.form, supplier_id: e.target.value } })}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            <Input label="Description" value={modal.form.description} onChange={(e) => setModal({ ...modal, form: { ...modal.form, description: e.target.value } })} placeholder="e.g. November rent" />
            {error && <p className="text-sm text-clay">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

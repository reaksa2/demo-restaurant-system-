import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../stores/authStore'
import { stockApi, foodsApi } from '../services/resources'
import { Button, Input, Select, Badge, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { BrandPicker, useBrands } from '../components/BrandPicker'
import { can } from '../lib/access'
import { money, qty, downloadCsv } from '../lib/format'
import { Plus, Pencil, History, Download, Trash2, AlertTriangle, ArrowUpDown } from 'lucide-react'

const KINDS = [
  { key: 'stock_in', label: 'Stock in (received / bought)' },
  { key: 'stock_out', label: 'Stock out (used / transferred)' },
  { key: 'waste', label: 'Waste (spoiled / lost)' },
  { key: 'adjustment', label: 'Stock count (set exact amount)' },
]
const KIND_LABEL = { purchase: 'Purchase', stock_in: 'Stock in', stock_out: 'Stock out', waste: 'Waste', adjustment: 'Count adj.', sale: 'Sold' }
const apiErr = (err, fallback) => { const d = err.response?.data?.detail; return typeof d === 'string' ? d : fallback }

export default function InventoryPage() {
  const { user } = useAuth()
  const canManage = can(user, 'inventory.manage')
  const { brands, brandId, setBrandId, loading: brandsLoading } = useBrands()
  const [tab, setTab] = useState('stock')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [lowOnly, setLowOnly] = useState(false)
  const [itemModal, setItemModal] = useState(null)   // {id?, form}
  const [moveModal, setMoveModal] = useState(null)   // {item, kind, quantity, unit_cost, note}
  const [history, setHistory] = useState(null)       // {item, rows}
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!brandId) return
    setLoading(true)
    try { setItems(await stockApi.list(brandId)) } finally { setLoading(false) }
  }, [brandId])
  useEffect(() => { load() }, [load])

  const lowCount = items.filter((i) => i.low_stock).length
  const totalValue = items.filter((i) => i.is_active).reduce((s, i) => s + Number(i.stock_value), 0)
  const shown = items.filter((i) => !lowOnly || i.low_stock)

  const saveItem = async (e) => {
    e.preventDefault(); setError('')
    const f = itemModal.form
    try {
      if (itemModal.id) await stockApi.update(brandId, itemModal.id, { name_en: f.name_en, name_kh: f.name_kh || null, unit: f.unit, reorder_level: f.reorder_level || 0, is_active: f.is_active })
      else await stockApi.create(brandId, { name_en: f.name_en, name_kh: f.name_kh || null, unit: f.unit, reorder_level: f.reorder_level || 0, opening_quantity: f.opening_quantity || 0, opening_unit_cost: f.opening_unit_cost === '' ? null : f.opening_unit_cost })
      setItemModal(null); load()
    } catch (err) { setError(apiErr(err, 'Could not save.')) }
  }

  const saveMove = async (e) => {
    e.preventDefault(); setError('')
    const m = moveModal
    try {
      await stockApi.addMovement(brandId, m.item.id, { kind: m.kind, quantity: m.quantity || 0, unit_cost: m.kind === 'stock_in' && m.unit_cost !== '' ? m.unit_cost : null, note: m.note || null })
      setMoveModal(null); load()
    } catch (err) { setError(apiErr(err, 'Could not save.')) }
  }

  const openHistory = async (item) => setHistory({ item, rows: await stockApi.movements(brandId, item.id) })

  const removeItem = async (item) => {
    if (!confirm(`Delete "${item.name_en}"?`)) return
    try { await stockApi.remove(brandId, item.id); load() } catch (err) { alert(apiErr(err, 'Could not delete.')) }
  }

  const exportCsv = () => downloadCsv('stock.csv', ['Item', 'Unit', 'On hand', 'Reorder level', 'Avg cost', 'Stock value', 'Low stock'],
    items.map((i) => [i.name_en, i.unit, i.quantity, i.reorder_level, Number(i.avg_cost).toFixed(4), Number(i.stock_value).toFixed(2), i.low_stock ? 'LOW' : '']))

  if (brandsLoading) return <p className="text-sm text-slate">Loading…</p>
  if (!brandId) return <EmptyState title="No brand available" />

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Inventory</h1>
          <p className="mt-1 text-sm text-slate">Ingredients and supplies on hand. Sales use them up automatically through each food's recipe.</p>
        </div>
        {canManage && tab === 'stock' && (
          <Button onClick={() => { setError(''); setItemModal({ form: { name_en: '', name_kh: '', unit: 'pcs', reorder_level: '', opening_quantity: '', opening_unit_cost: '', is_active: true } }) }}><Plus size={16} /> New item</Button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BrandPicker brands={brands} brandId={brandId} onChange={setBrandId} />
        {canManage && (
          <div className="flex gap-1 rounded-md border border-sand bg-white p-1">
            {[['stock', 'Stock'], ['recipes', 'Recipes']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded px-3 py-1.5 text-sm ${tab === k ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}>{l}</button>
            ))}
          </div>
        )}
        {tab === 'stock' && <Button variant="secondary" onClick={exportCsv} disabled={!items.length}><Download size={15} /> Excel (CSV)</Button>}
      </div>

      {tab === 'recipes' && canManage ? (
        <RecipesTab brandId={brandId} items={items} />
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-sand bg-white p-4"><p className="text-xs text-slate">Items</p><p className="mt-1 font-display text-2xl">{items.filter((i) => i.is_active).length}</p></div>
            <div className="rounded-lg border border-sand bg-white p-4"><p className="text-xs text-slate">Stock value (at average cost)</p><p className="mt-1 font-display text-2xl text-moss">{money(totalValue)}</p></div>
            <button onClick={() => setLowOnly((v) => !v)} className={`rounded-lg border p-4 text-left ${lowOnly ? 'border-clay bg-clay/5' : 'border-sand bg-white'}`}>
              <p className="flex items-center gap-1 text-xs text-slate"><AlertTriangle size={12} /> Low stock {lowOnly ? '(filtered — click to clear)' : '(click to filter)'}</p>
              <p className={`mt-1 font-display text-2xl ${lowCount ? 'text-clay' : 'text-ink'}`}>{lowCount}</p>
            </button>
          </div>

          <div className="mt-6">
            {loading && items.length === 0 ? <p className="text-sm text-slate">Loading…</p> : shown.length === 0 ? (
              <EmptyState title={items.length ? 'Nothing low on stock' : 'No stock items yet'} description={canManage && !items.length ? 'Add your first ingredient with “New item”.' : undefined} />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-sand bg-white">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-sand bg-paper text-left text-xs text-slate">
                    <tr><th className="px-4 py-2.5">Item</th><th className="px-3 py-2.5 text-right">On hand</th><th className="px-3 py-2.5 text-right">Reorder at</th><th className="px-3 py-2.5 text-right">Avg cost</th><th className="px-3 py-2.5 text-right">Value</th><th className="px-3 py-2.5" /></tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {shown.map((i) => (
                      <tr key={i.id} className={i.is_active ? '' : 'opacity-50'}>
                        <td className="px-4 py-2.5"><p className="text-ink">{i.name_en} {!i.is_active && <Badge>inactive</Badge>}</p>{i.name_kh && <p className="font-khmer text-xs text-slate">{i.name_kh}</p>}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${i.low_stock ? 'font-semibold text-clay' : 'text-ink'}`}>{qty(i.quantity)} {i.unit} {i.low_stock && <AlertTriangle size={13} className="ml-1 inline" />}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate">{qty(i.reorder_level)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate">{money(i.avg_cost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink">{money(i.stock_value)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right print:hidden">
                          {canManage && <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={() => { setError(''); setMoveModal({ item: i, kind: 'stock_in', quantity: '', unit_cost: '', note: '' }) }}><ArrowUpDown size={13} /> Update</Button>}
                          <Button variant="ghost" onClick={() => openHistory(i)} title="History"><History size={15} /></Button>
                          {canManage && <Button variant="ghost" onClick={() => { setError(''); setItemModal({ id: i.id, form: { name_en: i.name_en, name_kh: i.name_kh || '', unit: i.unit, reorder_level: i.reorder_level, is_active: i.is_active } }) }}><Pencil size={15} /></Button>}
                          {canManage && <Button variant="ghost" onClick={() => removeItem(i)}><Trash2 size={15} /></Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={!!itemModal} onClose={() => setItemModal(null)} title={itemModal?.id ? 'Edit item' : 'New stock item'}>
        {itemModal && (
          <form onSubmit={saveItem} className="space-y-4">
            <Input label="Name (English)" required value={itemModal.form.name_en} onChange={(e) => setItemModal({ ...itemModal, form: { ...itemModal.form, name_en: e.target.value } })} />
            <Input label="Name (Khmer, optional)" value={itemModal.form.name_kh} onChange={(e) => setItemModal({ ...itemModal, form: { ...itemModal.form, name_kh: e.target.value } })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Unit" required value={itemModal.form.unit} onChange={(e) => setItemModal({ ...itemModal, form: { ...itemModal.form, unit: e.target.value } })} placeholder="kg, l, can, pcs" />
              <Input label="Alert when at or below" type="number" step="0.001" min="0" value={itemModal.form.reorder_level} onChange={(e) => setItemModal({ ...itemModal, form: { ...itemModal.form, reorder_level: e.target.value } })} />
            </div>
            {!itemModal.id && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Opening quantity" type="number" step="0.001" min="0" value={itemModal.form.opening_quantity} onChange={(e) => setItemModal({ ...itemModal, form: { ...itemModal.form, opening_quantity: e.target.value } })} />
                <Input label="Cost per unit ($)" type="number" step="0.0001" min="0" value={itemModal.form.opening_unit_cost} onChange={(e) => setItemModal({ ...itemModal, form: { ...itemModal.form, opening_unit_cost: e.target.value } })} />
              </div>
            )}
            {itemModal.id && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={itemModal.form.is_active} onChange={(e) => setItemModal({ ...itemModal, form: { ...itemModal.form, is_active: e.target.checked } })} /> Active (untick to retire it but keep its history)</label>
            )}
            {error && <p className="text-sm text-clay">{error}</p>}
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setItemModal(null)}>Cancel</Button><Button type="submit">Save</Button></div>
          </form>
        )}
      </Modal>

      <Modal open={!!moveModal} onClose={() => setMoveModal(null)} title={moveModal ? `Update stock · ${moveModal.item.name_en}` : ''}>
        {moveModal && (
          <form onSubmit={saveMove} className="space-y-4">
            <p className="text-sm text-slate">Currently {qty(moveModal.item.quantity)} {moveModal.item.unit}</p>
            <Select label="What happened?" value={moveModal.kind} onChange={(e) => setMoveModal({ ...moveModal, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </Select>
            <Input label={moveModal.kind === 'adjustment' ? `Counted amount (${moveModal.item.unit})` : `Quantity (${moveModal.item.unit})`} type="number" step="0.001" min="0" required value={moveModal.quantity} onChange={(e) => setMoveModal({ ...moveModal, quantity: e.target.value })} />
            {moveModal.kind === 'stock_in' && <Input label="Cost per unit ($, optional — keeps average cost accurate)" type="number" step="0.0001" min="0" value={moveModal.unit_cost} onChange={(e) => setMoveModal({ ...moveModal, unit_cost: e.target.value })} />}
            <Input label="Note (optional)" value={moveModal.note} onChange={(e) => setMoveModal({ ...moveModal, note: e.target.value })} />
            {error && <p className="text-sm text-clay">{error}</p>}
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setMoveModal(null)}>Cancel</Button><Button type="submit">Save</Button></div>
          </form>
        )}
      </Modal>

      <Modal open={!!history} onClose={() => setHistory(null)} title={history ? `History · ${history.item.name_en}` : ''} width="max-w-xl">
        {history && (history.rows.length === 0 ? <p className="text-sm text-slate">No movements yet.</p> : (
          <div className="max-h-96 divide-y divide-sand overflow-y-auto">
            {history.rows.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div><p className="text-ink">{KIND_LABEL[m.kind] || m.kind}{m.note ? ` · ${m.note}` : ''}</p><p className="text-xs text-slate">{new Date(m.created_at + (/[Zz]|[+-]\d\d:?\d\d$/.test(m.created_at) ? '' : 'Z')).toLocaleString()}</p></div>
                <span className={`tabular-nums ${Number(m.quantity) < 0 ? 'text-clay' : 'text-moss'}`}>{Number(m.quantity) > 0 ? '+' : ''}{qty(m.quantity)} {history.item.unit}</span>
              </div>
            ))}
          </div>
        ))}
      </Modal>
    </div>
  )
}

/** Which ingredients does one portion of each food use? Drives automatic stock deduction on sale. */
function RecipesTab({ brandId, items }) {
  const [foods, setFoods] = useState([])
  const [recipes, setRecipes] = useState({})
  const [editing, setEditing] = useState(null) // {food, lines:[{stock_item_id, quantity_per_unit}]}
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const [f, r] = await Promise.all([foodsApi.list(brandId), stockApi.recipes(brandId)])
    setFoods(f); setRecipes(r)
  }, [brandId])
  useEffect(() => { load() }, [load])

  const active = items.filter((i) => i.is_active)
  const save = async (e) => {
    e.preventDefault(); setError('')
    const lines = editing.lines.filter((l) => l.stock_item_id && Number(l.quantity_per_unit) > 0)
    try { await stockApi.setRecipe(brandId, editing.food.id, lines.map((l) => ({ stock_item_id: l.stock_item_id, quantity_per_unit: l.quantity_per_unit }))); setEditing(null); load() }
    catch (err) { setError(apiErr(err, 'Could not save the recipe.')) }
  }
  const list = foods.filter((f) => !q || `${f.name_en} ${f.name_kh}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name_en.localeCompare(b.name_en))

  return (
    <div className="mt-6">
      <p className="mb-3 text-sm text-slate">Tell the system what one portion uses. When a bill is paid (or an order is completed, if billing is off), those amounts leave stock. Foods without a recipe are simply not tracked.</p>
      <div className="mb-3 w-64"><Input placeholder="Search foods…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {active.length === 0 && <p className="mb-3 rounded-md bg-marigold/10 p-3 text-sm text-ink">Add some stock items first (Stock tab), then link them here.</p>}
      <div className="divide-y divide-sand overflow-hidden rounded-lg border border-sand bg-white">
        {list.map((f) => {
          const lines = recipes[f.id] || []
          return (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-ink">{f.name_en} <span className="font-khmer text-slate">{f.name_kh}</span></p>
                <p className="text-xs text-slate">{lines.length ? lines.map((l) => `${qty(l.quantity_per_unit)} ${l.unit} ${l.stock_item_name}`).join(' · ') : 'No recipe — not tracked'}</p>
              </div>
              <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => { setError(''); setEditing({ food: f, lines: lines.length ? lines.map((l) => ({ stock_item_id: l.stock_item_id, quantity_per_unit: l.quantity_per_unit })) : [{ stock_item_id: '', quantity_per_unit: '' }] }) }}>{lines.length ? 'Edit recipe' : 'Add recipe'}</Button>
            </div>
          )
        })}
        {list.length === 0 && <p className="p-4 text-sm text-slate">No foods found.</p>}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Recipe · ${editing.food.name_en}` : ''} width="max-w-lg">
        {editing && (
          <form onSubmit={save} className="space-y-3">
            <p className="text-xs text-slate">Amount used for ONE portion sold.</p>
            {editing.lines.map((l, idx) => {
              const it = active.find((i) => i.id === l.stock_item_id)
              return (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1"><Select value={l.stock_item_id} onChange={(e) => setEditing({ ...editing, lines: editing.lines.map((x, i) => (i === idx ? { ...x, stock_item_id: e.target.value } : x)) })}>
                    <option value="">Select ingredient…</option>
                    {active.map((i) => <option key={i.id} value={i.id}>{i.name_en} ({i.unit})</option>)}
                  </Select></div>
                  <div className="w-28"><Input type="number" step="0.001" min="0" placeholder={it ? it.unit : 'qty'} value={l.quantity_per_unit} onChange={(e) => setEditing({ ...editing, lines: editing.lines.map((x, i) => (i === idx ? { ...x, quantity_per_unit: e.target.value } : x)) })} /></div>
                  <Button type="button" variant="ghost" onClick={() => setEditing({ ...editing, lines: editing.lines.filter((_, i) => i !== idx) })}><Trash2 size={15} /></Button>
                </div>
              )
            })}
            <Button type="button" variant="secondary" onClick={() => setEditing({ ...editing, lines: [...editing.lines, { stock_item_id: '', quantity_per_unit: '' }] })}><Plus size={14} /> Add ingredient</Button>
            {error && <p className="text-sm text-clay">{error}</p>}
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit">Save recipe</Button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

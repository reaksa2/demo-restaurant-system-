import { useEffect, useState } from 'react'
import { foodsApi } from '../../services/resources'
import { resolveMediaUrl } from '../../services/api'
import { Button, Badge, EmptyState } from '../ui'
import FoodEditorModal from './FoodEditorModal'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export default function FoodsTab({ brandId, categories, zones }) {
  const [foods, setFoods] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = () => foodsApi.list(brandId).then((data) => { setFoods(data); setLoading(false) })
  useEffect(() => { load() }, [brandId])

  const openCreate = () => { setEditing(null); setModalOpen(true) }
  const openEdit = async (f) => { setEditing(await foodsApi.get(brandId, f.id)); setModalOpen(true) }

  const remove = async (f) => {
    if (!confirm(`Delete "${f.name_en}"?`)) return
    await foodsApi.remove(brandId, f.id)
    load()
  }

  const categoryName = (id) => categories.find((c) => c.id === id)?.name_en

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">Every zone's price is shown here for you — staff and customers only ever see one.</p>
        <Button onClick={openCreate}><Plus size={16} /> New food</Button>
      </div>

      {foods.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No foods yet" action={<Button onClick={openCreate}>Add a food</Button>} />
        </div>
      ) : (
        <div className="mt-4 divide-y divide-sand rounded-lg border border-sand bg-white">
          {foods.map((f) => (
            <div key={f.id} className="flex items-center gap-4 px-5 py-3">
              {f.image_url ? (
                <img src={resolveMediaUrl(f.image_url)} alt="" className="h-12 w-12 flex-shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-12 w-12 flex-shrink-0 rounded-md bg-sand" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-khmer font-medium text-ink">{f.name_kh}</p>
                  {!f.is_available && <Badge tone="danger">Unavailable</Badge>}
                  {categoryName(f.category_id) && <Badge>{categoryName(f.category_id)}</Badge>}
                </div>
                <p className="text-sm text-slate">{f.name_en}</p>
              </div>
              <div className="flex flex-shrink-0 gap-3 text-sm">
                {zones.map((z) => {
                  const p = f.prices.find((pr) => pr.zone_id === z.id)
                  const shown = p ? (p.discount_active && p.discount_price ? p.discount_price : p.regular_price) : null
                  return (
                    <div key={z.id} className="text-right">
                      <p className="text-xs text-slate">{z.name_en}</p>
                      <p className="font-medium text-ink">{shown !== null ? `$${Number(shown).toFixed(2)}` : '—'}</p>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <Button variant="ghost" onClick={() => openEdit(f)}><Pencil size={14} /></Button>
                <Button variant="ghost" onClick={() => remove(f)}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FoodEditorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        brandId={brandId}
        categories={categories}
        zones={zones}
        food={editing}
        onSaved={load}
      />
    </div>
  )
}

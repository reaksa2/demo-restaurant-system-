import { useEffect, useState } from 'react'
import { categoriesApi } from '../../services/resources'
import { Button, Input, Select, EmptyState } from '../ui'
import { Modal } from '../Modal'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export default function CategoriesTab({ brandId, onChange }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name_en: '', name_kh: '', sort_order: 0, parent_id: '' })
  const [error, setError] = useState('')

  const load = () => categoriesApi.list(brandId).then((data) => { setCategories(data); setLoading(false) })
  useEffect(() => { load() }, [brandId])

  const topLevel = categories.filter((c) => !c.parent_id)
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id)
  const availableParents = topLevel.filter((c) => c.id !== editing?.id)

  const openCreate = (parentId = '') => {
    setEditing(null)
    setForm({ name_en: '', name_kh: '', sort_order: categories.length, parent_id: parentId })
    setError('')
    setModalOpen(true)
  }
  const openEdit = (c) => {
    setEditing(c)
    setForm({ name_en: c.name_en, name_kh: c.name_kh, sort_order: c.sort_order, parent_id: c.parent_id || '' })
    setError('')
    setModalOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const payload = { ...form, parent_id: form.parent_id || null }
      if (editing) await categoriesApi.update(brandId, editing.id, payload)
      else await categoriesApi.create(brandId, payload)
      setModalOpen(false)
      await load()
      onChange?.()
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.')
    }
  }

  const remove = async (c) => {
    const hasChildren = childrenOf(c.id).length > 0
    const msg = hasChildren
      ? `Delete "${c.name_en}"? Its subcategories will be deleted too, and their foods will become uncategorized.`
      : `Delete category "${c.name_en}"? Foods in it will become uncategorized.`
    if (!confirm(msg)) return
    await categoriesApi.remove(brandId, c.id)
    await load()
    onChange?.()
  }

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          Categories organize the menu. Add a subcategory inside one (e.g. "Special" -&gt; "Steamed/Soup") for grouped sections.
        </p>
        <Button onClick={() => openCreate()}><Plus size={16} /> New category</Button>
      </div>

      {topLevel.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No categories yet" action={<Button onClick={() => openCreate()}>Add a category</Button>} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {topLevel.map((c) => (
            <div key={c.id} className="rounded-lg border border-sand bg-white">
              <div className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-khmer font-medium text-ink">{c.name_kh}</p>
                  <p className="text-sm text-slate">{c.name_en}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" onClick={() => openCreate(c.id)} title="Add subcategory">
                    <Plus size={14} />
                  </Button>
                  <Button variant="ghost" onClick={() => openEdit(c)}><Pencil size={14} /></Button>
                  <Button variant="ghost" onClick={() => remove(c)}><Trash2 size={14} /></Button>
                </div>
              </div>
              {childrenOf(c.id).length > 0 && (
                <div className="divide-y divide-sand border-t border-sand bg-paper/50 pl-8">
                  {childrenOf(c.id).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between px-5 py-2.5">
                      <div>
                        <p className="font-khmer text-sm font-medium text-ink">{sub.name_kh}</p>
                        <p className="text-xs text-slate">{sub.name_en}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" onClick={() => openEdit(sub)}><Pencil size={13} /></Button>
                        <Button variant="ghost" onClick={() => remove(sub)}><Trash2 size={13} /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit category' : 'New category'}>
        <form onSubmit={save} className="space-y-4">
          <Select
            label="Parent category (optional)"
            value={form.parent_id}
            onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
          >
            <option value="">None -- top-level category</option>
            {availableParents.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
          </Select>
          <Input label="Name (English)" required value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          <Input label="Name (Khmer)" required value={form.name_kh} onChange={(e) => setForm({ ...form, name_kh: e.target.value })} className="font-khmer" />
          <Input label="Sort order" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          {error && <p className="text-sm text-clay">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save changes' : 'Create category'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

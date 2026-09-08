import { useEffect, useState } from 'react'
import { zonesApi } from '../../services/resources'
import { Button, Input, EmptyState } from '../ui'
import { Modal } from '../Modal'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export default function ZonesTab({ brandId, onChange }) {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name_en: '', name_kh: '' })
  const [error, setError] = useState('')

  const load = () => zonesApi.list(brandId).then((data) => { setZones(data); setLoading(false) })
  useEffect(() => { load() }, [brandId])

  const openCreate = () => { setEditing(null); setForm({ name_en: '', name_kh: '' }); setError(''); setModalOpen(true) }
  const openEdit = (z) => { setEditing(z); setForm({ name_en: z.name_en, name_kh: z.name_kh }); setError(''); setModalOpen(true) }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editing) await zonesApi.update(brandId, editing.id, form)
      else await zonesApi.create(brandId, form)
      setModalOpen(false)
      await load()
      onChange?.()
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.')
    }
  }

  const remove = async (z) => {
    if (!confirm(`Delete zone "${z.name_en}"? Staff assigned to it and its prices will need to be reassigned.`)) return
    await zonesApi.remove(brandId, z.id)
    await load()
    onChange?.()
  }

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">Zones determine which price staff and customers see (e.g. Inside / Outside).</p>
        <Button onClick={openCreate}><Plus size={16} /> New zone</Button>
      </div>

      {zones.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No zones yet" description="Add at least one zone before setting food prices." action={<Button onClick={openCreate}>Add a zone</Button>} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center justify-between rounded-lg border border-sand bg-white px-4 py-3">
              <div>
                <p className="font-khmer font-medium text-ink">{z.name_kh}</p>
                <p className="text-sm text-slate">{z.name_en}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => openEdit(z)}><Pencil size={14} /></Button>
                <Button variant="ghost" onClick={() => remove(z)}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit zone' : 'New zone'}>
        <form onSubmit={save} className="space-y-4">
          <Input label="Name (English)" required value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder="e.g. Inside" />
          <Input label="Name (Khmer)" required value={form.name_kh} onChange={(e) => setForm({ ...form, name_kh: e.target.value })} className="font-khmer" />
          {error && <p className="text-sm text-clay">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save changes' : 'Create zone'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

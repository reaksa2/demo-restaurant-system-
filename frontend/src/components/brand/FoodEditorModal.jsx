import { useEffect, useState } from 'react'
import { foodsApi, pricesApi, imagesApi } from '../../services/resources'
import { resolveMediaUrl } from '../../services/api'
import { Button, Input, Textarea, Select, Checkbox } from '../ui'
import { Modal } from '../Modal'
import { Upload } from 'lucide-react'

export default function FoodEditorModal({ open, onClose, brandId, categories, zones, food, onSaved }) {
  const isEditing = Boolean(food)
  const [form, setForm] = useState(emptyForm())
  const [prices, setPrices] = useState({}) // zone_id -> { regular_price, discount_price, discount_active }
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function emptyForm() {
    return { category_id: '', name_en: '', name_kh: '', description_en: '', description_kh: '', image_url: '', is_available: true }
  }

  useEffect(() => {
    if (!open) return
    setError('')
    if (food) {
      setForm({
        category_id: food.category_id || '',
        name_en: food.name_en,
        name_kh: food.name_kh,
        description_en: food.description_en || '',
        description_kh: food.description_kh || '',
        image_url: food.image_url || '',
        is_available: food.is_available,
      })
      const priceMap = {}
      for (const z of zones) {
        const existing = food.prices.find((p) => p.zone_id === z.id)
        priceMap[z.id] = existing
          ? { regular_price: existing.regular_price, discount_price: existing.discount_price || '', discount_active: existing.discount_active }
          : { regular_price: '', discount_price: '', discount_active: false }
      }
      setPrices(priceMap)
    } else {
      setForm(emptyForm())
      const priceMap = {}
      for (const z of zones) priceMap[z.id] = { regular_price: '', discount_price: '', discount_active: false }
      setPrices(priceMap)
    }
  }, [open, food, zones])

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const { url } = await imagesApi.upload(file)
      setForm((f) => ({ ...f, image_url: url }))
    } catch {
      setError('Image upload failed. Try a JPG, PNG, or WEBP under 5MB.')
    } finally {
      setUploading(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = { ...form, category_id: form.category_id || null }
      const savedFood = isEditing ? await foodsApi.update(brandId, food.id, payload) : await foodsApi.create(brandId, payload)

      // Push price rows for every zone that has a regular price filled in.
      await Promise.all(
        Object.entries(prices).map(([zoneId, p]) => {
          if (!p.regular_price) return Promise.resolve()
          return pricesApi.upsert(brandId, savedFood.id, {
            zone_id: zoneId,
            regular_price: p.regular_price,
            discount_price: p.discount_price || null,
            discount_active: p.discount_active,
          })
        })
      )

      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const updatePrice = (zoneId, field, value) => {
    setPrices((prev) => ({ ...prev, [zoneId]: { ...prev[zoneId], [field]: value } }))
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit food' : 'New food'} width="max-w-lg">
      <form onSubmit={save} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name (English)" required value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          <Input label="Name (Khmer)" required value={form.name_kh} onChange={(e) => setForm({ ...form, name_kh: e.target.value })} className="font-khmer" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Textarea label="Description (English)" rows={2} value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} />
          <Textarea label="Description (Khmer)" rows={2} value={form.description_kh} onChange={(e) => setForm({ ...form, description_kh: e.target.value })} className="font-khmer" />
        </div>

        <Select label="Category" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">No category</option>
          {categories
            .slice()
            .sort((a, b) => {
              // Group each subcategory directly under its parent in the dropdown.
              const ka = a.parent_id ? `${a.parent_id}-1-${a.sort_order}` : `${a.id}-0-${a.sort_order}`
              const kb = b.parent_id ? `${b.parent_id}-1-${b.sort_order}` : `${b.id}-0-${b.sort_order}`
              return ka.localeCompare(kb)
            })
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id ? `— ${c.name_en}` : c.name_en}
              </option>
            ))}
        </Select>
        <p className="-mt-3 text-xs text-slate">Subcategories are shown indented with "—".</p>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Photo</span>
          <div className="flex items-center gap-3">
            {form.image_url && <img src={resolveMediaUrl(form.image_url)} alt="" className="h-14 w-14 rounded-md object-cover" />}
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-sand px-3 py-2 text-sm text-slate hover:bg-paper">
              <Upload size={14} />
              {uploading ? 'Uploading…' : 'Upload image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        <Checkbox label="Available on the menu" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} />

        <div>
          <span className="mb-2 block text-sm font-medium text-ink">Prices by zone</span>
          {zones.length === 0 ? (
            <p className="text-sm text-slate">Add a zone to this brand first before setting prices.</p>
          ) : (
            <div className="space-y-3">
              {zones.map((z) => (
                <div key={z.id} className="rounded-md border border-sand p-3">
                  <p className="mb-2 text-sm font-medium text-ink">{z.name_en}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Regular price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={prices[z.id]?.regular_price ?? ''}
                      onChange={(e) => updatePrice(z.id, 'regular_price', e.target.value)}
                    />
                    <Input
                      label="Discount price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={prices[z.id]?.discount_price ?? ''}
                      onChange={(e) => updatePrice(z.id, 'discount_price', e.target.value)}
                    />
                  </div>
                  <div className="mt-2">
                    <Checkbox
                      label="Discount active"
                      checked={prices[z.id]?.discount_active || false}
                      onChange={(e) => updatePrice(z.id, 'discount_active', e.target.checked)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-sand pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create food'}</Button>
        </div>
      </form>
    </Modal>
  )
}

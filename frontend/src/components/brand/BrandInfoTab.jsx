import { useState } from 'react'
import { brandsApi, imagesApi } from '../../services/resources'
import { resolveMediaUrl } from '../../services/api'
import { Button, Input, Textarea } from '../ui'
import { Upload, Send } from 'lucide-react'

export default function BrandInfoTab({ brand, onUpdated }) {
  const [form, setForm] = useState({
    name_en: brand.name_en,
    name_kh: brand.name_kh,
    description_en: brand.description_en || '',
    description_kh: brand.description_kh || '',
    logo_url: brand.logo_url || '',
    telegram_bot_token: brand.telegram_bot_token || '',
    telegram_chat_id: brand.telegram_chat_id || '',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const { url } = await imagesApi.upload(file)
      setForm((f) => ({ ...f, logo_url: url }))
    } finally {
      setUploading(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const updated = await brandsApi.update(brand.id, form)
      onUpdated(updated)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="max-w-lg space-y-4">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">Logo</span>
        <div className="flex items-center gap-3">
          {form.logo_url && <img src={resolveMediaUrl(form.logo_url)} alt="" className="h-14 w-14 rounded-md object-cover" />}
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-sand px-3 py-2 text-sm text-slate hover:bg-paper">
            <Upload size={14} />
            {uploading ? 'Uploading…' : 'Upload logo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Name (English)" required value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
        <Input label="Name (Khmer)" required value={form.name_kh} onChange={(e) => setForm({ ...form, name_kh: e.target.value })} className="font-khmer" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Textarea label="Description (English)" rows={3} value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} />
        <Textarea label="Description (Khmer)" rows={3} value={form.description_kh} onChange={(e) => setForm({ ...form, description_kh: e.target.value })} className="font-khmer" />
      </div>

      <div className="rounded-md border border-sand p-4">
        <div className="mb-3 flex items-center gap-2">
          <Send size={15} className="text-marigold-dark" />
          <span className="text-sm font-medium text-ink">Telegram order notifications</span>
        </div>
        <p className="mb-3 text-xs text-slate">
          Optional. When both fields are set, confirmed orders from this brand are sent to your Telegram group automatically.
          Create a bot via <span className="font-medium">@BotFather</span> on Telegram to get a token, add the bot to your
          group, then send any message in the group and check{' '}
          <code className="rounded bg-paper px-1">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> to find the chat ID
          (it's usually a negative number for groups).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Bot token"
            type="password"
            placeholder="123456:ABC-DEF..."
            value={form.telegram_bot_token}
            onChange={(e) => setForm({ ...form, telegram_bot_token: e.target.value })}
          />
          <Input
            label="Chat ID"
            placeholder="-1001234567890"
            value={form.telegram_chat_id}
            onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        {saved && <span className="text-sm text-moss">Saved.</span>}
      </div>
    </form>
  )
}

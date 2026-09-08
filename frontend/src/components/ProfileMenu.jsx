import { useState } from 'react'
import { useAuth } from '../stores/authStore'
import { resolveMediaUrl } from '../services/api'
import { updateMyProfile } from '../services/auth'
import { imagesApi } from '../services/resources'
import { Modal } from './Modal'
import { Button, Input } from './ui'
import { Upload, LogOut, ChevronDown } from 'lucide-react'

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function Avatar({ user, size = 36 }) {
  const url = resolveMediaUrl(user.avatar_url)
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-marigold text-sm font-semibold text-white"
      style={{ width: size, height: size }}
    >
      {initials(user.full_name)}
    </div>
  )
}

/**
 * Dropdown trigger (avatar + name) that opens a profile modal for editing
 * name/photo, plus sign out. Used in both the admin sidebar and the staff
 * menu header — theme prop only changes text color for the dark sidebar.
 */
export function ProfileMenu({ theme = 'light', dropDirection = 'up' }) {
  const { user, logout, refresh } = useAuth()
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [fullName, setFullName] = useState(user.full_name)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openProfile = () => {
    setFullName(user.full_name)
    setError('')
    setOpen(false)
    setModalOpen(true)
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const { url } = await imagesApi.upload(file)
      await updateMyProfile({ avatar_url: url })
      await refresh()
    } catch {
      setError('Upload failed. Try a JPG, PNG, or WEBP under 5MB.')
    } finally {
      setUploading(false)
    }
  }

  const saveName = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updateMyProfile({ full_name: fullName })
      await refresh()
      setModalOpen(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const textClass = theme === 'dark' ? 'text-white' : 'text-ink'
  const subTextClass = theme === 'dark' ? 'text-white/50' : 'text-slate'

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-black/5"
        >
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-medium ${textClass}`}>{user.full_name}</p>
            <p className={`truncate text-xs ${subTextClass}`}>{user.email}</p>
          </div>
          <ChevronDown size={14} className={subTextClass} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className={`absolute left-0 z-20 w-48 rounded-md border border-sand bg-white py-1 shadow-lg ${dropDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
              <button
                onClick={openProfile}
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper"
              >
                Edit profile
              </button>
              <button
                onClick={logout}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-clay hover:bg-paper"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit profile">
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar user={user} size={64} />
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-sand px-3 py-2 text-sm text-slate hover:bg-paper">
              <Upload size={14} />
              {uploading ? 'Uploading…' : 'Change photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploading}
              />
            </label>
          </div>

          <form onSubmit={saveName} className="space-y-4">
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            {error && <p className="text-sm text-clay">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save name'}</Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  )
}

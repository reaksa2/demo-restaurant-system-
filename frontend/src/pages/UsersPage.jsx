import { useEffect, useState } from 'react'
import { useAuth } from '../stores/authStore'
import { usersApi, groupsApi, brandsApi, zonesApi } from '../services/resources'
import { Button, Input, Select, Badge, Checkbox, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { Plus, Trash2, Pencil, Smartphone } from 'lucide-react'

// Lightweight, dependency-free read of a browser's User-Agent string into
// something a manager can actually recognize at a glance. Not meant to be
// exhaustive — just enough to tell devices apart on the sessions list.
function describeDevice(userAgent) {
  if (!userAgent) return 'Unknown device'
  const ua = userAgent
  let os = 'Unknown OS'
  if (/iPad/.test(ua)) os = 'iPad'
  else if (/iPhone/.test(ua)) os = 'iPhone'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'Mac'
  else if (/Linux/.test(ua)) os = 'Linux'

  let browser = 'Unknown browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\//.test(ua)) browser = 'Opera'
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome'
  else if (/CriOS\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  return `${browser} on ${os}`
}

function timeAgo(iso) {
  if (!iso) return 'never'
  const diffMs = Date.now() - new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const ROLE_LABELS = { level1: 'Developer', level2: 'Group Manager', level3: 'Brand Manager', staff: 'Staff' }
const ROLE_TONES = { level1: 'accent', level2: 'accent', level3: 'default', staff: 'success' }

const CREATABLE_ROLES = {
  level1: ['level2', 'level3', 'staff'],
  level2: ['level3', 'staff'],
  level3: ['staff'],
}

export default function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [brands, setBrands] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState('')
  const creatableRoles = CREATABLE_ROLES[user.role] || []
  const [createForm, setCreateForm] = useState({ email: '', username: '', password: '', full_name: '', role: creatableRoles[0] || '', group_id: '', brand_id: '', zone_id: '', max_devices: '1', never_expire: false })

  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', username: '', password: '', is_active: true, zone_id: '', max_devices: '1', never_expire: false })
  const [editZones, setEditZones] = useState([])
  const [editError, setEditError] = useState('')

  // Device management modal: which devices an account is currently logged
  // into, with a "sign out" action per device (or all at once).
  const [sessionsUser, setSessionsUser] = useState(null)
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState('')

  const load = async () => {
    const [u, b] = await Promise.all([usersApi.list(), brandsApi.list()])
    setUsers(u)
    setBrands(b)
    if (user.role === 'level1') setGroups(await groupsApi.list())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (createForm.role === 'staff' && createForm.brand_id) {
      zonesApi.list(createForm.brand_id).then(setZones)
    } else {
      setZones([])
    }
  }, [createForm.role, createForm.brand_id])

  const openCreate = () => {
    setCreateForm({ email: '', username: '', password: '', full_name: '', role: creatableRoles[0] || '', group_id: '', brand_id: '', zone_id: '', max_devices: '1', never_expire: false })
    setCreateError('')
    setCreateOpen(true)
  }

  const saveCreate = async (e) => {
    e.preventDefault()
    setCreateError('')
    try {
      const payload = { email: createForm.email, password: createForm.password, full_name: createForm.full_name, role: createForm.role, max_devices: Number(createForm.max_devices) || 1, never_expire: createForm.never_expire }
      if (createForm.username.trim()) payload.username = createForm.username.trim()
      if (createForm.role === 'level2') payload.group_id = createForm.group_id
      if (createForm.role === 'level3') payload.brand_id = createForm.brand_id
      // zone_id left out entirely when blank -> staff gets all-zone (tabbed) access
      if (createForm.role === 'staff') {
        payload.brand_id = createForm.brand_id
        if (createForm.zone_id) payload.zone_id = createForm.zone_id
      }
      await usersApi.create(payload)
      setCreateOpen(false)
      load()
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Something went wrong.')
    }
  }

  const openEdit = async (u) => {
    setEditingUser(u)
    setEditForm({ full_name: u.full_name, username: u.username || '', password: '', is_active: u.is_active, zone_id: u.zone_id || '', max_devices: String(u.max_devices || 1), never_expire: !!u.never_expire })
    setEditError('')
    if (u.role === 'staff' && u.brand_id) {
      setEditZones(await zonesApi.list(u.brand_id))
    } else {
      setEditZones([])
    }
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    setEditError('')
    try {
      const payload = { full_name: editForm.full_name, username: editForm.username.trim() || null, is_active: editForm.is_active, max_devices: Number(editForm.max_devices) || 1, never_expire: editForm.never_expire }
      if (editForm.password) payload.password = editForm.password
      // Always send zone_id for staff (even blank/null) so the backend can
      // tell "switch to all zones" apart from "leave zone access as-is".
      if (editingUser.role === 'staff') payload.zone_id = editForm.zone_id || null
      await usersApi.update(editingUser.id, payload)
      setEditingUser(null)
      load()
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Something went wrong.')
    }
  }

  const remove = async (u) => {
    if (!confirm(`Delete user "${u.full_name}"?`)) return
    await usersApi.remove(u.id)
    load()
  }

  const openSessions = async (u) => {
    setSessionsUser(u)
    setSessionsError('')
    setSessionsLoading(true)
    try {
      setSessions(await usersApi.sessions(u.id))
    } catch (err) {
      setSessionsError(err.response?.data?.detail || 'Could not load devices.')
    } finally {
      setSessionsLoading(false)
    }
  }

  const revokeOne = async (sessionRowId) => {
    await usersApi.revokeSession(sessionsUser.id, sessionRowId)
    setSessions((prev) => prev.filter((s) => s.id !== sessionRowId))
    load() // refresh the "X of Y devices" count on the list behind the modal
  }

  const revokeAll = async () => {
    if (!confirm(`Sign "${sessionsUser.full_name}" out of every device?`)) return
    await usersApi.revokeAllSessions(sessionsUser.id)
    setSessions([])
    load()
  }

  const brandName = (id) => brands.find((b) => b.id === id)?.name_en
  const groupName = (id) => groups.find((g) => g.id === id)?.name

  const canEditUsers = user.role !== 'staff'

  if (loading) return <p className="text-sm text-slate">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Users</h1>
          <p className="mt-1 text-sm text-slate">People who can manage or operate your menus.</p>
        </div>
        {creatableRoles.length > 0 && <Button onClick={openCreate}><Plus size={16} /> New user</Button>}
      </div>

      {users.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No users yet" action={creatableRoles.length > 0 && <Button onClick={openCreate}>Create user</Button>} />
        </div>
      ) : (
        <div className="mt-6 divide-y divide-sand rounded-lg border border-sand bg-white">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-ink">{u.full_name}</p>
                  <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                  {!u.is_active && <Badge tone="danger">Inactive</Badge>}
                </div>
                <p className="text-sm text-slate">
                  {u.email}
                  {u.group_id && ` · ${groupName(u.group_id) || 'group'}`}
                  {u.brand_id && ` · ${brandName(u.brand_id) || 'brand'}`}
                  {u.role === 'staff' && (u.zone_id ? ' · Locked to one zone' : ' · All zones (tabs)')}
                  {u.never_expire
                    ? ` · ${u.active_sessions || 0} device${(u.active_sessions || 0) === 1 ? '' : 's'} logged in (never expires)`
                    : ` · ${u.active_sessions || 0} of ${u.max_devices || 1} device${(u.max_devices || 1) === 1 ? '' : 's'} logged in`}
                </p>
              </div>
              <div className="flex gap-1">
                {canEditUsers && (
                  <Button variant="ghost" onClick={() => openSessions(u)} title="See and manage logged-in devices">
                    <Smartphone size={15} />
                  </Button>
                )}
                {canEditUsers && <Button variant="ghost" onClick={() => openEdit(u)}><Pencil size={15} /></Button>}
                <Button variant="ghost" onClick={() => remove(u)}><Trash2 size={15} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New user">
        <form onSubmit={saveCreate} className="space-y-4">
          <Input label="Full name" required value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} />
          <Input label="Email" type="email" required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
          <Input label="Username (optional)" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} placeholder="Lets them log in without their email" />
          <Input label="Password" type="password" required minLength={8} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />

          <Select label="Role" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value, brand_id: '', group_id: '', zone_id: '' })}>
            {creatableRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>

          {createForm.role === 'level2' && (
            <Select label="Group" required value={createForm.group_id} onChange={(e) => setCreateForm({ ...createForm, group_id: e.target.value })}>
              <option value="">Select a group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          )}

          {(createForm.role === 'level3' || createForm.role === 'staff') && (
            <Select label="Brand" required value={createForm.brand_id} onChange={(e) => setCreateForm({ ...createForm, brand_id: e.target.value })}>
              <option value="">Select a brand</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name_en}</option>)}
            </Select>
          )}

          {createForm.role === 'staff' && createForm.brand_id && (
            <Select label="Zone access" value={createForm.zone_id} onChange={(e) => setCreateForm({ ...createForm, zone_id: e.target.value })}>
              <option value="">All zones (staff sees a tab for each)</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name_en} only</option>)}
            </Select>
          )}

          {(createForm.role === 'level2' || createForm.role === 'level3' || createForm.role === 'staff') && (
            <Input
              label="Max devices logged in at once"
              type="number"
              min={1}
              max={20}
              required
              value={createForm.max_devices}
              onChange={(e) => setCreateForm({ ...createForm, max_devices: e.target.value })}
            />
          )}

          <Checkbox
            label="Never expire login sessions (stays signed in until someone revokes the device)"
            checked={createForm.never_expire}
            onChange={(e) => setCreateForm({ ...createForm, never_expire: e.target.checked })}
          />

          {createError && <p className="text-sm text-clay">{createError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit">Create user</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title={editingUser ? `Edit ${editingUser.full_name}` : 'Edit user'}>
        {editingUser && (
          <form onSubmit={saveEdit} className="space-y-4">
            <p className="text-sm text-slate">{editingUser.email}</p>
            <Input label="Full name" required value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            <Input label="Username (optional)" value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} placeholder="Lets them log in without their email" />
            <Input
              label="New password (optional)"
              type="password"
              minLength={8}
              placeholder="Leave blank to keep current password"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
            />
            {editingUser.role === 'staff' && (
              <Select label="Zone access" value={editForm.zone_id} onChange={(e) => setEditForm({ ...editForm, zone_id: e.target.value })}>
                <option value="">All zones (staff sees a tab for each)</option>
                {editZones.map((z) => <option key={z.id} value={z.id}>{z.name_en} only</option>)}
              </Select>
            )}
            <Input
              label="Max devices logged in at once"
              type="number"
              min={1}
              max={20}
              required
              value={editForm.max_devices}
              onChange={(e) => setEditForm({ ...editForm, max_devices: e.target.value })}
            />
            <Checkbox
              label="Account active (uncheck to block this person from logging in)"
              checked={editForm.is_active}
              onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
            />
            <Checkbox
              label="Never expire login sessions (stays signed in until someone revokes the device)"
              checked={editForm.never_expire}
              onChange={(e) => setEditForm({ ...editForm, never_expire: e.target.checked })}
            />
            {editForm.never_expire !== !!editingUser.never_expire && (
              <p className="text-xs text-slate">
                {editForm.never_expire
                  ? 'Only NEW logins from now on get a never-expiring session — any device already signed in keeps its current expiry.'
                  : "Devices already signed in with a never-expiring session stay that way until they're revoked below or log out — only new logins pick up the normal expiry."}
              </p>
            )}
            {editError && <p className="text-sm text-clay">{editError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!sessionsUser}
        onClose={() => setSessionsUser(null)}
        title={sessionsUser ? `Devices — ${sessionsUser.full_name}` : 'Devices'}
        width="max-w-lg"
      >
        {sessionsLoading ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : sessionsError ? (
          <p className="text-sm text-clay">{sessionsError}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate">Not logged into any device right now.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-sand px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{describeDevice(s.user_agent)}</p>
                      {!s.expires_at && <Badge tone="accent">Never expires</Badge>}
                    </div>
                    <p className="text-xs text-slate">
                      {s.ip_address || 'Unknown IP'} · Signed in {timeAgo(s.created_at)} · Last active {timeAgo(s.last_seen_at || s.created_at)}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => revokeOne(s.id)}>
                    <Trash2 size={15} /> Sign out
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-sand pt-3">
              <Button variant="secondary" onClick={revokeAll}>Sign out of all devices</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useAuth } from '../stores/authStore'
import { usersApi, groupsApi, brandsApi, zonesApi } from '../services/resources'
import { Button, Input, Select, Badge, Checkbox, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { Plus, Trash2, Pencil } from 'lucide-react'

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
  const [createForm, setCreateForm] = useState({ email: '', username: '', password: '', full_name: '', role: creatableRoles[0] || '', group_id: '', brand_id: '', zone_id: '' })

  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', username: '', password: '', is_active: true, zone_id: '' })
  const [editZones, setEditZones] = useState([])
  const [editError, setEditError] = useState('')

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
    setCreateForm({ email: '', username: '', password: '', full_name: '', role: creatableRoles[0] || '', group_id: '', brand_id: '', zone_id: '' })
    setCreateError('')
    setCreateOpen(true)
  }

  const saveCreate = async (e) => {
    e.preventDefault()
    setCreateError('')
    try {
      const payload = { email: createForm.email, password: createForm.password, full_name: createForm.full_name, role: createForm.role }
      if (createForm.username.trim()) payload.username = createForm.username.trim()
      if (createForm.role === 'level2') payload.group_id = createForm.group_id
      if (createForm.role === 'level3') payload.brand_id = createForm.brand_id
      if (createForm.role === 'staff') { payload.brand_id = createForm.brand_id; payload.zone_id = createForm.zone_id }
      await usersApi.create(payload)
      setCreateOpen(false)
      load()
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Something went wrong.')
    }
  }

  const openEdit = async (u) => {
    setEditingUser(u)
    setEditForm({ full_name: u.full_name, username: u.username || '', password: '', is_active: u.is_active, zone_id: u.zone_id || '' })
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
      const payload = { full_name: editForm.full_name, username: editForm.username.trim() || null, is_active: editForm.is_active }
      if (editForm.password) payload.password = editForm.password
      if (editingUser.role === 'staff' && editForm.zone_id) payload.zone_id = editForm.zone_id
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
                </p>
              </div>
              <div className="flex gap-1">
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
            <Select label="Zone" required value={createForm.zone_id} onChange={(e) => setCreateForm({ ...createForm, zone_id: e.target.value })}>
              <option value="">Select a zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name_en}</option>)}
            </Select>
          )}

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
            {editingUser.role === 'staff' && editZones.length > 0 && (
              <Select label="Zone" value={editForm.zone_id} onChange={(e) => setEditForm({ ...editForm, zone_id: e.target.value })}>
                {editZones.map((z) => <option key={z.id} value={z.id}>{z.name_en}</option>)}
              </Select>
            )}
            <Checkbox
              label="Account active (uncheck to block this person from logging in)"
              checked={editForm.is_active}
              onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
            />
            {editError && <p className="text-sm text-clay">{editError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

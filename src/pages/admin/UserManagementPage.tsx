import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { UserPlus, Edit2, ToggleLeft, ToggleRight, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLES = ['executive', 'manager', 'director', 'accounts', 'super_admin'] as const
type Role = typeof ROLES[number]

const ROLE_LABELS: Record<Role, string> = {
  executive:   'Executive',
  manager:     'Manager',
  director:    'Director',
  accounts:    'Accounts',
  super_admin: 'Super Admin',
}

const ROLE_COLORS: Record<Role, string> = {
  executive:   'bg-blue-100 text-blue-700',
  manager:     'bg-purple-100 text-purple-700',
  director:    'bg-amber-100 text-amber-700',
  accounts:    'bg-green-100 text-green-700',
  super_admin: 'bg-red-100 text-red-700',
}

interface UserRow {
  id: string
  name: string
  role: Role
  is_active: boolean
  email?: string
  phone?: string
  whatsapp_number?: string
}

interface InviteForm {
  email: string
  name: string
  role: Role
  phone: string
  whatsapp_number: string
}

export default function UserManagementPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['profiles', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, role, is_active, phone, whatsapp_number')
        .order('name')
      if (error) throw error
      return data as UserRow[]
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('profiles').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('User updated'); qc.invalidateQueries({ queryKey: ['profiles'] }) },
    onError: (e: Error) => toast.error('Failed', e.message),
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Role updated'); qc.invalidateQueries({ queryKey: ['profiles'] }) },
    onError: (e: Error) => toast.error('Failed', e.message),
  })

  return (
    <div>
      <TopBar title="User Management" subtitle="Manage staff accounts and roles" />
      <div className="p-6 space-y-6 animate-fade-up">

        <div className="flex justify-end">
          <button
            onClick={() => { setEditUser(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
          >
            <UserPlus size={14} /> Invite User
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl border animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-border">
                <tr>
                  {['Name','Role','Status','Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-xs">
                          {u.name?.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-brand-950">{u.name}</p>
                          {u.phone && <p className="text-xs text-muted-foreground">{u.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={u.role}
                        onChange={e => updateRole.mutate({ id: u.id, role: e.target.value as Role })}
                        disabled={u.id === profile?.id}
                        className={cn(
                          'text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none',
                          ROLE_COLORS[u.role]
                        )}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
                        u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditUser(u); setShowForm(true) }}
                          className="p-1.5 text-muted-foreground hover:text-brand-600 hover:bg-brand-50 rounded-lg"
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        {u.id !== profile?.id && (
                          <button
                            onClick={() => toggleActive.mutate({ id: u.id, is_active: !u.is_active })}
                            className={cn('p-1.5 rounded-lg', u.is_active ? 'text-green-600 hover:bg-red-50 hover:text-red-600' : 'text-gray-400 hover:bg-green-50 hover:text-green-600')}
                            title={u.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {u.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <div className="flex items-start gap-2">
            <Shield size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium mb-1">Inviting New Users</p>
              <p className="text-xs text-blue-700">Click "Invite User" to send an email invitation. The user will receive a link to set their password. You can set their role here after they accept.</p>
            </div>
          </div>
        </div>

      </div>

      {showForm && (
        <UserForm
          user={editUser}
          onClose={() => { setShowForm(false); setEditUser(null) }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['profiles'] }); setShowForm(false); setEditUser(null) }}
        />
      )}
    </div>
  )
}

function UserForm({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<InviteForm>({
    email: '',
    name:  user?.name ?? '',
    role:  user?.role ?? 'executive',
    phone: user?.phone ?? '',
    whatsapp_number: user?.whatsapp_number ?? '',
  })
  const [loading, setLoading] = useState(false)
  const isEdit = !!user

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEdit) {
        // Update profile details
        const { error } = await supabase.from('profiles').update({
          name: form.name,
          role: form.role,
          phone: form.phone || null,
          whatsapp_number: form.whatsapp_number || null,
        }).eq('id', user.id)
        if (error) throw error
        toast.success('User updated')
      } else {
        // Invite via Supabase Admin API (requires service role — use Edge Function)
        const { error } = await supabase.functions.invoke('invite-user', {
          body: { email: form.email, name: form.name, role: form.role, phone: form.phone, whatsapp_number: form.whatsapp_number },
        })
        if (error) throw error
        toast.success('Invitation sent', `${form.email} will receive an invite link`)
      }
      onSaved()
    } catch (err: any) {
      toast.error('Failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit User' : 'Invite New User'}</h2>
          <button onClick={onClose}><Shield size={14} className="text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Email *</label>
              <input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="employee@tpsxperts.com" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Full Name *</label>
            <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Role *</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value as Role})}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none"
                placeholder="Mobile number" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">WhatsApp Number</label>
            <input value={form.whatsapp_number} onChange={e => setForm({...form, whatsapp_number: e.target.value})}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none"
              placeholder="91XXXXXXXXXX" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {loading ? 'Saving…' : isEdit ? 'Update' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

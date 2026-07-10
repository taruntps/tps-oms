import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sym } from '@/components/shared/Sym'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import { cn } from '@/lib/utils'

interface Props { projectId: string }

const ADMIN_ROLES = ['super_admin', 'director', 'manager']

export function RemarksTab({ projectId }: Props) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')

  const { data: remarks = [], isLoading } = useQuery({
    queryKey: ['project_remarks', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('project_remarks')
        .select('*, profiles!project_remarks_created_by_fkey(name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const addRemark = useMutation({
    mutationFn: async (remark: string) => {
      const { error } = await (supabase as any).from('project_remarks')
        .insert({ project_id: projectId, created_by: profile!.id, remark })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project_remarks', projectId] }); setDraft('') },
  })

  const deleteRemark = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).from('project_remarks').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('You can only delete your own remarks')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project_remarks', projectId] }),
  })

  const canDelete = (r: any) =>
    r.created_by === profile?.id || ADMIN_ROLES.includes(profile?.role ?? '')

  const handleAdd = async () => {
    if (!draft.trim()) return
    try { await addRemark.mutateAsync(draft.trim()); toast.success('Remark added') }
    catch (e: any) { toast.error('Failed to add remark', e.message) }
  }

  const handleDelete = async (r: any) => {
    if (!confirm('Delete this remark?')) return
    try { await deleteRemark.mutateAsync(r.id); toast.success('Remark deleted') }
    catch (e: any) { toast.error('Delete failed', e.message) }
  }

  return (
    <div className="space-y-4">
      {/* Add remark */}
      <div className="bg-white rounded-xl border border-border p-4">
        <label className="block text-xs font-medium text-brand-950 mb-2">Add a remark</label>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
          placeholder="Record any observation, instruction or note for this project…"
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button onClick={handleAdd} disabled={!draft.trim() || addRemark.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            <Sym name="add_comment" size={13} /> {addRemark.isPending ? 'Saving…' : 'Add Remark'}
          </button>
        </div>
      </div>

      {/* Remark list */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">{[1, 2].map(i => <div key={i} className="h-16 glass-panel rounded-xl" />)}</div>
      ) : remarks.length === 0 ? (
        <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
          <Sym name="chat_bubble" size={26} className="mx-auto text-white/60 mb-2" />
          <p className="text-xs text-white/60">No remarks yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {remarks.map((r: any) => (
            <div key={r.id} className="bg-white rounded-xl border border-border px-4 py-3 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center shrink-0 text-[11px] font-semibold text-brand-700">
                {(r.profiles?.name ?? '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-brand-950">{r.profiles?.name ?? 'Unknown'}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-brand-950 mt-0.5 whitespace-pre-wrap break-words">{r.remark}</p>
              </div>
              {canDelete(r) && (
                <button onClick={() => handleDelete(r)} title="Delete remark"
                  className={cn('text-muted-foreground hover:text-red-600 shrink-0', deleteRemark.isPending && 'opacity-50')}>
                  <Sym name="delete" size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

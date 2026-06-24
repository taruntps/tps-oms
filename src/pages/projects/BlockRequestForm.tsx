import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useSubmitBlockRequest } from '@/hooks/useProjects'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import type { Database } from '@/types/database'

type BlockType = Database['public']['Enums']['block_type']

const BLOCK_TYPES: { value: BlockType; label: string; description: string }[] = [
  { value: 'document_pending',     label: 'Pending Client Documents',  description: 'Client has not submitted required documents' },
  { value: 'payment_pending',      label: 'Pending Client Fee',         description: 'Client payment is pending' },
  { value: 'authority_delay',      label: 'Pending Authority Action',   description: 'Waiting on FSSAI/government response' },
  { value: 'client_unresponsive',  label: 'Client Unresponsive',        description: 'Client not responding to calls/emails' },
  { value: 'internal_review',      label: 'Internal Review',            description: 'Awaiting internal approval or review' },
  { value: 'other',                label: 'Other',                      description: 'Specify reason in details' },
]

interface Props {
  projectId: string
  projectCode: string
  onClose: () => void
}

export function BlockRequestForm({ projectId, projectCode, onClose }: Props) {
  const { profile } = useAuth()
  const submit = useSubmitBlockRequest()
  const [blockType, setBlockType] = useState<BlockType>('document_pending')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!reason.trim()) { toast.error('Reason required', 'Please describe why work is blocked.'); return }
    setLoading(true)
    try {
      await submit.mutateAsync({
        project_id:   projectId,
        block_type:   blockType,
        reason:       reason.trim(),
        requested_by: profile!.id,
      })
      toast.success('Block request submitted', 'Manager will review and approve.')
      onClose()
    } catch (err: any) {
      toast.error('Failed to submit', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-semibold text-brand-950">Request Block</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{projectCode}</p>
          </div>
          <button onClick={onClose}><Sym name="close" size={16} className="text-muted-foreground" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-2">Block Reason</label>
            <div className="space-y-2">
              {BLOCK_TYPES.map(bt => (
                <label key={bt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${blockType === bt.value ? 'border-brand-600 bg-brand-50' : 'border-border hover:bg-[#F8FAFC]'}`}>
                  <input
                    type="radio"
                    name="block_type"
                    value={bt.value}
                    checked={blockType === bt.value}
                    onChange={() => setBlockType(bt.value)}
                    className="mt-0.5 accent-brand-600"
                  />
                  <div>
                    <p className="text-xs font-medium text-brand-950">{bt.label}</p>
                    <p className="text-[11px] text-muted-foreground">{bt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Details *</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why work is blocked and what is needed to unblock…"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 resize-none"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-700">
              Once approved, the <strong>clock will pause</strong> and block timer starts from manager approval time.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {loading ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

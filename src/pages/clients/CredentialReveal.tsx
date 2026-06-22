import { useState } from 'react'
import { Eye, EyeOff, Lock, Loader2 } from 'lucide-react'
import { useRevealCredential } from '@/hooks/useLicenses'
import { toast } from '@/components/shared/Toast'

interface Props {
  licenseId: string
  username: string | null
}

export function CredentialReveal({ licenseId, username }: Props) {
  const [password, setPassword] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const reveal = useRevealCredential()

  const handleReveal = async () => {
    if (!reason.trim()) {
      toast.error('Please enter a reason for access')
      return
    }
    try {
      const pwd = await reveal.mutateAsync({ licenseId, reason })
      setPassword(pwd)
      setConfirming(false)
      setReason('')
      // Auto-hide after 30 seconds
      setTimeout(() => setPassword(null), 30000)
    } catch (err: any) {
      toast.error('Cannot reveal credential', err.message)
    }
  }

  if (!username) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock size={11} />
        No credentials stored
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Lock size={11} className="text-muted-foreground" />
        <span className="text-muted-foreground">Username:</span>
        <span className="font-mono text-brand-950">{username}</span>
      </div>

      {password ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <span className="font-mono text-sm text-amber-900">
              {showPassword ? password : '•'.repeat(password.length)}
            </span>
            <button onClick={() => setShowPassword(v => !v)} className="text-amber-600 hover:text-amber-800">
              {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          <span className="text-[10px] text-amber-600 font-mono">Auto-hides in 30s</span>
        </div>
      ) : confirming ? (
        <div className="bg-[#F8FAFC] border border-border rounded-lg p-3 space-y-2">
          <p className="text-xs text-muted-foreground">State reason for accessing the FSSAI password:</p>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Submitting renewal form on behalf of client"
            className="w-full text-xs px-3 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReveal}
              disabled={reveal.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {reveal.isPending ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
              Reveal
            </button>
            <button onClick={() => setConfirming(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Eye size={11} />
          Reveal FSSAI Password
        </button>
      )}
    </div>
  )
}

// WhatsApp Inbox (/marketing/whatsapp-inbox) — replies to campaigns land here. Meta blocks
// wa.me buttons and a Cloud API number has no phone inbox, so this is the only place typed
// WhatsApp replies surface. Fed by the whatsapp-inbound webhook; replies sent via the
// wa-send-reply edge function (free text allowed for 24h after the customer messaged). Admin only.
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { TopBar } from '@/components/layout/TopBar'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'
import { cn } from '@/lib/utils'

const db = supabase as any
const DAY_MS = 24 * 60 * 60 * 1000

interface Conversation {
  wa_phone: string; contact_name: string | null; last_at: string
  last_body: string | null; last_direction: 'in' | 'out'; unread: number | string; last_inbound_at: string | null
}
interface Message {
  id: string; direction: 'in' | 'out'; wa_phone: string; body: string | null
  msg_type: string; status: string; created_at: string
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function displayName(c: Conversation) { return c.contact_name?.trim() || `+${c.wa_phone}` }

export default function WhatsAppInboxPage() {
  const qc = useQueryClient()
  const [active, setActive] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['wa', 'inbox', 'conversations'],
    queryFn: async () => {
      const { data, error } = await db.from('wa_conversations').select('*').order('last_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Conversation[]
    },
    refetchInterval: 15_000,
  })

  const { data: messages = [] } = useQuery({
    queryKey: ['wa', 'inbox', 'thread', active],
    queryFn: async () => {
      const { data, error } = await db.from('wa_messages').select('*').eq('wa_phone', active).order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Message[]
    },
    enabled: !!active,
    refetchInterval: 10_000,
  })

  const markRead = useMutation({
    mutationFn: async (phone: string) => {
      const { error } = await db.from('wa_messages').update({ read_at: new Date().toISOString() })
        .eq('wa_phone', phone).eq('direction', 'in').is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa', 'inbox', 'conversations'] }),
  })

  // Mark the opened thread as read.
  useEffect(() => {
    if (active) markRead.mutate(active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Keep the thread scrolled to the newest message.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, active])

  const activeConv = conversations.find(c => c.wa_phone === active) ?? null
  const windowOpen = !!activeConv?.last_inbound_at && (Date.now() - new Date(activeConv.last_inbound_at).getTime() < DAY_MS)

  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.functions.invoke('wa-send-reply', { body: { to: active, body: draft.trim() } })
      if (error) {
        let msg = error.message || 'Send failed'
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error } catch { /* keep generic */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey: ['wa', 'inbox', 'thread', active] })
      qc.invalidateQueries({ queryKey: ['wa', 'inbox', 'conversations'] })
    },
    onError: (e: Error) => toast.error('Could not send', e.message),
  })

  return (
    <div>
      <TopBar title="WhatsApp Inbox" subtitle="Replies to your WhatsApp campaigns" />
      <div className="p-6 animate-fade-up">
        <div className="flex bg-white rounded-xl border border-border overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 460 }}>
          {/* Conversation list — full width on mobile; hidden there once a chat is open */}
          <div className={cn('w-full md:w-[300px] shrink-0 border-r border-border overflow-y-auto', active && 'hidden md:block')}>
            {isLoading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10 px-4">No replies yet. Incoming WhatsApp replies to your campaigns will appear here.</p>
            ) : conversations.map(c => (
              <button key={c.wa_phone} onClick={() => setActive(c.wa_phone)}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-[#F8FAFC] ${active === c.wa_phone ? 'bg-[#F1F5F9]' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-brand-950 truncate">{displayName(c)}</span>
                  {Number(c.unread) > 0 && <span className="shrink-0 text-[10px] font-semibold bg-green-600 text-white rounded-full px-1.5 py-0.5">{c.unread}</span>}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.last_direction === 'out' ? 'You: ' : ''}{c.last_body || '—'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{fmtTime(c.last_at)}</p>
              </button>
            ))}
          </div>

          {/* Thread — hidden on mobile until a chat is selected */}
          <div className={cn('flex-1 flex-col min-w-0', active ? 'flex' : 'hidden md:flex')}>
            {!active ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">Select a conversation to read and reply.</div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                  <button onClick={() => setActive(null)} aria-label="Back to conversations"
                    className="md:hidden shrink-0 text-muted-foreground hover:text-brand-950">
                    <Sym name="arrow_back" size={18} />
                  </button>
                  <div className="min-w-0">
                    <p className="font-medium text-brand-950 truncate">{activeConv ? displayName(activeConv) : `+${active}`}</p>
                    <p className="text-[11px] text-muted-foreground truncate">+{active}</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-[#F8FAFC]">
                  {messages.map(m => (
                    <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${m.direction === 'out' ? 'bg-green-600 text-white rounded-br-sm' : 'bg-white border border-border rounded-bl-sm text-brand-950'}`}>
                        {m.body}
                        <div className={`text-[10px] mt-1 ${m.direction === 'out' ? 'text-green-100' : 'text-muted-foreground'}`}>
                          {fmtTime(m.created_at)}{m.direction === 'out' ? ` · ${m.status}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                {/* Reply box */}
                <div className="border-t border-border p-3">
                  {!windowOpen && (
                    <div className="mb-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                      The 24-hour reply window is closed (this contact hasn’t messaged in the last day). To re-engage, send an approved template via a campaign.
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1}
                      placeholder={windowOpen ? 'Type a reply…' : 'Reply window closed'}
                      disabled={!windowOpen || send.isPending}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (draft.trim() && windowOpen) send.mutate() } }}
                      className="flex-1 resize-none px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 disabled:bg-[#F8FAFC]" />
                    <button onClick={() => send.mutate()} disabled={!draft.trim() || !windowOpen || send.isPending}
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 shrink-0">
                      {send.isPending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

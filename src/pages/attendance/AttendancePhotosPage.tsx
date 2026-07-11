import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Row = {
  id: string; user_id: string; punch_at: string; selfie_path: string | null
  latitude: number | null; longitude: number | null; distance_m: number | null
  within_fence: boolean | null; is_field: boolean | null
  verification_status: string | null; face_score: number | null
  profiles: { name: string | null; employee_code: string | null } | null
  url?: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  verified:   { label: '✅ Verified',   cls: 'bg-green-100 text-green-700' },
  no_match:   { label: '❌ No match',    cls: 'bg-red-100 text-red-700' },
  unverified: { label: '⚠️ Unverified',  cls: 'bg-amber-100 text-amber-700' },
  none:       { label: '— None',         cls: 'bg-gray-100 text-gray-600' },
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN',
  { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

export default function AttendancePhotosPage() {
  const [staff, setStaff] = useState('')
  const [status, setStatus] = useState('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['attendance_photos'],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('attendance_punches')
        .select('id,user_id,punch_at,selfie_path,latitude,longitude,distance_m,within_fence,is_field,verification_status,face_score,profiles:user_id(name,employee_code)')
        .not('selfie_path', 'is', null)
        .gte('punch_at', since)
        .order('punch_at', { ascending: false })
        .limit(300)
      if (error) throw error
      const list = (data ?? []) as unknown as Row[]
      // Short-lived signed URLs for the private photos (batched).
      const paths = list.map(r => r.selfie_path!).filter(Boolean)
      const { data: signed } = await supabase.storage.from('attendance').createSignedUrls(paths, 3600)
      const urlByPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))
      return list.map(r => ({ ...r, url: r.selfie_path ? urlByPath.get(r.selfie_path) ?? null : null }))
    },
    staleTime: 60_000,
  })

  const staffOptions = [...new Map(rows.map(r => [r.user_id, r.profiles?.name ?? '—'])).entries()]
  const filtered = rows.filter(r =>
    (!staff || r.user_id === staff) &&
    (!status || (r.verification_status ?? 'none') === status))

  return (
    <div>
      <TopBar title="Attendance Photos" subtitle="Punch photos with verification status" />
      <div className="p-6 animate-fade-up space-y-4">

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select value={staff} onChange={e => setStaff(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white">
            <option value="">All staff</option>
            {staffOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white">
            <option value="">All statuses</option>
            <option value="verified">✅ Verified</option>
            <option value="no_match">❌ No match</option>
            <option value="unverified">⚠️ Unverified</option>
          </select>
          <span className="ml-auto self-center text-xs text-white/70">{filtered.length} punch photos (last 14 days)</span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-56 glass-panel rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-10 text-center">
            <Sym name="photo_camera" size={28} className="mx-auto text-white/50 mb-2" />
            <p className="text-sm text-white/60">No punch photos yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map(r => {
              const st = STATUS[r.verification_status ?? 'none'] ?? STATUS.none
              return (
                <div key={r.id} className="bg-white rounded-xl border border-border overflow-hidden">
                  {r.url
                    ? <a href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt="punch" className="w-full aspect-[3/4] object-cover" /></a>
                    : <div className="w-full aspect-[3/4] bg-[#F1F5F9] flex items-center justify-center text-muted-foreground text-xs">no photo</div>}
                  <div className="p-2.5 space-y-1">
                    <p className="text-xs font-semibold text-brand-950 truncate">{r.profiles?.name ?? 'Unknown'}</p>
                    <p className="text-[10px] text-muted-foreground">{fmt(r.punch_at)}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', st.cls)}>{st.label}</span>
                      {r.is_field ? <span className="text-[10px] text-blue-600">field</span>
                        : r.within_fence ? <span className="text-[10px] text-green-600">office</span>
                        : <span className="text-[10px] text-amber-600">off-site</span>}
                    </div>
                    {r.latitude != null && r.longitude != null && (
                      <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer"
                        className="text-[10px] text-brand-600 hover:underline flex items-center gap-0.5">
                        <Sym name="location_on" size={10} /> map
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import {
  useAttendanceSettings, useActiveOffice, useUpdateAttendanceSettings, useUpsertOffice,
} from '@/hooks/useAttendance'

export function AttendanceSettingsSection() {
  const { data: settings } = useAttendanceSettings()
  const { data: office } = useActiveOffice()
  const updateSettings = useUpdateAttendanceSettings()
  const upsertOffice = useUpsertOffice()
  const [locating, setLocating] = useState(false)

  const [s, setS] = useState({ expected_start_time: '09:30', standard_hours: 8, selfie_required: false, accuracy_threshold_m: 100 })
  const [o, setO] = useState({ name: '', latitude: '', longitude: '', radius_m: 150 })

  useEffect(() => { if (settings) setS({
    expected_start_time: (settings.expected_start_time ?? '09:30').slice(0,5),
    standard_hours: Number(settings.standard_hours ?? 8),
    selfie_required: !!settings.selfie_required,
    accuracy_threshold_m: settings.accuracy_threshold_m ?? 100,
  }) }, [settings])
  useEffect(() => { if (office) setO({
    name: office.name, latitude: String(office.latitude), longitude: String(office.longitude), radius_m: office.radius_m,
  }) }, [office])

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setO(v => ({ ...v, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) })); setLocating(false); toast.success('Captured current location', `Accuracy ${Math.round(pos.coords.accuracy)} m`) },
      err => { setLocating(false); toast.error('Location failed', err.message) },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const saveOffice = async () => {
    const lat = parseFloat(o.latitude), lng = parseFloat(o.longitude)
    if (!o.name || Number.isNaN(lat) || Number.isNaN(lng)) { toast.error('Enter office name + valid coordinates'); return }
    try { await upsertOffice.mutateAsync({ id: office?.id, name: o.name, latitude: lat, longitude: lng, radius_m: Number(o.radius_m) }); toast.success('Office geofence saved') }
    catch (e: any) { toast.error('Failed', e.message) }
  }
  const saveSettings = async () => {
    try { await updateSettings.mutateAsync({ expected_start_time: s.expected_start_time, standard_hours: s.standard_hours, selfie_required: s.selfie_required, accuracy_threshold_m: s.accuracy_threshold_m } as any); toast.success('Attendance settings saved') }
    catch (e: any) { toast.error('Failed', e.message) }
  }

  return (
    <section className="bg-white rounded-xl border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
          <Sym name="fingerprint" size={14} className="text-brand-700" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-brand-950">Attendance &amp; Geofence</h2>
          <p className="text-[11px] text-muted-foreground">Office location, radius and punch rules</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Office geofence */}
        <div>
          <p className="text-xs font-semibold text-brand-950 uppercase tracking-wide mb-2">Office Location</p>
          <div className="grid grid-cols-2 gap-3">
            <L label="Office Name" wide><input className={ic} value={o.name} onChange={e=>setO({...o, name:e.target.value})} placeholder="TPS Office — Mohali" /></L>
            <L label="Latitude"><input className={ic} value={o.latitude} onChange={e=>setO({...o, latitude:e.target.value})} placeholder="30.6726" /></L>
            <L label="Longitude"><input className={ic} value={o.longitude} onChange={e=>setO({...o, longitude:e.target.value})} placeholder="76.7395" /></L>
            <L label="Radius (metres)"><input type="number" className={ic} value={o.radius_m} onChange={e=>setO({...o, radius_m:Number(e.target.value)})} /></L>
            <div className="flex items-end">
              <button onClick={useMyLocation} disabled={locating}
                className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">
                <Sym name={locating ? 'progress_activity' : 'my_location'} size={14} className={locating ? 'animate-spin' : ''} /> Use my current location
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Tip: open this on a phone <em>at the office</em> and tap "Use my current location" for accurate coordinates.</p>
          <div className="mt-3 flex justify-end">
            <button onClick={saveOffice} disabled={upsertOffice.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save Office</button>
          </div>
        </div>

        {/* Punch rules */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs font-semibold text-brand-950 uppercase tracking-wide mb-2">Punch Rules</p>
          <div className="grid grid-cols-2 gap-3">
            <L label="Expected Start Time"><input type="time" className={ic} value={s.expected_start_time} onChange={e=>setS({...s, expected_start_time:e.target.value})} /></L>
            <L label="Standard Hours / day"><input type="number" step="0.5" className={ic} value={s.standard_hours} onChange={e=>setS({...s, standard_hours:Number(e.target.value)})} /></L>
            <L label="GPS Accuracy Limit (m)"><input type="number" className={ic} value={s.accuracy_threshold_m} onChange={e=>setS({...s, accuracy_threshold_m:Number(e.target.value)})} /></L>
            <L label="Require Selfie at Punch">
              <button type="button" onClick={()=>setS({...s, selfie_required:!s.selfie_required})}
                className={`px-3 py-2 rounded-lg text-sm font-medium border ${s.selfie_required ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-[#F8FAFC] border-border text-muted-foreground'}`}>
                {s.selfie_required ? 'Selfie ON' : 'Selfie OFF'}
              </button>
            </L>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={saveSettings} disabled={updateSettings.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save Rules</button>
          </div>
        </div>
      </div>
    </section>
  )
}

function L({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="block text-[11px] font-medium text-brand-950 mb-1">{label}</label>
      {children}
    </div>
  )
}
const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20'

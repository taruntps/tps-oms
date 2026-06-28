import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Sym } from '@/components/shared/Sym'
import { useSoiArchive, useDeleteSoi } from '@/hooks/useAuthorityQueries'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface Props { projectId: string; clientId: string; clientName?: string; closed?: boolean }

type SoiType = 'domestic' | 'export'
interface ColDef { key: string; label: string }
interface ParsedRow { sr_no: number; data: Record<string, string> }

// ─── Column maps mirror the two FSSAI portal SOI tables exactly ──────────────
const DOMESTIC_COLS: ColDef[] = [
  { key: 'food_category',    label: 'Food Category' },
  { key: 'sub_category',     label: 'Sub-Food Category Name' },
  { key: 'product',          label: 'Product' },
  { key: 'kind_of_business', label: 'Kind of Business' },
]
const EXPORT_COLS: ColDef[] = [
  { key: 'export_unit_type', label: 'Export Unit Type' },
  { key: 'product_category', label: 'Product Category' },
  { key: 'product',          label: 'Name of Food Item(s)' },
  { key: 'quantity',         label: 'Quantity' },
  { key: 'unit',             label: 'Unit' },
  { key: 'per_basis',        label: 'Per day/Per annum' },
  { key: 'scope_supply',     label: 'Scope of Product Supply' },
]
const colsFor = (t: SoiType) => (t === 'export' ? EXPORT_COLS : DOMESTIC_COLS)

// Header / noise keywords to drop while parsing (covers both formats).
const HEADER_HINTS = [
  'food category', 'sub-food', 'kind of business', 'upload product', 'production capacity',
  'sl.no', 'export unit', 'product category', 'name of food', 'per day/per annum', 'scope of',
]

// ─── Smart paste parser ──────────────────────────────────────────────────────
// The FSSAI copy includes the trailing "Upload"/"View" and "Action"/"Delete" cells,
// so we map by FIXED index per format and simply ignore the extra trailing cells.
// We split on TAB (preserving empty cells so indices stay aligned); fall back to
// 2+ spaces only when a row has no tabs.
function parseFssaiTable(raw: string, type: SoiType): ParsedRow[] {
  const lines = raw.split('\n').map(l => l.replace(/ /g, ' ')).filter(l => l.trim().length > 0)
  const out: ParsedRow[] = []
  let sr = 1

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (HEADER_HINTS.some(h => lower.includes(h))) continue          // header rows
    const cells = (line.includes('\t') ? line.split('\t') : line.split(/ {2,}/)).map(c => c.trim())

    let data: Record<string, string>
    if (type === 'domestic') {
      // [Food Category, Sub-Food Category, Product, Kind of Business, (Upload), (Action)]
      if (cells.filter(Boolean).length < 3) continue
      data = {
        food_category:    cells[0] ?? '',
        sub_category:     cells[1] ?? '',
        product:          cells[2] ?? '',
        kind_of_business: cells[3] ?? '',
      }
      if (!data.product) continue
    } else {
      // [Sl.No, Export Unit Type, Product Category, Name of Food Item, Qty, Unit, Per-basis, Scope, (Action)]
      // Native Sl.No is at index 0 — we re-number ourselves, so map from index 1.
      const n = cells.length
      if (n < 8) continue
      data = {
        export_unit_type: cells[1] ?? '',
        product_category: cells[2] ?? '',
        product:          cells[3] ?? '',
        quantity:         cells[4] ?? '',
        unit:             cells[5] ?? '',
        per_basis:        cells[6] ?? '',
        scope_supply:     cells[7] ?? '',
      }
      if (!data.product) continue
    }
    out.push({ sr_no: sr++, data })
  }
  return out
}

export function SoiTab({ projectId, clientId, clientName, closed }: Props) {
  const { profile } = useAuth()
  const { data: sois = [], isLoading } = useSoiArchive(clientId)
  const deleteSoi = useDeleteSoi()

  const [mode, setMode] = useState<'list' | 'paste' | 'preview'>('list')
  const [soiType, setSoiType] = useState<SoiType>('domestic')
  const [soiDate, setSoiDate] = useState(new Date().toISOString().split('T')[0])
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState<ParsedRow[]>([])
  const [activeCols, setActiveCols] = useState<ColDef[]>(DOMESTIC_COLS)
  const [saving, setSaving] = useState(false)
  const [expandedSoi, setExpandedSoi] = useState<string | null>(null)
  const [soiProducts, setSoiProducts] = useState<Record<string, any[]>>({})

  const resetFlow = () => { setMode('list'); setPasteText(''); setPreview([]) }

  const handleParse = () => {
    const rows = parseFssaiTable(pasteText, soiType)
    if (rows.length === 0) { toast.error('No data found', 'Check the pasted text — ensure it contains product rows'); return }
    setPreview(rows)
    setActiveCols(colsFor(soiType))
    setMode('preview')
  }

  const removeRow = (idx: number) =>
    setPreview(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sr_no: i + 1 })))

  const removeCol = (key: string) => {
    if (activeCols.length <= 1) { toast.error('Keep at least one column'); return }
    setActiveCols(prev => prev.filter(c => c.key !== key))
  }

  const handleSave = async () => {
    if (!soiDate) { toast.error('Select an SOI date'); return }
    if (preview.length === 0) { toast.error('Nothing to save'); return }
    setSaving(true)
    try {
      // Next version number for this project.
      const { data: existing } = await (supabase as any)
        .from('soi_archive').select('version_no').eq('project_id', projectId)
      const nextVer = (existing ?? []).reduce((m: number, r: any) => Math.max(m, r.version_no ?? 0), 0) + 1

      const keptKeys = activeCols.map(c => c.key)
      const { data: soiRecord, error: soiErr } = await (supabase as any).from('soi_archive').insert({
        client_id:   clientId,
        project_id:  projectId,
        created_by:  profile!.id,
        soi_date:    soiDate,
        soi_type:    soiType,
        columns:     activeCols,
        version_no:  nextVer,
        description: `${preview.length} ${soiType} products`,
      }).select().single()
      if (soiErr) throw soiErr

      const rows = preview.map(p => ({
        soi_id: soiRecord.id,
        sr_no:  p.sr_no,
        data:   Object.fromEntries(keptKeys.map(k => [k, p.data[k] ?? ''])),
      }))
      const { error: prodErr } = await (supabase as any).from('soi_products').insert(rows)
      if (prodErr) throw prodErr

      toast.success('SOI saved', `V${nextVer} · ${preview.length} products`)
      resetFlow()
    } catch (err: any) {
      toast.error('Failed to save SOI', err.message)
    } finally { setSaving(false) }
  }

  const loadProducts = async (soiId: string): Promise<any[]> => {
    if (soiProducts[soiId]) return soiProducts[soiId]
    const { data } = await (supabase as any).from('soi_products').select('*').eq('soi_id', soiId).order('sr_no')
    const rows = data ?? []
    setSoiProducts(prev => ({ ...prev, [soiId]: rows }))
    return rows
  }

  const toggleSoi = async (soiId: string) => {
    const next = expandedSoi === soiId ? null : soiId
    setExpandedSoi(next)
    if (next) await loadProducts(next)
  }

  const downloadExcel = async (s: any) => {
    try {
      const products = await loadProducts(s.id)
      const cols: ColDef[] = (s.columns?.length ? s.columns : colsFor(s.soi_type)) as ColDef[]
      const header = ['S.No', ...cols.map(c => c.label)]
      const body = products.map((p: any) => [p.sr_no, ...cols.map(c => p.data?.[c.key] ?? '')])
      const ws = XLSX.utils.aoa_to_sheet([header, ...body])
      ws['!cols'] = header.map((h, i) => ({ wch: i === 0 ? 6 : Math.min(60, Math.max(14, h.length + 4)) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'SOI')
      const nameSlug = (clientName ?? 'client').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
      XLSX.writeFile(wb, `SOI_${nameSlug}_${s.soi_type}_V${s.version_no ?? 1}_${s.soi_date}.xlsx`)
    } catch (e: any) { toast.error('Download failed', e.message) }
  }

  const handleDelete = async (s: any) => {
    if (!confirm(`Delete SOI V${s.version_no ?? 1} (${s.description ?? s.soi_type})? This cannot be undone.`)) return
    try {
      await deleteSoi.mutateAsync({ soiId: s.id, clientId })
      toast.success('SOI deleted')
      if (expandedSoi === s.id) setExpandedSoi(null)
    } catch (e: any) { toast.error('Delete failed', e.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/70">Statement of Ingredients archive</p>
        <RoleGuard roles={['super_admin','director','manager','executive']}>
          <div className="flex gap-2">
            {mode !== 'list' && (
              <button onClick={resetFlow} className="text-xs text-white/70 hover:text-white">← Back</button>
            )}
            {mode === 'list' && !closed && (
              <button onClick={() => setMode('paste')}
                className="flex items-center gap-1.5 text-sm text-white font-medium hover:text-white/80">
                <Sym name="content_paste" size={13} /> Smart Paste from FSSAI
              </button>
            )}
            {mode === 'list' && closed && (
              <span className="text-[11px] text-white/60 flex items-center gap-1"><Sym name="lock" size={11} /> Project closed — locked</span>
            )}
          </div>
        </RoleGuard>
      </div>

      {/* ── PASTE MODE ── */}
      {mode === 'paste' && (
        <div className="bg-[#F8FAFC] rounded-xl border border-border p-5 space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-brand-950 mb-2">Smart Paste — FSSAI SOI Table</h4>
            {/* Format toggle */}
            <div className="flex gap-2 mb-3">
              {(['domestic','export'] as SoiType[]).map(t => (
                <button key={t} onClick={() => setSoiType(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${soiType === t
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-brand-950 border-border hover:bg-[#F1F5F9]'}`}>
                  {t === 'domestic' ? 'Domestic' : 'Export'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              FSSAI portal → {soiType === 'export' ? 'Export' : 'Food/Health Supplements'} product table →
              select all rows → copy → paste below. Headers, the <em>Upload</em>/<em>View</em> and{' '}
              <em>Action</em>/<em>Delete</em> cells are auto-stripped.
            </p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={8}
              placeholder="Paste the SOI table here (select the table, Ctrl+C from FSSAI portal)…"
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white"
            />
          </div>
          <div className="max-w-[220px]">
            <label className="block text-[11px] font-medium text-brand-950 mb-1">SOI / Submission Date *</label>
            <input type="date" value={soiDate} onChange={e => setSoiDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleParse} disabled={!pasteText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              <Sym name="visibility" size={13} /> Preview & Clean
            </button>
            <button onClick={resetFlow} className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-white">Cancel</button>
          </div>
        </div>
      )}

      {/* ── PREVIEW MODE ── */}
      {mode === 'preview' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-green-800">
              ✓ {preview.length} products parsed — {soiType === 'export' ? 'Export' : 'Domestic'} format
            </p>
            <p className="text-xs text-green-700">Delete unwanted rows (✕ at end) or columns (✕ in header)</p>
          </div>

          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC] border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">#</th>
                  {activeCols.map(c => (
                    <th key={c.key} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        <button onClick={() => removeCol(c.key)} title="Remove column"
                          className="text-muted-foreground hover:text-red-600"><Sym name="close" size={11} /></button>
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((p, i) => (
                  <tr key={i} className="hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{p.sr_no}</td>
                    {activeCols.map(c => (
                      <td key={c.key} className="px-3 py-2 text-brand-950 max-w-[260px] truncate" title={p.data[c.key]}>
                        {p.data[c.key] || '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-600">
                        <Sym name="delete" size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || preview.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Sym name="check" size={13} /> {saving ? 'Saving…' : `Save ${preview.length} Products`}
            </button>
            <button onClick={() => setMode('paste')} className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-[#F8FAFC]">
              ← Re-paste
            </button>
          </div>
        </div>
      )}

      {/* ── LIST MODE ── */}
      {mode === 'list' && (
        isLoading ? (
          <div className="space-y-2 animate-pulse">{[1,2].map(i => <div key={i} className="h-14 glass-panel rounded-xl" />)}</div>
        ) : sois.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
            <Sym name="inventory_2" size={28} className="mx-auto text-white/60 mb-2" />
            <p className="text-xs text-white/60">No SOI entries yet. Use Smart Paste to import from the FSSAI portal.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sois.map((s: any) => {
              const products = soiProducts[s.id] ?? []
              const isOpen   = expandedSoi === s.id
              const cols: ColDef[] = (s.columns?.length ? s.columns : colsFor(s.soi_type)) as ColDef[]
              return (
                <div key={s.id} className="bg-white rounded-xl border border-border overflow-hidden">
                  <div className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F8FAFC]">
                    <button onClick={() => toggleSoi(s.id)} className="flex items-center gap-3 text-left flex-1">
                      <Sym name="inventory_2" size={14} className="text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded">V{s.version_no ?? 1}</span>
                          <span className="text-sm font-medium text-brand-950">{formatDate(s.soi_date)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${s.soi_type === 'export'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                            {s.soi_type === 'export' ? 'Export' : 'Domestic'}
                          </span>
                        </div>
                        {s.description && <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => downloadExcel(s)} title="Download Excel"
                        className="flex items-center gap-1 text-[11px] text-green-700 hover:text-green-800 border border-green-200 bg-green-50 rounded px-2 py-1">
                        <Sym name="download" size={12} /> Excel
                      </button>
                      {!closed && (
                        <RoleGuard roles={['super_admin','director','manager']}>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(s) }} title="Delete SOI entry"
                            className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 border border-red-200 bg-red-50 rounded px-2 py-1">
                            <Sym name="delete" size={12} /> Delete
                          </button>
                        </RoleGuard>
                      )}
                      <button onClick={() => toggleSoi(s.id)}>
                        <Sym name="add" size={13} className={`text-muted-foreground ${isOpen ? 'rotate-45' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {isOpen && products.length > 0 && (
                    <div className="border-t border-border overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#F8FAFC]">
                          <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">#</th>
                            {cols.map(c => (
                              <th key={c.key} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {products.map((p: any) => (
                            <tr key={p.id} className="hover:bg-[#F8FAFC]">
                              <td className="px-3 py-2 font-mono text-muted-foreground">{p.sr_no}</td>
                              {cols.map(c => (
                                <td key={c.key} className="px-3 py-2 text-brand-950 max-w-[260px] truncate" title={p.data?.[c.key]}>
                                  {p.data?.[c.key] || '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {isOpen && products.length === 0 && (
                    <p className="px-5 py-3 text-xs text-muted-foreground border-t border-border">No products saved for this SOI entry.</p>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

import { useState } from 'react'
import { Plus, Archive, ClipboardPaste, Eye, Check, Trash2 } from 'lucide-react'
import { useSoiArchive, useCreateSoi } from '@/hooks/useAuthorityQueries'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface Props { projectId: string; clientId: string }

interface ParsedProduct {
  sr_no: number
  product_name: string
  hsn_code: string
  category: string
  quantity: string
  uom: string
  manufacturer_name: string
  brand_name: string
}

// ─── Smart paste parser ────────────────────────────────────────────────────
// Handles tab-separated or multi-space text copied from FSSAI portal table.
function parseFssaiTable(raw: string): ParsedProduct[] {
  const lines = raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  const parsed: ParsedProduct[] = []
  let srCounter = 1

  for (const line of lines) {
    // Split on tabs or 2+ spaces
    const cols = line.split(/\t|  +/).map(c => c.trim()).filter(Boolean)
    if (cols.length < 2) continue

    // Skip header rows (contain "Sr. No", "S.No", "Product Name", "HSN")
    const lower = line.toLowerCase()
    if (lower.includes('sr.') || lower.includes('s.no') || lower.includes('product name') || lower.includes('hsn')) continue
    // Skip if first col is not a number
    const firstIsNum = /^\d+$/.test(cols[0])

    // Map columns — FSSAI table: Sr|Product Name|HSN|Category|Qty|UOM|Manufacturer|Brand
    const offset = firstIsNum ? 1 : 0
    parsed.push({
      sr_no:             srCounter++,
      product_name:      cols[offset + 0] ?? '',
      hsn_code:          cols[offset + 1] ?? '',
      category:          cols[offset + 2] ?? '',
      quantity:          cols[offset + 3] ?? '',
      uom:               cols[offset + 4] ?? '',
      manufacturer_name: cols[offset + 5] ?? '',
      brand_name:        cols[offset + 6] ?? '',
    })
  }
  return parsed.filter(p => p.product_name.length > 1)
}

export function SoiTab({ projectId, clientId }: Props) {
  const { profile } = useAuth()
  const { data: sois = [], isLoading } = useSoiArchive(clientId)
  const createSoi = useCreateSoi()

  const [mode, setMode] = useState<'list' | 'paste' | 'preview'>('list')
  const [soiDate, setSoiDate] = useState(new Date().toISOString().split('T')[0])
  const [soiCategory, setSoiCategory] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState<ParsedProduct[]>([])
  const [saving, setSaving] = useState(false)
  const [expandedSoi, setExpandedSoi] = useState<string | null>(null)
  const [soiProducts, setSoiProducts] = useState<Record<string, any[]>>({})

  const handleParse = () => {
    const rows = parseFssaiTable(pasteText)
    if (rows.length === 0) { toast.error('No data found', 'Check the pasted text — ensure it contains product rows'); return }
    setPreview(rows)
    setMode('preview')
  }

  const removeRow = (idx: number) => setPreview(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sr_no: i + 1 })))

  const handleSave = async () => {
    if (!soiDate) { toast.error('Select an SOI date'); return }
    setSaving(true)
    try {
      // 1. Create SOI record (soi_archive = existing table)
      const { data: soiRecord, error: soiErr } = await (supabase as any).from('soi_archive').insert({
        client_id:        clientId,
        project_id:       projectId,
        created_by:       profile!.id,
        soi_date:         soiDate,
        product_category: soiCategory || null,
        description:      `${preview.length} products imported from FSSAI portal`,
      }).select().single()
      if (soiErr) throw soiErr

      // 2. Insert all product rows into soi_products (new table from migration 006)
      const productRows = preview.map(p => ({
        soi_id:            soiRecord.id,
        sr_no:             p.sr_no,
        product_name:      p.product_name,
        hsn_code:          p.hsn_code || null,
        category:          p.category || null,
        quantity:          p.quantity || null,
        uom:               p.uom     || null,
        manufacturer_name: p.manufacturer_name || null,
        brand_name:        p.brand_name        || null,
      }))
      const { error: prodErr } = await (supabase as any).from('soi_products').insert(productRows)
      if (prodErr) throw prodErr

      toast.success('SOI saved', `${preview.length} products imported`)
      setPasteText(''); setPreview([]); setSoiCategory(''); setMode('list')
      createSoi.reset()
    } catch (err: any) {
      toast.error('Failed to save SOI', err.message)
    } finally { setSaving(false) }
  }

  const loadProducts = async (soiId: string) => {
    if (soiProducts[soiId]) return
    const { data, error } = await (supabase as any).from('soi_products').select('*').eq('soi_id', soiId).order('sr_no')
    if (!error) setSoiProducts(prev => ({ ...prev, [soiId]: data ?? [] }))
  }

  const toggleSoi = async (soiId: string) => {
    const next = expandedSoi === soiId ? null : soiId
    setExpandedSoi(next)
    if (next) await loadProducts(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Statement of Ingredients archive</p>
        <RoleGuard roles={['super_admin','director','manager','executive']}>
          <div className="flex gap-2">
            {mode !== 'list' && (
              <button onClick={() => { setMode('list'); setPasteText(''); setPreview([]) }}
                className="text-xs text-muted-foreground hover:text-brand-950">← Back</button>
            )}
            {mode === 'list' && (
              <button onClick={() => setMode('paste')}
                className="flex items-center gap-1.5 text-sm text-brand-600 font-medium hover:text-brand-700">
                <ClipboardPaste size={13} /> Smart Paste from FSSAI
              </button>
            )}
          </div>
        </RoleGuard>
      </div>

      {/* ── PASTE MODE ── */}
      {mode === 'paste' && (
        <div className="bg-[#F8FAFC] rounded-xl border border-border p-5 space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-brand-950 mb-1">Smart Paste — FSSAI SOI Table</h4>
            <p className="text-[11px] text-muted-foreground mb-3">
              Go to the FSSAI portal → SOI table → select all rows → copy → paste below.
              Headers and blank rows are auto-stripped.
            </p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={8}
              placeholder="Paste the SOI table here (Ctrl+A, Ctrl+C from FSSAI portal)…"
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-brand-950 mb-1">SOI Date *</label>
              <input type="date" value={soiDate} onChange={e => setSoiDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-brand-950 mb-1">Product Category (optional)</label>
              <input value={soiCategory} onChange={e => setSoiCategory(e.target.value)}
                placeholder="e.g. Nutraceuticals – Capsules"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleParse} disabled={!pasteText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              <Eye size={13} /> Preview & Clean
            </button>
            <button onClick={() => { setMode('list'); setPasteText('') }}
              className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-white">Cancel</button>
          </div>
        </div>
      )}

      {/* ── PREVIEW MODE ── */}
      {mode === 'preview' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-green-800">
              ✓ {preview.length} products parsed — review below then save
            </p>
            <p className="text-xs text-green-700">Remove rows by clicking ✕</p>
          </div>

          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC] border-b border-border">
                <tr>
                  {['#','Product Name','HSN','Category','Qty','UOM','Manufacturer','Brand',''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((p, i) => (
                  <tr key={i} className="hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{p.sr_no}</td>
                    <td className="px-3 py-2 font-medium text-brand-950 max-w-[160px] truncate">{p.product_name}</td>
                    <td className="px-3 py-2 font-mono">{p.hsn_code}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.category}</td>
                    <td className="px-3 py-2">{p.quantity}</td>
                    <td className="px-3 py-2">{p.uom}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{p.manufacturer_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.brand_name}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-600">
                        <Trash2 size={11} />
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
              <Check size={13} /> {saving ? 'Saving…' : `Save ${preview.length} Products`}
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
          <div className="space-y-2 animate-pulse">{[1,2].map(i => <div key={i} className="h-14 bg-white rounded-xl border border-border" />)}</div>
        ) : sois.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
            <Archive size={28} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No SOI entries yet. Use Smart Paste to import from FSSAI portal.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sois.map(s => {
              const products = soiProducts[s.id] ?? []
              const isOpen   = expandedSoi === s.id
              return (
                <div key={s.id} className="bg-white rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => toggleSoi(s.id)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F8FAFC] text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Archive size={14} className="text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-brand-950">{formatDate(s.soi_date)}</span>
                          {s.product_category && (
                            <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
                              {s.product_category}
                            </span>
                          )}
                        </div>
                        {s.description && <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {products.length > 0 && (
                        <span className="text-[11px] bg-[#F8FAFC] border border-border px-2 py-0.5 rounded">
                          {products.length} products
                        </span>
                      )}
                      {isOpen ? <Plus size={13} className="rotate-45 text-muted-foreground" /> : <Plus size={13} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Product list */}
                  {isOpen && products.length > 0 && (
                    <div className="border-t border-border overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#F8FAFC]">
                          <tr>
                            {['#','Product Name','HSN','Category','Qty','UOM','Manufacturer','Brand'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {products.map((p: any) => (
                            <tr key={p.id} className="hover:bg-[#F8FAFC]">
                              <td className="px-3 py-2 font-mono text-muted-foreground">{p.sr_no}</td>
                              <td className="px-3 py-2 font-medium text-brand-950 max-w-[180px] truncate">{p.product_name}</td>
                              <td className="px-3 py-2 font-mono">{p.hsn_code ?? '—'}</td>
                              <td className="px-3 py-2 text-muted-foreground">{p.category ?? '—'}</td>
                              <td className="px-3 py-2">{p.quantity ?? '—'}</td>
                              <td className="px-3 py-2">{p.uom ?? '—'}</td>
                              <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{p.manufacturer_name ?? '—'}</td>
                              <td className="px-3 py-2 text-muted-foreground">{p.brand_name ?? '—'}</td>
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

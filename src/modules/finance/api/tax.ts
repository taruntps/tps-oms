// Finance — GST line/total computation (all money in bigint paise, integers).
// India GST: an intra-state supply splits tax into CGST + SGST; an inter-state
// supply charges a single IGST. Whether a supply is intra- or inter-state is
// decided by comparing the invoice's place_of_supply against the supplier's
// home state (TPS is registered in Punjab).
export const SUPPLIER_STATE = 'Punjab'

export function isIntraState(placeOfSupply: string | null | undefined): boolean {
  if (!placeOfSupply) return true // default to intra-state when unknown
  return placeOfSupply.trim().toLowerCase() === SUPPLIER_STATE.toLowerCase()
}

/** A single editable invoice line (rupee/percent inputs; unit_price is paise). */
export interface LineInput {
  service_id: string | null
  description: string
  quantity: number
  unit_price: number // paise
  discount_percent: number
  gst_rate: number
  hsn_sac: string | null
}

/** Computed paise breakdown for one line. */
export interface LineComputed {
  base: number // quantity × unit_price (pre-discount), paise
  discount: number // paise
  taxable: number // base − discount, paise
  cgst: number
  sgst: number
  igst: number
  tax: number // cgst + sgst + igst
  line_total: number // taxable + tax, paise
}

/** Compute the paise breakdown for one line given the invoice's place of supply. */
export function computeLine(line: LineInput, placeOfSupply: string | null | undefined): LineComputed {
  const qty = Number.isFinite(line.quantity) ? line.quantity : 0
  const unit = Number.isFinite(line.unit_price) ? line.unit_price : 0
  const base = Math.round(qty * unit)
  const discount = Math.round((base * (line.discount_percent || 0)) / 100)
  const taxable = Math.max(0, base - discount)
  const tax = Math.round((taxable * (line.gst_rate || 0)) / 100)

  let cgst = 0
  let sgst = 0
  let igst = 0
  if (isIntraState(placeOfSupply)) {
    cgst = Math.round(tax / 2)
    sgst = tax - cgst
  } else {
    igst = tax
  }
  return { base, discount, taxable, cgst, sgst, igst, tax: cgst + sgst + igst, line_total: taxable + cgst + sgst + igst }
}

export interface InvoiceTotals {
  subtotal: number // sum of line base (pre-discount), paise
  discount_total: number
  tax_total: number
  grand_total: number
}

/** Aggregate invoice-level totals from the computed lines. */
export function computeTotals(lines: LineInput[], placeOfSupply: string | null | undefined): InvoiceTotals {
  return lines.reduce<InvoiceTotals>(
    (acc, l) => {
      const c = computeLine(l, placeOfSupply)
      acc.subtotal += c.base
      acc.discount_total += c.discount
      acc.tax_total += c.tax
      acc.grand_total += c.line_total
      return acc
    },
    { subtotal: 0, discount_total: 0, tax_total: 0, grand_total: 0 },
  )
}

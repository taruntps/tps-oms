import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const toTitleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
import { Sym } from '@/components/shared/Sym'
import { TopBar } from '@/components/layout/TopBar'
import { useClients } from '@/hooks/useClients'
import { ClientForm } from './ClientForm'

export default function ClientsPage() {
  const navigate = useNavigate()
  const { data: clients = [], isLoading } = useClients()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = clients.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_person.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_phone.includes(search) ||
    (c.gstin ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <TopBar title="Clients" subtitle={`${clients.length} total clients`} />

      <div className="p-6 animate-fade-up">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients, phone, GSTIN…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>
          {/* Any logged-in staff can submit a new client; editing is gated by the Edit-Clients right. */}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Sym name="add" size={16} />
            Add Client
          </button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-44 bg-white rounded-xl border border-border animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="apartment" size={34} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No clients match your search.' : 'No clients yet. Add your first client.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {filtered.map(client => (
              <div
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="bg-white rounded-xl border border-border p-3 cursor-pointer hover:border-brand-600/30 hover:shadow-md transition-all group flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
                  <span className="text-brand-600 font-display font-bold text-xs">
                    {client.company_name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-950 text-[13px] leading-tight truncate">
                    {client.company_name}
                    {!client.is_active && (
                      <span className="ml-1 align-middle text-[9px] text-red-600 bg-red-50 border border-red-100 px-1 py-0.5 rounded">Inactive</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {toTitleCase(client.contact_person)}{client.contact_phone ? ` · ${client.contact_phone}` : ''}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 truncate flex items-center gap-1">
                    <Sym name="location_on" size={10} className="shrink-0" />
                    {[client.city, client.state].filter(Boolean).join(', ') || '—'}
                  </p>
                </div>
                <Sym name="chevron_right" size={14} className="text-muted-foreground/40 group-hover:text-brand-600 transition-colors shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && <ClientForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

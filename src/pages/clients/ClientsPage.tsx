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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(client => (
              <div
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="bg-white rounded-xl border border-border p-4 cursor-pointer hover:border-brand-600/30 hover:shadow-md transition-all group flex flex-col gap-3"
              >
                {/* Header: avatar + name */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-600/10 flex items-center justify-center shrink-0">
                    <span className="text-brand-600 font-display font-bold text-sm">
                      {client.company_name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand-950 text-sm leading-tight truncate">{client.company_name}</p>
                    {client.trade_name && (
                      <p className="text-[11px] text-muted-foreground truncate">{client.trade_name}</p>
                    )}
                    {!client.is_active && (
                      <span className="inline-block text-[10px] text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded mt-0.5">Inactive</span>
                    )}
                  </div>
                </div>

                {/* Contact person */}
                <div className="text-xs text-muted-foreground truncate">
                  <Sym name="person" size={11} className="inline mr-1 -mt-px" />
                  {toTitleCase(client.contact_person)}
                </div>

                {/* Phone + Email */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sym name="call" size={11} className="shrink-0" />
                    <span className="truncate">{client.contact_phone}</span>
                  </div>
                  {client.contact_email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Sym name="mail" size={11} className="shrink-0" />
                      <span className="truncate">{client.contact_email}</span>
                    </div>
                  )}
                </div>

                {/* City/footer */}
                <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1 border-t border-border pt-2 mt-auto">
                  <Sym name="location_on" size={11} />
                  <span className="truncate">{client.city ?? client.state ?? '—'}</span>
                  <Sym name="chevron_right" size={13} className="ml-auto text-muted-foreground/40 group-hover:text-brand-600 transition-colors shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && <ClientForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

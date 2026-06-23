import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Building2, Phone, Mail, ChevronRight } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
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
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients, phone, GSTIN…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>
          <RoleGuard roles={['super_admin', 'director', 'manager']}>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Plus size={14} />
              Add Client
            </button>
          </RoleGuard>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-white rounded-xl border border-border animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Building2 size={32} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No clients match your search.' : 'No clients yet. Add your first client.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(client => (
              <div
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="bg-white rounded-xl border border-border px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-brand-600/30 hover:shadow-sm transition-all group"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-brand-600/10 flex items-center justify-center shrink-0">
                  <span className="text-brand-600 font-display font-bold text-sm">
                    {client.company_name.slice(0, 2).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-brand-950 text-sm truncate">{client.company_name}</p>
                    {client.trade_name && (
                      <span className="text-[10px] text-muted-foreground bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded">
                        {client.trade_name}
                      </span>
                    )}
                    {!client.is_active && (
                      <span className="text-[10px] text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate capitalize">{client.contact_person} · {client.city ?? client.state}</p>
                </div>

                {/* Contact */}
                <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone size={10} />
                    {client.contact_phone}
                  </span>
                  {client.contact_email && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail size={10} />
                      {client.contact_email}
                    </span>
                  )}
                </div>

                <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-brand-600 transition-colors shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && <ClientForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

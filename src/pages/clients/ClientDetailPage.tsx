import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Phone, Mail, MapPin, Hash, FileText, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useClient } from '@/hooks/useClients'
import { useLicenses } from '@/hooks/useLicenses'
import { ClientForm } from './ClientForm'
import { LicenseForm } from './LicenseForm'
import { CredentialReveal } from './CredentialReveal'
import { formatDate, getExpiryStatus, daysUntil, cn } from '@/lib/utils'

const EXPIRY_CONFIG = {
  safe:   { label: 'Valid',   cls: 'bg-green-50 text-green-700 border-green-200',  icon: CheckCircle2 },
  warn:   { label: 'Expiring Soon', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-700 border-red-200',    icon: AlertTriangle },
  none:   { label: 'No Expiry', cls: 'bg-gray-50 text-gray-500 border-gray-200', icon: Clock },
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: client, isLoading } = useClient(id!)
  const { data: licenses = [] } = useLicenses(id!)
  const [editClient, setEditClient] = useState(false)
  const [addLicense, setAddLicense] = useState(false)
  const [editLicense, setEditLicense] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div>
        <TopBar title="Client" />
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-32 bg-white rounded-xl border border-border" />
          <div className="h-48 bg-white rounded-xl border border-border" />
        </div>
      </div>
    )
  }

  if (!client) return null

  return (
    <div>
      <TopBar title={client.company_name} subtitle="Client details & licences" />
      <div className="p-6 animate-fade-up space-y-5">

        {/* Back + actions */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-950 transition-colors">
            <ArrowLeft size={14} />
            Back to Clients
          </button>
          <RoleGuard roles={['super_admin','director','manager']}>
            <button onClick={() => setEditClient(true)} className="flex items-center gap-2 text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC]">
              <Pencil size={12} />
              Edit
            </button>
          </RoleGuard>
        </div>

        {/* Client card */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-brand-600/10 flex items-center justify-center shrink-0">
              <span className="text-brand-600 font-display font-bold text-xl">
                {client.company_name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-display font-bold text-brand-950">{client.company_name}</h2>
                {client.trade_name && <span className="text-xs text-muted-foreground bg-[#F8FAFC] border border-border px-2 py-0.5 rounded">{client.trade_name}</span>}
                {!client.is_active && <span className="text-xs text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded">Inactive</span>}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{client.contact_person}</p>
              {client.contact_email && (
                <a href={`mailto:${client.contact_email}`}
                  className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 mt-1 font-medium">
                  <Mail size={11} />{client.contact_email}
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
            <Detail icon={Phone} label="Phone" value={client.contact_phone} />
            <Detail icon={Mail} label="Email" value={client.contact_email} />
            <Detail icon={MapPin} label="Location" value={[client.city, client.state].filter(Boolean).join(', ')} />
            <Detail icon={Hash} label="GSTIN" value={client.gstin} />
          </div>

          {client.notes && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Licences */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-brand-950">FSSAI Licences</h3>
            <RoleGuard roles={['super_admin','director','manager']}>
              <button
                onClick={() => setAddLicense(true)}
                className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                <Plus size={13} />
                Add Licence
              </button>
            </RoleGuard>
          </div>

          {licenses.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
              <FileText size={28} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No licences added yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {licenses.map(lic => {
                const expStatus = getExpiryStatus(lic.expiry_date)
                const cfg = EXPIRY_CONFIG[expStatus]
                const days = daysUntil(lic.expiry_date)
                const Icon = cfg.icon

                return (
                  <div key={lic.id} className="bg-white rounded-xl border border-border p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-brand-950">{lic.license_type}</span>
                          {lic.license_number && (
                            <span className="font-mono text-xs text-muted-foreground bg-[#F8FAFC] border border-border px-2 py-0.5 rounded">
                              {lic.license_number}
                            </span>
                          )}
                          <span className={cn('flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border font-medium', cfg.cls)}>
                            <Icon size={10} />
                            {cfg.label}
                            {days !== null && expStatus !== 'none' && ` · ${days > 0 ? `${days}d left` : `${Math.abs(days)}d ago`}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                          <Detail icon={FileText} label="Category" value={lic.category} />
                          <Detail icon={MapPin} label="Authority" value={lic.authority_office} />
                          <Detail icon={Clock} label="Issue Date" value={formatDate(lic.issue_date)} />
                          <Detail icon={AlertTriangle} label="Expiry" value={formatDate(lic.expiry_date)} />
                        </div>

                        {/* Credential section */}
                        <div className="mt-4 pt-4 border-t border-border">
                          <RoleGuard roles={['super_admin','director','manager','executive']}>
                            <CredentialReveal licenseId={lic.id} username={lic.credential_username} />
                          </RoleGuard>
                          <RoleGuard roles={['accounts','hr','auditor']}>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <span>🔒</span> Credentials restricted — manager access only
                            </p>
                          </RoleGuard>
                        </div>
                      </div>

                      <RoleGuard roles={['super_admin','director','manager']}>
                        <button
                          onClick={() => setEditLicense(lic.id)}
                          className="text-muted-foreground hover:text-brand-600 shrink-0"
                        >
                          <Pencil size={13} />
                        </button>
                      </RoleGuard>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {editClient && <ClientForm client={client} onClose={() => setEditClient(false)} />}
      {addLicense && <LicenseForm clientId={id!} onClose={() => setAddLicense(false)} />}
      {editLicense && (
        <LicenseForm
          clientId={id!}
          license={licenses.find(l => l.id === editLicense)}
          onClose={() => setEditLicense(null)}
        />
      )}
    </div>
  )
}

function Detail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs font-medium text-brand-950 flex items-center gap-1">
        <Icon size={10} className="text-muted-foreground shrink-0" />
        {value}
      </p>
    </div>
  )
}

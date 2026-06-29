import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Sym } from '@/components/shared/Sym'

const toTitleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
import { TopBar } from '@/components/layout/TopBar'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useClient, useCanEditClient } from '@/hooks/useClients'
import { useReferrals, useDeleteClient } from '@/hooks/useReferrals'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { useLicenses } from '@/hooks/useLicenses'
import { ClientForm } from './ClientForm'
import { LicenseForm } from './LicenseForm'
import { CredentialReveal } from './CredentialReveal'
import { DriveTab } from '@/components/shared/DriveTab'
import { formatDate, getExpiryStatus, daysUntil, cn } from '@/lib/utils'

const EXPIRY_CONFIG = {
  safe:   { label: 'Valid',   cls: 'bg-green-50 text-green-700 border-green-200',  icon: 'check_circle' },
  warn:   { label: 'Expiring Soon', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'warning' },
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-700 border-red-200',    icon: 'warning' },
  none:   { label: 'No Expiry', cls: 'bg-gray-50 text-gray-500 border-gray-200', icon: 'schedule' },
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: client, isLoading } = useClient(id!)
  const { data: licenses = [] } = useLicenses(id!)
  const { profile } = useAuth()
  const { data: referrals = [] } = useReferrals()
  const del = useDeleteClient()
  const canEdit = useCanEditClient()
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'director'
  const [editClient, setEditClient] = useState(false)
  const [addLicense, setAddLicense] = useState(false)
  const [editLicense, setEditLicense] = useState<string | null>(null)

  const referralName = referrals.find(r => r.id === (client as any)?.referral_id)?.name

  const handleDelete = async () => {
    if (!confirm(`Permanently delete "${client?.company_name}"? Any FSSAI licences and uploaded documents will be removed too. This is blocked if the client has any projects — delete or cancel those first.`)) return
    try {
      await del.mutateAsync(id!)
      toast.success('Client deleted')
      navigate('/clients')
    } catch (e: any) {
      toast.error('Could not delete', e.message)
    }
  }

  if (isLoading) {
    return (
      <div>
        <TopBar title="Client" />
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-32 glass-panel rounded-xl" />
          <div className="h-48 glass-panel rounded-xl" />
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
          <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors">
            <Sym name="arrow_back" size={14} />
            Back to Clients
          </button>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={handleDelete} disabled={del.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-400/40 text-red-200 rounded-lg hover:bg-red-500/10 disabled:opacity-50">
                <Sym name="delete" size={12} />
                Delete
              </button>
            )}
            {canEdit ? (
              <button onClick={() => setEditClient(true)} className="flex items-center gap-2 text-sm px-3 py-1.5 border border-white/20 text-white rounded-lg hover:bg-white/10">
                <Sym name="edit" size={12} />
                Edit
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-white px-3 py-1.5 border border-white/20 rounded-lg">
                <Sym name="lock" size={11} />
                Locked
              </span>
            )}
          </div>
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
                {(client as any).client_code && (
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded border bg-brand-50 border-brand-200 text-brand-700">
                    <Sym name="tag" size={10} />
                    {(client as any).client_code}
                  </span>
                )}
                {client.trade_name && <span className="text-xs text-muted-foreground bg-[#F8FAFC] border border-border px-2 py-0.5 rounded">{client.trade_name}</span>}
                {!client.is_active && <span className="text-xs text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded">Inactive</span>}
                {(client as any).gstin_is_placeholder && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700">
                    <Sym name="warning" size={10} />
                    No GSTIN
                  </span>
                )}
                {!canEdit && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Sym name="lock" size={9} />
                    Locked
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{toTitleCase(client.contact_person)}</p>
              {client.contact_email && (
                <a href={`mailto:${client.contact_email}`}
                  className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 mt-1 font-medium">
                  <Sym name="mail" size={11} />{client.contact_email}
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
            <Detail icon="call" label="Phone" value={client.contact_phone} />
            <Detail icon="mail" label="Email" value={client.contact_email} />
            {referralName && <Detail icon="handshake" label="Referral" value={referralName} />}
            <Detail icon="location_on" label="Location" value={[client.city, client.state].filter(Boolean).join(', ')} />
            {/* GSTIN — show amber badge if placeholder */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">GSTIN</p>
              <p className="text-xs font-medium text-brand-950 flex items-center gap-1.5">
                <Sym name="tag" size={10} className="text-muted-foreground shrink-0" />
                {(client as any).gstin_is_placeholder ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[10px] font-semibold">
                    <Sym name="warning" size={9} />
                    No GSTIN
                  </span>
                ) : (
                  client.gstin ?? '—'
                )}
              </p>
            </div>
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
            <h3 className="font-display font-semibold text-white">FSSAI Licences</h3>
            <RoleGuard roles={['super_admin','director','manager','executive','accounts','hr']}>
              <button
                onClick={() => setAddLicense(true)}
                className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white font-medium"
              >
                <Sym name="add" size={13} />
                Add Licence
              </button>
            </RoleGuard>
          </div>

          {licenses.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
              <Sym name="description" size={28} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No licences added yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {licenses.map(lic => {
                const expStatus = getExpiryStatus(lic.expiry_date)
                const cfg = EXPIRY_CONFIG[expStatus]
                const days = daysUntil(lic.expiry_date)

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
                            <Sym name={cfg.icon} size={10} />
                            {cfg.label}
                            {days !== null && expStatus !== 'none' && ` · ${days > 0 ? `${days}d left` : `${Math.abs(days)}d ago`}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                          <Detail icon="description" label="Category" value={lic.category} />
                          <Detail icon="location_on" label="Authority" value={lic.authority_office} />
                          <Detail icon="schedule" label="Issue Date" value={formatDate(lic.issue_date)} />
                          <Detail icon="warning" label="Expiry" value={formatDate(lic.expiry_date)} />
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

                      <RoleGuard roles={['super_admin','director','manager','executive','accounts','hr']}>
                        <button
                          onClick={() => setEditLicense(lic.id)}
                          className="text-muted-foreground hover:text-brand-600 shrink-0"
                        >
                          <Sym name="edit" size={13} />
                        </button>
                      </RoleGuard>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Client documents now live entirely in Google Drive (below). */}

        {/* Google Drive */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-[#F8FAFC]">
            <Sym name="folder" size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-brand-950">Google Drive</h3>
          </div>
          <div className="p-4">
            <DriveTab
              folderId={(client as any).drive_folder_id}
              entityId={id!}
              entityTable="clients"
              entityName={`${client.company_name}${(client as any).client_code ? ` - ${(client as any).client_code}` : ''}`}
            />
          </div>
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

function Detail({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs font-medium text-brand-950 flex items-center gap-1">
        <Sym name={icon} size={10} className="text-muted-foreground shrink-0" />
        {value}
      </p>
    </div>
  )
}

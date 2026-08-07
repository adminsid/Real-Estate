import { useState, useEffect } from 'react'
import { Settings, Palette, User2, Shield, Download, Trash2, CheckCircle2, LayoutDashboard, Compass } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import type { OperationalMode } from '@/context/WorkspaceContext'

type Tab = 'profile' | 'workflow' | 'branding' | 'privacy' | 'data'

const WORKFLOW_MODES: Array<{ id: OperationalMode; title: string; desc: string; icon: string }> = [
  { id: 'prospecting', title: 'Prospecting Mode', desc: 'Focus on new lead intake, call lists, and overdue follow-up queues.', icon: '📞' },
  { id: 'listing', title: 'Listing Agent Mode', desc: 'Focus on seller client updates, active listings, and marketing assets.', icon: '🏠' },
  { id: 'buyer', title: 'Buyer Agent Mode', desc: 'Focus on MLS searches, saved buyer criteria, showings, and offer drafting.', icon: '🔑' },
  { id: 'transaction', title: 'Transaction Mode', desc: 'Focus on deal pipeline milestones, contract tasks, and attorney contacts.', icon: '📋' },
  { id: 'compliance', title: 'Compliance Focus', desc: 'Focus on audit logs, document signatures, and NY Article 12-A compliance.', icon: '⚖️' },
]

export function SettingsPage() {
  const { user, branding, updateBranding, updateProfile } = useAuth()
  const { operationalMode, setOperationalMode } = useWorkspace()
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [saved, setSaved] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(user?.mfa_enabled === 1)

  useEffect(() => {
    if (user) {
      setMfaEnabled(user.mfa_enabled === 1)
    }
  }, [user?.mfa_enabled])

  const toggleMFA = async (enabled: boolean) => {
    setMfaEnabled(enabled)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfa_enabled: enabled ? 1 : 0 })
      })
      if (res.ok) {
        alert(enabled ? 'Two-Factor Authentication has been enabled successfully!' : 'Two-Factor Authentication has been disabled.')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const isAdminOrBroker = user && (user.role === 'admin' || user.role === 'broker')

  const [localBranding, setLocalBranding] = useState({ ...branding })

  const [profileName, setProfileName] = useState(user?.name || '')
  const [profileTitle, setProfileTitle] = useState(user?.title || '')
  const [profilePhone, setProfilePhone] = useState(user?.phone || '')
  const [profileLicenseNumber, setProfileLicenseNumber] = useState(user?.licenseNumber || '')

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '')
      setProfileTitle(user.title || '')
      setProfilePhone(user.phone || '')
      setProfileLicenseNumber(user.licenseNumber || '')
    }
  }, [user?.id, user?.name, user?.title, user?.phone, user?.licenseNumber])

  function saveBranding() {
    updateBranding(localBranding)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveProfile() {
    setProfileSaving(true)
    try {
      await updateProfile({
        name: profileName || undefined,
        title: profileTitle || undefined,
        phone: profilePhone || undefined,
        licenseNumber: profileLicenseNumber || undefined,
      })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save profile', e)
    } finally {
      setProfileSaving(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'profile', label: 'Profile', icon: User2 },
    { id: 'workflow', label: 'My Workflow', icon: Compass },
    ...(isAdminOrBroker ? [{ id: 'branding' as Tab, label: 'Branding', icon: Palette }] : []),
    { id: 'privacy', label: 'Privacy', icon: Shield },
    { id: 'data', label: 'Data & Export', icon: Download },
  ]

  return (
    <Layout title="Settings">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <Settings className="h-5 w-5 text-gray-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Workspace Settings</h2>
          <p className="text-sm text-gray-500">Manage your profile, workflow preferences, and workspace settings</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Tab nav ──────────────────────────────────────────────── */}
        <nav className="lg:w-52 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-2 flex lg:flex-col gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full text-left ${
                  activeTab === tab.id
                    ? 'bg-brand-navy text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:block lg:block">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* ── Content ──────────────────────────────────────────────── */}
        <div className="flex-1">

          {/* ── Profile ──────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
                <h3 className="font-bold text-gray-800 mb-5">Profile Information</h3>
                {user ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="h-16 w-16 rounded-2xl bg-brand-navy flex items-center justify-center">
                        <span className="text-brand-gold font-bold text-2xl uppercase">
                          {user.name.slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-lg">{user.name}</p>
                        <p className="text-sm text-gray-500 capitalize">{user.role}</p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Full Name</label>
                        <input
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Email</label>
                        <input defaultValue={user.email} type="email" readOnly className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-gray-50 text-gray-500" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Role</label>
                        <input defaultValue={user.role} readOnly className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-gray-50 text-gray-500 capitalize" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Client-Facing License Title</label>
                        <input
                          value={profileTitle}
                          onChange={(e) => setProfileTitle(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                          placeholder="e.g. Licensed Real Estate Salesperson"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Phone</label>
                        <input
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                          placeholder="e.g. (347) 725-3142"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">License Number (NY)</label>
                        <input
                          value={profileLicenseNumber}
                          onChange={(e) => setProfileLicenseNumber(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                          placeholder="e.g. 10401234567"
                        />
                      </div>
                    </div>

                    <button
                      onClick={saveProfile}
                      disabled={profileSaving}
                      className="mt-2 px-5 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors flex items-center gap-2"
                    >
                      {profileSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved!</> : profileSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Please <a href="/login" className="text-brand-navy font-semibold hover:underline">sign in</a> to manage your profile.</p>
                )}
              </div>
            </div>
          )}

          {/* ── My Workflow Mode ──────────────────────────────────── */}
          {activeTab === 'workflow' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-1">
                  <Compass className="h-5 w-5 text-brand-navy" />
                  <h3 className="font-bold text-gray-800 text-base">My Workflow Mode</h3>
                </div>
                <p className="text-sm text-gray-500 mb-5">Choose your primary daily workflow to prioritize the right tools and dashboard cards. You can change this at any time.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {WORKFLOW_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setOperationalMode(m.id)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        operationalMode === m.id
                          ? 'border-brand-navy ring-2 ring-brand-navy/20 bg-brand-navy/5'
                          : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl">{m.icon}</span>
                        {operationalMode === m.id && (
                          <CheckCircle2 className="h-4 w-4 text-brand-navy" />
                        )}
                      </div>
                      <p className="font-bold text-sm text-gray-900">{m.title}</p>
                      <p className="text-xs text-gray-500 mt-1 leading-snug">{m.desc}</p>
                    </button>
                  ))}
                </div>

                {operationalMode && (
                  <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span>
                      <strong>{WORKFLOW_MODES.find(m => m.id === operationalMode)?.title}</strong> is your active workflow mode.
                    </span>
                  </div>
                )}
              </div>

              {/* Dashboard Layout — admin/broker only */}
              {isAdminOrBroker && (
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-1">
                    <LayoutDashboard className="h-5 w-5 text-brand-navy" />
                    <h3 className="font-bold text-gray-800 text-base">Dashboard Layout</h3>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Customize which metrics and app tiles appear on the company dashboard. These settings apply to all users.</p>
                  <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 border border-gray-100">
                    Use the <strong>Customize Dashboard</strong> button on the main dashboard to edit layout, add custom app tiles, manage quick links, and toggle AI panel visibility.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Workspace Branding — Admin/Broker only ────────────── */}
          {activeTab === 'branding' && isAdminOrBroker && (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
              <h3 className="font-bold text-gray-800 mb-1">Workspace Branding</h3>
              <p className="text-sm text-gray-500 mb-5">Set the company's identity across the entire workspace. Changes apply to all users.</p>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Company Name</label>
                  <input
                    value={localBranding.companyName}
                    onChange={(e) => setLocalBranding((p) => ({ ...p, companyName: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    placeholder="My Realty Group"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Tagline</label>
                  <input
                    value={localBranding.tagline ?? ''}
                    onChange={(e) => setLocalBranding((p) => ({ ...p, tagline: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    placeholder="Your Real Estate Command Center"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Website URL</label>
                  <input
                    value={localBranding.websiteUrl ?? ''}
                    onChange={(e) => setLocalBranding((p) => ({ ...p, websiteUrl: e.target.value }))}
                    type="url"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    placeholder="https://example.com"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Company Address</label>
                  <input
                    value={localBranding.companyAddress ?? ''}
                    onChange={(e) => setLocalBranding((p) => ({ ...p, companyAddress: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    placeholder="100 Wall Street, New York, NY 10005"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Company Phone</label>
                    <input
                      value={localBranding.companyTelephone ?? ''}
                      onChange={(e) => setLocalBranding((p) => ({ ...p, companyTelephone: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      placeholder="(212) 555-0100"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Company Fax</label>
                    <input
                      value={localBranding.companyFax ?? ''}
                      onChange={(e) => setLocalBranding((p) => ({ ...p, companyFax: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      placeholder="(212) 555-0199"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={localBranding.primaryColor}
                        onChange={(e) => setLocalBranding((p) => ({ ...p, primaryColor: e.target.value }))}
                        className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0.5"
                      />
                      <input
                        value={localBranding.primaryColor}
                        onChange={(e) => setLocalBranding((p) => ({ ...p, primaryColor: e.target.value }))}
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={localBranding.accentColor}
                        onChange={(e) => setLocalBranding((p) => ({ ...p, accentColor: e.target.value }))}
                        className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0.5"
                      />
                      <input
                        value={localBranding.accentColor}
                        onChange={(e) => setLocalBranding((p) => ({ ...p, accentColor: e.target.value }))}
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Logo URL</label>
                  <input
                    value={localBranding.logoUrl ?? ''}
                    onChange={(e) => setLocalBranding((p) => ({ ...p, logoUrl: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    placeholder="https://cdn.example.com/logo.png"
                  />
                </div>

                {/* Preview */}
                <div
                  className="rounded-xl p-4 text-white text-sm"
                  style={{ backgroundColor: localBranding.primaryColor }}
                >
                  <div className="flex items-center gap-3">
                    {localBranding.logoUrl ? (
                      <img src={localBranding.logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: localBranding.accentColor }}>
                        <span className="font-bold text-xs" style={{ color: localBranding.primaryColor }}>
                          {localBranding.companyName?.slice(0, 2).toUpperCase() || 'RE'}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-bold">{localBranding.companyName || 'Company Name'}</p>
                      <p className="text-xs opacity-60">{localBranding.tagline || 'Tagline'}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={saveBranding}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors"
                >
                  {saved ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      Saved!
                    </>
                  ) : 'Save Branding'}
                </button>
              </div>
            </div>
          )}

          {/* ── Privacy ──────────────────────────────────────────── */}
          {activeTab === 'privacy' && (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
              <h3 className="font-bold text-gray-800 mb-2">Privacy & Security</h3>
              <p className="text-sm text-gray-500 mb-5">Control your data and privacy settings.</p>

              <div className="space-y-4">
                {[
                  { label: 'Profile Visibility', description: 'Allow other workspace members to see your profile', checked: true, onChange: () => {} },
                  { label: 'Analytics Tracking', description: 'Help improve the platform by sharing anonymous usage data', checked: false, onChange: () => {} },
                  { label: 'Email Notifications', description: 'Receive important workspace updates via email', checked: true, onChange: () => {} },
                  { label: 'Two-Factor Authentication', description: 'Require a second verification step on login (MFA)', checked: mfaEnabled, onChange: (e: any) => toggleMFA(e.target.checked) },
                ].map((setting) => (
                  <div key={setting.label} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{setting.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        checked={setting.checked}
                        onChange={setting.onChange}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-gray-200 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-gold peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-5 peer-checked:bg-brand-navy after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Data & Export ─────────────────────────────────────── */}
          {activeTab === 'data' && (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
              <h3 className="font-bold text-gray-800 mb-2">Data Management & Export</h3>
              <p className="text-sm text-gray-500 mb-5">Export your workspace data or manage storage.</p>

              <div className="space-y-3">
                {[
                  { label: 'Export CRM Contacts', description: 'Download all contacts as CSV', icon: Download },
                  { label: 'Export MLS Listings', description: 'Download property listings as CSV', icon: Download },
                  { label: 'Export Transactions', description: 'Download transaction history as CSV', icon: Download },
                  { label: 'Full Workspace Export', description: 'Download all workspace data as ZIP', icon: Download },
                ].map((item) => (
                  <button
                    key={item.label}
                    className="flex items-center justify-between w-full bg-gray-50 hover:bg-gray-100 transition-colors rounded-xl p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{item.label}</p>
                        <p className="text-xs text-gray-400">{item.description}</p>
                      </div>
                    </div>
                    <span className="text-xs text-brand-navy font-semibold">Export</span>
                  </button>
                ))}
              </div>

              <div className="mt-6 bg-red-50 rounded-xl p-4 border border-red-100">
                <h4 className="font-semibold text-red-700 text-sm mb-1 flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Danger Zone
                </h4>
                <p className="text-xs text-red-500 mb-3">These actions are irreversible. Please proceed with caution.</p>
                <button className="text-sm font-medium text-red-600 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-100 transition-colors">
                  Delete Account & All Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

import { UserAvatar } from '@/components/common/UserAvatar'
import { NotificationPreferences } from '@/components/feedback/NotificationPreferences'
import { PilotFeedback } from '@/components/feedback/PilotFeedback'
import { useSearchParams } from 'react-router-dom'
import { OfflineNotesPage } from '@/pages/offline/OfflineNotes'
import { useState, useEffect, useCallback } from 'react'
import { Settings, Palette, User2, Shield, Download, Trash2, CheckCircle2, Globe, Key, Loader2, Navigation, Plus, Pencil, X, GripVertical, Eye, RotateCcw, WifiOff, Clock as ClockIcon } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { useAuth } from '@/context/AuthContext'
import { DEFAULT_NAV_ITEMS, PROTECTED_NAV_IDS, type NavOverrideItem } from '@/utils/constants/navigation'
import { saveHeaderPrefs, TIMEZONE_OPTIONS } from '@/components/layout/HeaderStatusWidget'

type Tab = 'profile' | 'domains' | 'branding' | 'privacy' | 'data' | 'navigation' | 'preferences' | 'offline' | 'pilot'

export function SettingsPage() {
  const { user, branding, updateBranding, updateProfile, refreshUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab = (['profile','domains','branding','privacy','data','navigation','preferences','offline','pilot'].includes(requestedTab || '') ? requestedTab : 'profile') as Tab
  const setActiveTab = (tab: Tab) => setSearchParams({ tab })
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMessage, setPhotoMessage] = useState('')
  async function uploadPhoto(file?: File) {
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setPhotoMessage('Choose a JPG, PNG or WebP image up to 5 MB.'); return
    }
    setPhotoBusy(true); setPhotoMessage('')
    try {
      const form = new FormData(); form.append('file',file)
      const response = await fetch('/api/auth/avatar',{method:'POST',body:form})
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to upload photo')
      await refreshUser()
      setPhotoMessage('Profile photo updated.')
    } catch(error) { setPhotoMessage(error instanceof Error ? error.message : 'Unable to upload photo. Please try again.') }
    finally { setPhotoBusy(false) }
  }
  const [saved, setSaved] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(user?.mfa_enabled === 1)
  // ── Command Center Preferences ────────────────────────────────────────────
  const [ccPrefs, setCcPrefs] = useState<{ enabled: boolean; timezone: string; unit: 'F' | 'C' }>(() => {
    try {
      const raw = localStorage.getItem('header_status_prefs')
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { enabled: true, timezone: 'America/New_York', unit: 'F' }
  })
  const [ccSaved, setCcSaved] = useState(false)
  const saveCcPrefs = () => {
    saveHeaderPrefs(ccPrefs)
    setCcSaved(true)
    setTimeout(() => setCcSaved(false), 2000)
  }
  const [workspaceDomain, setWorkspaceDomain] = useState(branding.customWorkspaceDomain || '')
  const [leadDomain, setLeadDomain] = useState(branding.leadAppDomain || '')
  const [domainSaved, setDomainSaved] = useState(false)
  const [domainSaving, setDomainSaving] = useState(false)

  useEffect(() => {
    if (branding) {
      setWorkspaceDomain(branding.customWorkspaceDomain || '')
      setLeadDomain(branding.leadAppDomain || '')
    }
  }, [branding.customWorkspaceDomain, branding.leadAppDomain])

  // Change-password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')

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
        credentials: 'include',
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

  useEffect(() => {
    if (branding) {
      setLocalBranding({ ...branding })
    }
  }, [branding])

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

  async function saveCustomDomains() {
    setDomainSaving(true)
    try {
      await updateBranding({
        customWorkspaceDomain: workspaceDomain || undefined,
        leadAppDomain: leadDomain || undefined,
      })
      setDomainSaved(true)
      setTimeout(() => setDomainSaved(false), 2000)
    } catch (e) {
      console.error(e)
      alert('Failed to save custom domains')
    } finally {
      setDomainSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return }
    setPwSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to change password')
      setPwSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPwSaved(false), 3000)
    } catch (e: any) {
      setPwError(e.message)
    } finally {
      setPwSaving(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'profile', label: 'Profile', icon: User2 },
    ...(isAdminOrBroker ? [{ id: 'domains' as Tab, label: 'Custom Domains', icon: Globe }] : []),
    ...(isAdminOrBroker ? [{ id: 'branding' as Tab, label: 'Branding', icon: Palette }] : []),
    { id: 'privacy', label: 'Privacy & alerts', icon: Shield },
    { id: 'pilot', label: 'Feedback & pilot', icon: CheckCircle2 },
    { id: 'data', label: 'Data & Export', icon: Download },
    ...(user?.role === 'admin' ? [{ id: 'navigation' as Tab, label: 'Navigation', icon: Navigation }] : []),
    { id: 'preferences' as Tab, label: 'Preferences', icon: ClockIcon },
    { id: 'offline' as Tab, label: 'Offline access', icon: WifiOff },
  ]

  return (
    <Layout title="Settings">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <Settings className="h-5 w-5 text-gray-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Workspace Settings</h2>
          <p className="text-sm text-gray-500">Manage your profile and workspace settings</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Tab nav ──────────────────────────────────────────────── */}
        <nav className="lg:w-52 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-2 flex overflow-x-auto lg:flex-col gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                aria-label={tab.label}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0 lg:w-full text-left ${
                  activeTab === tab.id
                    ? 'bg-brand-navy text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* ── Content ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {activeTab === 'offline' && <div className="bg-white rounded-2xl shadow-card border border-gray-100"><OfflineNotesPage embedded /></div>}

          {/* ── Profile ──────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <>
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
                <h3 className="font-bold text-gray-800 mb-5">Profile Information</h3>
                {user ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 mb-6">
                      <UserAvatar name={user.name} src={user.avatarUrl} className="h-16 w-16 text-2xl" shape="square" />
                      <div>
                        <p className="font-bold text-gray-800 text-lg">{user.name}</p>
                        <p className="text-sm text-gray-500 capitalize">{user.role}</p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Change profile photo
                        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={e=>{void uploadPhoto(e.target.files?.[0]); e.target.value=''}} className="block mt-2 max-w-full text-sm text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-navy file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-50" />
                      </label>
                      <p className="text-xs text-gray-500">JPG, PNG or WebP, up to 5 MB. Used in the workspace and on your shared listing pages.</p>
                      <p role="status" className="text-sm">{photoBusy?'Uploading photo…':photoMessage}</p>
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

            {/* Change Password */}
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-5">
                <Key className="h-4 w-4 text-gray-600" />
                <h3 className="font-bold text-gray-800">Change Password</h3>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Current Password</label>
                  <input
                    required type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">New Password</label>
                  <input
                    required type="password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password (min 8 characters)"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Confirm New Password</label>
                  <input
                    required type="password" minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  />
                </div>
                {pwError && <p className="text-sm text-red-600 font-medium">{pwError}</p>}
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="px-5 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {pwSaved ? <><CheckCircle2 className="h-4 w-4" /> Password changed!</> : pwSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Change Password'}
                </button>
              </form>
            </div>
            </>
          )}

          {/* ── Custom Domains — Admin/Broker only ──────────────────── */}
          {activeTab === 'domains' && isAdminOrBroker && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-1">
                  <Globe className="h-5 w-5 text-brand-navy" />
                  <h3 className="font-bold text-gray-800 text-base">Custom Domains & Branding Routes</h3>
                </div>
                <p className="text-sm text-gray-500 mb-6">Manage tenant-level custom workspace domains and lead capture links for Prime America Real Estate.</p>

                <div className="space-y-5">
                  {/* Primary Workspace Domain */}
                  <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-bold text-gray-900 block">Workspace Application Domain</label>
                        <p className="text-xs text-gray-500 mt-0.5">Primary workspace domain for agent sign-in and command center access</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> SSL Active
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={workspaceDomain}
                        onChange={(e) => setWorkspaceDomain(e.target.value)}
                        className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                        placeholder="workspace.primeamericany.com"
                      />
                    </div>
                  </div>

                  {/* Lead Link Custom Domain */}
                  <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-bold text-gray-900 block">Lead Capture & Search Domain</label>
                        <p className="text-xs text-gray-500 mt-0.5">Custom shortlink domain for client property search and lead intake</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> DNS Verified
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={leadDomain}
                        onChange={(e) => setLeadDomain(e.target.value)}
                        className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                        placeholder="searchtolive.com"
                      />
                    </div>
                  </div>

                  {/* Legacy Reference Note */}
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">
                    📌 <strong>Legacy Application Context:</strong> Original app reference <code>app.primeamericarealestate.com</code> is preserved for SSO compatibility and client legacy redirects.
                  </div>

                  <button
                    onClick={saveCustomDomains}
                    disabled={domainSaving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors disabled:opacity-50"
                  >
                    {domainSaved ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        Saved Custom Domains!
                      </>
                    ) : domainSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving Domain Settings…
                      </>
                    ) : 'Save Domain Settings'}
                  </button>
                </div>
              </div>
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

          {activeTab === 'pilot' && <PilotFeedback />}

          {/* ── Privacy ──────────────────────────────────────────── */}
          {activeTab === 'privacy' && (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
              <h3 className="font-bold text-gray-800 mb-2">Privacy & Security</h3>
              <p className="text-sm text-gray-500 mb-5">Workspace profile access is managed by your company. Sharing a listing makes your agent contact profile visible on that public page.</p>
              <NotificationPreferences />

              <div className="space-y-4">
                {[
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
          {/* ── Navigation Management (admin only) ─────────────────── */}
          {activeTab === 'navigation' && user?.role === 'admin' && (
            <NavManagementPanel branding={branding} updateBranding={updateBranding} />
          )}

          {/* ── Preferences: Command Center ─────────────────────────── */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                    <ClockIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Command Center</h3>
                    <p className="text-xs text-gray-500">Configure the live status bar shown in the header (time, date, weather)</p>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* Show / Hide toggle */}
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Show Status Bar</p>
                      <p className="text-xs text-gray-500 mt-0.5">Display live time, date, and weather in the top header</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCcPrefs(p => ({ ...p, enabled: !p.enabled }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        ccPrefs.enabled ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                      role="switch"
                      aria-checked={ccPrefs.enabled}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        ccPrefs.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {/* Timezone */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-gray-700">Timezone</label>
                    <select
                      value={ccPrefs.timezone}
                      onChange={e => setCcPrefs(p => ({ ...p, timezone: e.target.value }))}
                      className="w-full max-w-xs rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
                    >
                      {TIMEZONE_OPTIONS.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Temperature Unit */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-gray-700">Temperature Unit</label>
                    <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                      {(['F', 'C'] as const).map(u => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setCcPrefs(p => ({ ...p, unit: u }))}
                          className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                            ccPrefs.unit === u ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          &deg;{u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Save */}
                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={saveCcPrefs}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    {ccSaved ? <CheckCircle2 className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
                    {ccSaved ? 'Saved!' : 'Save Preferences'}
                  </button>
                  <p className="text-xs text-gray-400">Changes apply immediately after saving</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

// ─── Navigation Management Panel ────────────────────────────────────────────

const ROLE_OPTIONS: NavOverrideItem['roleVisibility'][] = [
  'all', 'admin', 'broker', 'admin_broker', 'salesperson', 'assistant'
]

const SECTION_OPTIONS = [
  'core', 'operations', 'transactions', 'inventory', 'marketing', 'learning', 'hr', 'settings', 'custom'
]

const BLANK_ITEM: NavOverrideItem = {
  id: '',
  label: '',
  path: '',
  icon: 'Link',
  parentSection: 'custom',
  sortOrder: 99,
  active: true,
  roleVisibility: 'all',
}

function NavManagementPanel({ branding, updateBranding }: { branding: any; updateBranding: (b: any) => Promise<void> }) {
  const [items, setItems] = useState<NavOverrideItem[]>(() => {
    try {
      const ds = branding.dashboardSettings ? JSON.parse(branding.dashboardSettings) : {}
      if (Array.isArray(ds.navOverrides) && ds.navOverrides.length > 0) {
        return ds.navOverrides
      }
      return DEFAULT_NAV_ITEMS
    } catch {
      return DEFAULT_NAV_ITEMS
    }
  })
  const [modal, setModal] = useState<{ item: NavOverrideItem; isNew: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const persistItems = useCallback(async (next: NavOverrideItem[]) => {
    setSaving(true)
    try {
      const ds = branding.dashboardSettings ? JSON.parse(branding.dashboardSettings) : {}
      await updateBranding({ dashboardSettings: JSON.stringify({ ...ds, navOverrides: next }) })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert('Failed to save navigation settings')
    } finally {
      setSaving(false)
    }
  }, [branding.dashboardSettings, updateBranding])

  const openNew = () => setModal({ item: { ...BLANK_ITEM, id: `custom-${Date.now()}` }, isNew: true })
  const openEdit = (item: NavOverrideItem) => setModal({ item: { ...item }, isNew: false })

  const handleResetDefaults = async () => {
    if (!confirm('Reset all navigation items to the standard default configuration from source code?')) return
    setItems(DEFAULT_NAV_ITEMS)
    await persistItems(DEFAULT_NAV_ITEMS)
  }

  const saveModal = async () => {
    if (!modal) return
    if (!modal.item.label.trim() || !modal.item.path.trim()) {
      alert('Label and path are required.')
      return
    }
    const next = modal.isNew
      ? [...items, modal.item]
      : items.map(i => i.id === modal.item.id ? modal.item : i)
    setItems(next)
    setModal(null)
    await persistItems(next)
  }

  const deleteItem = async (id: string) => {
    if (PROTECTED_NAV_IDS.has(id)) {
      alert('This is a core navigation route and cannot be deleted. You can deactivate it instead.')
      return
    }
    if (!confirm('Delete this navigation item?')) return
    const next = items.filter(i => i.id !== id)
    setItems(next)
    await persistItems(next)
  }

  const toggleActive = async (id: string) => {
    if (PROTECTED_NAV_IDS.has(id)) {
      alert('Core navigation items cannot be hidden this way. Edit them to change visibility.')
      return
    }
    const next = items.map(i => i.id === id ? { ...i, active: !i.active } : i)
    setItems(next)
    await persistItems(next)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-gray-800">Navigation Management</h3>
            <p className="text-sm text-gray-500 mt-0.5">Manage, customize, or reorder navigation items. Core routes are protected.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors"
              title="Reset navigation items to the default configuration from source code"
            >
              <RotateCcw className="h-3.5 w-3.5 text-gray-500" /> Reset to Defaults
            </button>
            <button
              onClick={openNew}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-navy text-white text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" /> Add Item
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center text-gray-400 border border-dashed rounded-xl">
            <Navigation className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No custom navigation items yet.</p>
            <p className="text-xs mt-1">Click «Add Item» to create your first custom nav entry.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...items].sort((a, b) => a.sortOrder - b.sortOrder).map(item => (
              <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                item.active ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/40 border-gray-100 opacity-60'
              }`}>
                <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.label}</p>
                  <p className="text-xs text-gray-400 truncate">{item.path} · {item.parentSection} · {item.roleVisibility}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(item.id)}
                    title={item.active ? 'Deactivate' : 'Activate'}
                    className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    title="Edit"
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    title={PROTECTED_NAV_IDS.has(item.id) ? 'Protected — cannot delete' : 'Delete'}
                    disabled={PROTECTED_NAV_IDS.has(item.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {saving && (
          <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
        {saved && !saving && (
          <p className="text-xs text-emerald-600 mt-3 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </p>
        )}
      </div>

      {/* ── Add / Edit Modal ───────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h4 className="font-bold text-gray-800">{modal.isNew ? 'Add Navigation Item' : 'Edit Navigation Item'}</h4>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {([
                { key: 'label', label: 'Label', type: 'text', placeholder: 'e.g. My Reports' },
                { key: 'path', label: 'Path', type: 'text', placeholder: '/my-reports or https://...' },
                { key: 'icon', label: 'Icon (Lucide name)', type: 'text', placeholder: 'e.g. BarChart3' },
                { key: 'sortOrder', label: 'Sort Order', type: 'number', placeholder: '99' },
              ] as const).map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    value={(modal.item as any)[field.key]}
                    onChange={e => setModal(m => m ? { ...m, item: { ...m.item, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value } } : m)}
                    placeholder={field.placeholder}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-navy"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Parent Section</label>
                <select
                  value={modal.item.parentSection}
                  onChange={e => setModal(m => m ? { ...m, item: { ...m.item, parentSection: e.target.value } } : m)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-navy"
                >
                  {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Role Visibility</label>
                <select
                  value={modal.item.roleVisibility}
                  onChange={e => setModal(m => m ? { ...m, item: { ...m.item, roleVisibility: e.target.value as NavOverrideItem['roleVisibility'] } } : m)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-navy"
                >
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="nav-active"
                  type="checkbox"
                  checked={modal.item.active}
                  onChange={e => setModal(m => m ? { ...m, item: { ...m.item, active: e.target.checked } } : m)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="nav-active" className="text-sm text-gray-700">Active (visible in navigation)</label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                onClick={saveModal}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

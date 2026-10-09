import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { listVaults, vaultKey, unlockVault, storeVault, removeVault, replayNote,
  type VaultContents, type VaultRecord, type Preparation } from '@/lib/offline-vault'

export function OfflineNotesPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  const [vaults, setVaults] = useState<VaultRecord[]>([])
  const [selected, setSelected] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [record, setRecord] = useState<VaultRecord | null>(null)
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [contents, setContents] = useState<VaultContents | null>(null)
  const [text, setText] = useState('')
  const [eventId,setEventId]=useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const epoch = useRef(0)
  const lock = () => { epoch.current += 1; setKey(null); setContents(null); setRecord(null); setText(''); setPassphrase('') }
  useEffect(() => { listVaults().then(setVaults).catch(() => setStatus('Device storage unavailable')) }, [])
  useEffect(() => {
    const handler = () => lock()
    window.addEventListener('workspace-logout', handler)
    const hidden = () => { if (document.hidden) lock() }
    document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('workspace-logout', handler); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  useEffect(() => { lock() }, [user?.id, user?.tenantId])
  async function action(fn: () => Promise<void>) {
    setBusy(true); setStatus('')
    try { await fn() } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to access local notes') }
    finally { setBusy(false) }
  }
  const renderEpoch = epoch.current
  async function persist(next: VaultContents) {
    if (renderEpoch !== epoch.current) return
    if (!record || !key) throw new Error('Unlock this device first')
    const generation = renderEpoch
    const saved = await storeVault(record, key, next)
    if (generation === epoch.current) { setRecord(saved); setContents(next) }
  }
  async function unlock() {
    const generation = epoch.current
    const existing = vaults.find(v => v.id === selected)
    if (!existing && (!user?.tenantId || passphrase.length < 12)) throw new Error('Sign in and choose a passphrase of at least 12 characters to enroll this device')
    const item = existing || { id: `${user!.tenantId}:${user!.id}`, revision: 0, salt: crypto.getRandomValues(new Uint8Array(16)), iv: new Uint8Array(12), ciphertext: new ArrayBuffer(0) }
    const unlockedKey = await vaultKey(passphrase, item.salt)
    const data = existing ? await unlockVault(item, unlockedKey) : { tenantId: user!.tenantId!, actorId: user!.id, notes: [] }
    if(data.preparation&&Date.now()-Date.parse(data.preparation.fetchedAt)>7*86400000)delete data.preparation
    const saved = await storeVault(item, unlockedKey, data)
    if (generation !== epoch.current) return
    setKey(unlockedKey); setRecord(saved); setContents(data); setPassphrase(''); setVaults(await listVaults())
  }
  async function synchronize() {
    if (!contents) return
    const notes = []
    for (const note of contents.notes) notes.push(await replayNote(note))
    await persist({ ...contents, notes })
  }
  const replayRef = useRef(synchronize)
  replayRef.current = synchronize
  useEffect(() => {
    if (!key) return
    const replay = () => { void action(() => replayRef.current()) }
    if (navigator.onLine) replay()
    window.addEventListener('online', replay)
    return () => window.removeEventListener('online', replay)
  }, [key])
  const Container = embedded ? 'section' : 'main'
  const Heading = embedded ? 'h2' : 'h1'
  return <Container className="max-w-3xl mx-auto p-6 space-y-4">
    {!embedded && <a href="/" className="underline">Workspace</a>}<Heading className="text-2xl font-bold">Offline access</Heading>
    <p>Private notes are encrypted on this device. Local saves are not server backups. Keep your passphrase; it cannot be recovered. Browser storage can be cleared or evicted.</p>
    <p>Available offline: saved notes and the contacts, tasks, and events explicitly prepared below. Signing, payments, and sending require a connection. Open this page online once before using it offline.</p>
    {!contents ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); void action(unlock) }}>
      <label className="block">Device account<select className="block border p-2 w-full" value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="">Enroll current account</option>{vaults.map(v => <option key={v.id} value={v.id}>{v.id}</option>)}
      </select></label>
      <label className="block">Local passphrase<input className="block border p-2 w-full" type="password" autoComplete="off" value={passphrase} onChange={e => setPassphrase(e.target.value)} /></label>
      <button disabled={busy} className="border rounded p-2">Unlock notes</button>
    </form> : <>
      <p>Account: {contents.tenantId} / {contents.actorId}</p>
      <button className="border p-2" onClick={lock}>Lock</button>
      <button disabled={busy} className="border p-2" onClick={()=>void action(async()=>{
        const response=await fetch('/api/offline-preparation',{signal:AbortSignal.timeout(15000)});const body=await response.json();
        if(!response.ok||!body.success)throw Error('Preparation unavailable; existing device data retained');
        const preparation:Preparation=body.data;
        if(preparation.tenantId!==contents.tenantId||preparation.actorId!==contents.actorId)throw Error('Sign in to this vault account before preparing data');
        await persist({...contents,preparation});setStatus('Prepared recent assigned contacts, tasks and events on this device');
      })}>Prepare my recent assigned records</button>
      {contents.preparation&&<details><summary>Available records · prepared {contents.preparation.fetchedAt}</summary>
        {Date.now()-Date.parse(contents.preparation.fetchedAt)>7*86400000?<p>Snapshots expired after seven days. Reconnect and prepare again.</p>:<>
          <h2 className="font-bold">Contacts</h2>{contents.preparation.contacts.map(c=><p key={c.id}>{c.first_name} {c.last_name} · {c.email} · {c.phone}</p>)}
          <h2 className="font-bold">Recent tasks</h2>{contents.preparation.tasks.map(t=><p key={t.id}>{t.title} · due {t.due_date||'not set'} · {t.status}</p>)}
          <h2 className="font-bold">Events ({contents.preparation.eventsState})</h2>{contents.preparation.events.map(e=><p key={e.id}>{e.title} · {e.address} · {e.start}</p>)}
        </>}
      </details>}
      {contents.preparation&&Date.now()-Date.parse(contents.preparation.fetchedAt)<=7*86400000&&<form className="border p-3 space-y-2" onSubmit={e=>{
        e.preventDefault();const form=new FormData(e.currentTarget);const event=contents.preparation?.events.find(event=>event.id===eventId);
        if(!event)return;
        const attendance={eventId:event.id,eventVersion:event.version,firstName:String(form.get('firstName')||''),lastName:String(form.get('lastName')||''),
          phone:String(form.get('phone')||''),email:String(form.get('email')||''),consentContact:form.get('contactConsent')==='on',consentMarketing:form.get('marketingConsent')==='on'};
        void action(async()=>{await persist({...contents,notes:[...contents.notes,{commandId:crypto.randomUUID(),tenantId:contents.tenantId,actorId:contents.actorId,expectedVersion:0,
          occurredAt:new Date().toISOString(),text:`Attendance: ${attendance.firstName} ${attendance.lastName} — ${event.title}`,attendance,state:'local_saved'}]});setStatus('Attendance saved on this device; server delivery pending')});
      }}>
        <h2 className="font-bold">Host-device attendance capture</h2>
        <label className="block">Prepared event <select required value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">Choose an event</option>{contents.preparation.events.filter(e=>e.version).map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
        <label className="block">First name <input className="border" name="firstName" required maxLength={254}/></label>
        <label className="block">Last name <input className="border" name="lastName" required maxLength={254}/></label>
        <label className="block">Phone <input className="border" name="phone" required maxLength={254}/></label>
        <label className="block">Email <input className="border" name="email" type="email" maxLength={254}/></label>
        <label className="block"><input type="checkbox" required name="contactConsent"/> Visitor agrees to property-specific follow-up about this visit.</label>
        <label className="block"><input type="checkbox" name="marketingConsent"/> Visitor also agrees to marketing contact.</label>
        <button className="border p-2" disabled={busy}>Save attendance on this device</button>
      </form>}
      <form onSubmit={e => { e.preventDefault(); void action(async () => {
        if (!text.trim()) return
        await persist({ ...contents, notes: [...contents.notes, { commandId: crypto.randomUUID(), tenantId: contents.tenantId,
          actorId: contents.actorId, expectedVersion: 0, occurredAt: new Date().toISOString(), text, state: 'local_saved' }] })
        setText(''); setStatus('Saved on this device. Pending server delivery.')
      }) }}>
        <label>New private note<textarea className="border w-full p-2" maxLength={10000} value={text} onChange={e => setText(e.target.value)} /></label>
        <button disabled={busy} className="border p-2">Save on this device</button>
      </form>
      <button disabled={busy} className="border p-2" onClick={() => void action(synchronize)}>Sync with server</button>
      <p>Sync requires an active session for this account. Locking or signing out retains encrypted unsynced notes. Remove the device copy after delivery when it is no longer needed.</p>
      {contents.notes.map(note => <article key={note.commandId} className="border rounded p-3 space-y-2">
        <p className="whitespace-pre-wrap">{note.text}</p><p>{note.occurredAt} — {note.state.replace(/_/g, ' ')}</p>
        {note.error && <p>{note.error}</p>}
        {note.state === 'needs_review' && <button disabled={busy} className="underline" onClick={() => void action(async () => persist({ ...contents,
          notes: contents.notes.map(n => n.commandId === note.commandId ? { ...n, state: 'local_saved', error: undefined } : n) }))}>Keep note and retry after signing in</button>}
      </article>)}
      <button disabled={busy || contents.notes.some(n => n.state !== 'server_saved')} className="border p-2" onClick={() => void action(async () => {
        await removeVault(record!.id,record!.revision); lock(); setVaults(await listVaults())
      })}>Remove delivered notes from this device</button>
    </>}
    <p role="status">{status}</p>
  </Container>
}

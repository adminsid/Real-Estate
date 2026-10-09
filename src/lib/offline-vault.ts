export type NoteCommand = { commandId: string; tenantId: string; actorId: string; expectedVersion: 0;
  occurredAt: string; text: string; attendance?: { eventId: string; eventVersion: string; firstName: string; lastName: string; phone: string; email: string; consentContact: boolean; consentMarketing: boolean }; state: 'local_saved' | 'server_saved' | 'needs_review'; error?: string }
export type Preparation = {tenantId:string;actorId:string;fetchedAt:string;eventsState:string;
 contacts:{id:string;first_name:string;last_name:string;email:string;phone:string}[];
 tasks:{id:string;title:string;due_date:string;status:string}[];
 events:{id:string;title:string;address:string;start:string;end:string;version:string}[]}
export type VaultContents = { tenantId: string; actorId: string; notes: NoteCommand[]; preparation?: Preparation }
export type VaultRecord = { id: string; revision: number; salt: Uint8Array; iv: Uint8Array; ciphertext: ArrayBuffer }
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('workspace-offline-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('vaults', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function listVaults(): Promise<VaultRecord[]> {
  const db = await openDatabase()
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('vaults').objectStore('vaults').getAll()
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
  }) } finally { db.close() }
}
export async function vaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 310000, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function unlockVault(record: VaultRecord, key: CryptoKey): Promise<VaultContents> {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv), additionalData: new TextEncoder().encode(record.id) }, key, record.ciphertext)
  return JSON.parse(new TextDecoder().decode(bytes))
}
export async function storeVault(previous: VaultRecord, key: CryptoKey, contents: VaultContents): Promise<VaultRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(previous.id) }, key, new TextEncoder().encode(JSON.stringify(contents)))
  const next = { ...previous, revision: previous.revision + 1, iv, ciphertext }
  const db = await openDatabase()
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('vaults', 'readwrite'), store = tx.objectStore('vaults')
    const request = store.get(previous.id)
    request.onsuccess = () => {
      if ((request.result?.revision || 0) !== previous.revision) { tx.abort(); return }
      store.put(next)
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(new Error('Local vault changed in another tab; lock and unlock before retrying'))
    tx.onerror = () => reject(tx.error || new Error('Device storage unavailable'))
  }) } finally { db.close() }
  return next
}
export async function removeVault(id: string, expectedRevision: number): Promise<void> {
  const db = await openDatabase()
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('vaults', 'readwrite'), store=tx.objectStore('vaults'); const current=store.get(id)
    current.onsuccess=()=>{if(current.result?.revision!==expectedRevision){tx.abort();return}store.delete(id)}
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort=()=>reject(new Error('Vault changed; refresh before removing device data'))
  }) } finally { db.close() }
}
export async function replayNote(note: NoteCommand): Promise<NoteCommand> {
  if (note.state !== 'local_saved') return note
  try {
    const response = await fetch(note.attendance ? '/api/offline-attendance' : '/api/offline-notes', { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note), signal: AbortSignal.timeout(10000) })
    if (response.ok) {
      const ack = await response.json()
      if (ack.success === true && ack.state === 'server_saved' && ack.id === note.commandId) return { ...note, state: 'server_saved', error: undefined }
      return note
    }
    if ([400,401,403,409].includes(response.status)) return { ...note, state: 'needs_review', error: 'Sign in to the original account and review before retrying.' }
    return note
  } catch { return note }
}

import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
async function identity(parts: unknown[]) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)))
  return 'outline:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Build consequences for the caller's atomic deal batch. Existing canonical facts are never overwritten. */
export async function outlinePosting(db: D1Database, tenant: string, owner: string, deal: string, outline: Record<string, unknown>): Promise<D1PreparedStatement[]> {
  const writes: D1PreparedStatement[] = []
  const contacts = new Map<string,string>()
  for (const role of ['buyer','seller']) {
    const name = text(outline[role+'Name'])
    writes.push(db.prepare('DELETE FROM transaction_parties WHERE transaction_id=? AND tenant_id=? AND role=?').bind(deal,tenant,role))
    if (!name) continue
    const email = text(outline[role+'Email'])?.toLowerCase() || null
    const phone = text(outline[role+'Phone'])
    const generated = await identity([tenant, deal, role, name, email, phone])
    const existing = await db.prepare('SELECT id,assigned_to,is_active FROM contacts WHERE tenant_id=? AND (id=? OR (? IS NOT NULL AND lower(email)=?)) ORDER BY id LIMIT 1')
      .bind(tenant,generated,email,email).first<{id:string;assigned_to:string|null;is_active:number}>()
    if (existing && existing.is_active !== 1) throw Error('Inactive outline contact requires broker recovery')
    if (existing && existing.assigned_to !== owner) throw Error('Outline contact ownership requires broker review')
    const id = existing?.id || (email && contacts.get(email)) || generated
    if (!existing && !(email && contacts.has(email))) {
      const [first,...last] = name.split(/\s+/)
      writes.push(db.prepare(`INSERT OR IGNORE INTO contacts(id,tenant_id,assigned_to,first_name,last_name,email,phone,type,status,source,address,tags)
        VALUES(?,?,?,?,?,?,?,?,'active','deal_outline',?,?)`).bind(id,tenant,owner,first,last.join(' ')||'-',email,phone,role,text(outline[role+'Address']),JSON.stringify(['deal_outline'])))
    }
    if (email) contacts.set(email,id)
    writes.push(db.prepare('INSERT INTO transaction_parties(id,transaction_id,tenant_id,contact_id,role,is_primary) VALUES(?,?,?,?,?,1)')
      .bind(await identity([tenant,deal,role,id]),deal,tenant,id,role))
  }
  for (const role of ['buyerAttorney','sellerAttorney']) {
    const name=text(outline[role+'Name']); if(!name)continue
    const email=text(outline[role+'Email'])?.toLowerCase()||null
    const phone=text(outline[role+'Phone'])
    const id=await identity([tenant,deal,role,name,email,phone])
    const existing=await db.prepare('SELECT id FROM network_connections WHERE tenant_id=? AND created_by=? AND (id=? OR (? IS NOT NULL AND lower(email)=?)) LIMIT 1')
      .bind(tenant,owner,id,email,email).first()
    if(!existing)writes.push(db.prepare(`INSERT OR IGNORE INTO network_connections(id,tenant_id,created_by,name,title,email,phone,type,notes)
      VALUES(?,?,?,?,'Attorney',?,?,'attorney',?)`).bind(id,tenant,owner,name,email,phone,'Captured from deal outline'))
  }
  return writes
}

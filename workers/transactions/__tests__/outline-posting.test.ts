import { describe,it,expect } from 'vitest'
import { sqliteD1 } from './helpers/sqlite'
import { outlinePosting } from '../outline-posting'
function setup(){
 const result=sqliteD1()
 result.sqlite.exec(`CREATE TABLE contacts(id TEXT PRIMARY KEY,tenant_id TEXT,is_active INTEGER DEFAULT 1,assigned_to TEXT,first_name TEXT,last_name TEXT,email TEXT,phone TEXT,type TEXT,status TEXT,source TEXT,address TEXT,tags TEXT);
 CREATE TABLE transaction_parties(id TEXT PRIMARY KEY,transaction_id TEXT,tenant_id TEXT,contact_id TEXT REFERENCES contacts(id),role TEXT,is_primary INTEGER);
 CREATE TABLE network_connections(id TEXT PRIMARY KEY,tenant_id TEXT,created_by TEXT,name TEXT,title TEXT,email TEXT,phone TEXT,type TEXT,notes TEXT);`)
 return result
}
describe('atomic outline consequences',()=>{
 it('replays without duplicate people or replacing canonical names',async()=>{
  const {db,sqlite}=setup();const outline={buyerName:'Synthetic Buyer',buyerEmail:'buyer@example.com'}
  await db.batch(await outlinePosting(db,'tenant','agent','deal',outline))
  await db.batch(await outlinePosting(db,'tenant','agent','deal',{...outline,buyerName:'Changed snapshot'}))
  expect(sqlite.prepare('SELECT COUNT(*) n FROM contacts').get()?.n).toBe(1)
  expect(sqlite.prepare('SELECT first_name FROM contacts').get()?.first_name).toBe('Synthetic')
  expect(sqlite.prepare('SELECT COUNT(*) n FROM transaction_parties').get()?.n).toBe(1)
 })
 it('clears a removed buyer and refuses inactive canonical contacts',async()=>{
  const {db,sqlite}=setup();const outline={buyerName:'Synthetic Buyer',buyerEmail:'buyer@example.com'}
  await db.batch(await outlinePosting(db,'tenant','agent','deal',outline))
  await db.batch(await outlinePosting(db,'tenant','agent','deal',{buyerName:''}))
  expect(sqlite.prepare('SELECT COUNT(*) n FROM transaction_parties').get()?.n).toBe(0)
  sqlite.exec('UPDATE contacts SET is_active=0')
  await expect(outlinePosting(db,'tenant','agent','deal',outline)).rejects.toThrow('Inactive')
 })
 it('rolls back all outline records when a later batch statement fails',async()=>{
  const {db,sqlite}=setup()
  const writes=await outlinePosting(db,'tenant','agent','deal',{buyerName:'Synthetic Buyer',buyerAttorneyName:'Synthetic Attorney'})
  writes.push(db.prepare("INSERT INTO contacts(id) VALUES('collision')"),db.prepare("INSERT INTO contacts(id) VALUES('collision')"))
  await expect(db.batch(writes)).rejects.toThrow()
  expect(sqlite.prepare('SELECT COUNT(*) n FROM contacts').get()?.n).toBe(0)
  expect(sqlite.prepare('SELECT COUNT(*) n FROM transaction_parties').get()?.n).toBe(0)
  expect(sqlite.prepare('SELECT COUNT(*) n FROM network_connections').get()?.n).toBe(0)
 })
 it('does not transfer a different owner’s contact through an outline',async()=>{
  const {db,sqlite}=setup();sqlite.exec("INSERT INTO contacts(id,tenant_id,assigned_to,email) VALUES('existing','tenant','other','buyer@example.com')")
  await expect(outlinePosting(db,'tenant','agent','deal',{buyerName:'Buyer',buyerEmail:'buyer@example.com'})).rejects.toThrow('ownership')
 })
})
